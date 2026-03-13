import { Request, Response, NextFunction } from "express";
import { eq, sql } from "drizzle-orm";
import { sites } from "@server/db";
import { db } from "@server/db";
import logger from "@server/logger";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import response from "@server/lib/response";
import { usageService } from "@server/lib/billing/usageService";
import { FeatureId } from "@server/lib/billing/features";
import { checkExitNodeOrg } from "#dynamic/lib/exitNodes";
import { build } from "@server/build";

interface PeerBandwidth {
    publicKey: string;
    bytesIn: number;
    bytesOut: number;
}

interface AccumulatorEntry {
    bytesIn: number;
    bytesOut: number;
    /** Present when the update came through a remote exit node. */
    exitNodeId?: number;
    /** Whether to record egress usage for billing purposes. */
    calcUsage: boolean;
}

// Retry configuration for deadlock handling
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 50;

// How often to flush accumulated bandwidth data to the database
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds

// In-memory accumulator: publicKey -> AccumulatorEntry
let accumulator = new Map<string, AccumulatorEntry>();

/**
 * Check if an error is a deadlock error
 */
function isDeadlockError(error: any): boolean {
    return (
        error?.code === "40P01" ||
        error?.cause?.code === "40P01" ||
        (error?.message && error.message.includes("deadlock"))
    );
}

/**
 * Execute a function with retry logic for deadlock handling
 */
async function withDeadlockRetry<T>(
    operation: () => Promise<T>,
    context: string
): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await operation();
        } catch (error: any) {
            if (isDeadlockError(error) && attempt < MAX_RETRIES) {
                attempt++;
                const baseDelay = Math.pow(2, attempt - 1) * BASE_DELAY_MS;
                const jitter = Math.random() * baseDelay;
                const delay = baseDelay + jitter;
                logger.warn(
                    `Deadlock detected in ${context}, retrying attempt ${attempt}/${MAX_RETRIES} after ${delay.toFixed(0)}ms`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
}

/**
 * Flush all accumulated site bandwidth data to the database.
 *
 * Swaps out the accumulator before writing so that any bandwidth messages
 * received during the flush are captured in the new accumulator rather than
 * being lost or causing contention. Entries that fail to write are re-queued
 * back into the accumulator so they will be retried on the next flush.
 *
 * This function is exported so that the application's graceful-shutdown
 * cleanup handler can call it before the process exits.
 */
export async function flushSiteBandwidthToDb(): Promise<void> {
    if (accumulator.size === 0) {
        return;
    }

    // Atomically swap out the accumulator so new data keeps flowing in
    // while we write the snapshot to the database.
    const snapshot = accumulator;
    accumulator = new Map<string, AccumulatorEntry>();

    const currentTime = new Date().toISOString();

    // Sort by publicKey for consistent lock ordering across concurrent
    // writers — deadlock-prevention strategy.
    const sortedEntries = [...snapshot.entries()].sort(([a], [b]) =>
        a.localeCompare(b)
    );

    logger.debug(
        `Flushing accumulated bandwidth data for ${sortedEntries.length} site(s) to the database`
    );

    // Aggregate billing usage by org, collected during the DB update loop.
    const orgUsageMap = new Map<string, number>();

    for (const [publicKey, { bytesIn, bytesOut, exitNodeId, calcUsage }] of sortedEntries) {
        try {
            const updatedSite = await withDeadlockRetry(async () => {
                const [result] = await db
                    .update(sites)
                    .set({
                        megabytesOut: sql`COALESCE(${sites.megabytesOut}, 0) + ${bytesIn}`,
                        megabytesIn: sql`COALESCE(${sites.megabytesIn}, 0) + ${bytesOut}`,
                        lastBandwidthUpdate: currentTime
                    })
                    .where(eq(sites.pubKey, publicKey))
                    .returning({
                        orgId: sites.orgId,
                        siteId: sites.siteId
                    });
                return result;
            }, `flush bandwidth for site ${publicKey}`);

            if (updatedSite) {
                if (exitNodeId) {
                    const notAllowed = await checkExitNodeOrg(
                        exitNodeId,
                        updatedSite.orgId
                    );
                    if (notAllowed) {
                        logger.warn(
                            `Exit node ${exitNodeId} is not allowed for org ${updatedSite.orgId}`
                        );
                        // Skip usage tracking for this site but continue
                        // processing the rest.
                        continue;
                    }
                }

                if (calcUsage) {
                    const totalBandwidth = bytesIn + bytesOut;
                    const current = orgUsageMap.get(updatedSite.orgId) ?? 0;
                    orgUsageMap.set(updatedSite.orgId, current + totalBandwidth);
                }
            }
        } catch (error) {
            logger.error(
                `Failed to flush bandwidth for site ${publicKey}:`,
                error
            );

            // Re-queue the failed entry so it is retried on the next flush
            // rather than silently dropped.
            const existing = accumulator.get(publicKey);
            if (existing) {
                existing.bytesIn += bytesIn;
                existing.bytesOut += bytesOut;
            } else {
                accumulator.set(publicKey, {
                    bytesIn,
                    bytesOut,
                    exitNodeId,
                    calcUsage
                });
            }
        }
    }

    // Process billing usage updates outside the site-update loop to keep
    // lock scope small and concerns separated.
    if (orgUsageMap.size > 0) {
        // Sort org IDs for consistent lock ordering.
        const sortedOrgIds = [...orgUsageMap.keys()].sort();

        for (const orgId of sortedOrgIds) {
            try {
                const totalBandwidth = orgUsageMap.get(orgId)!;
                const bandwidthUsage = await usageService.add(
                    orgId,
                    FeatureId.EGRESS_DATA_MB,
                    totalBandwidth
                );
                if (bandwidthUsage) {
                    // Fire-and-forget — don't block the flush on limit checking.
                    usageService
                        .checkLimitSet(
                            orgId,
                            FeatureId.EGRESS_DATA_MB,
                            bandwidthUsage
                        )
                        .catch((error: any) => {
                            logger.error(
                                `Error checking bandwidth limits for org ${orgId}:`,
                                error
                            );
                        });
                }
            } catch (error) {
                logger.error(
                    `Error processing usage for org ${orgId}:`,
                    error
                );
                // Continue with other orgs.
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Periodic flush timer
// ---------------------------------------------------------------------------

const flushTimer = setInterval(async () => {
    try {
        await flushSiteBandwidthToDb();
    } catch (error) {
        logger.error(
            "Unexpected error during periodic site bandwidth flush:",
            error
        );
    }
}, FLUSH_INTERVAL_MS);

// Allow the process to exit normally even while the timer is pending.
// The graceful-shutdown path (see server/cleanup.ts) will call
// flushSiteBandwidthToDb() explicitly before process.exit(), so no data
// is lost.
flushTimer.unref();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Accumulate bandwidth data reported by a gerbil or remote exit node.
 *
 * Only peers that actually transferred data (bytesIn > 0) are added to the
 * accumulator; peers with no activity are silently ignored, which means the
 * flush will only write rows that have genuinely changed.
 *
 * The function is intentionally synchronous in its fast path so that the
 * HTTP handler can respond immediately without waiting for any I/O.
 */
export async function updateSiteBandwidth(
    bandwidthData: PeerBandwidth[],
    calcUsageAndLimits: boolean,
    exitNodeId?: number
): Promise<void> {
    for (const { publicKey, bytesIn, bytesOut } of bandwidthData) {
        // Skip peers that haven't transferred any data — writing zeros to the
        // database would be a no-op anyway.
        if (bytesIn <= 0 && bytesOut <= 0) {
            continue;
        }

        const existing = accumulator.get(publicKey);
        if (existing) {
            existing.bytesIn += bytesIn;
            existing.bytesOut += bytesOut;
            // Retain the most-recent exitNodeId for this peer.
            if (exitNodeId !== undefined) {
                existing.exitNodeId = exitNodeId;
            }
            // Once calcUsage has been requested for a peer, keep it set for
            // the lifetime of this flush window.
            if (calcUsageAndLimits) {
                existing.calcUsage = true;
            }
        } else {
            accumulator.set(publicKey, {
                bytesIn,
                bytesOut,
                exitNodeId,
                calcUsage: calcUsageAndLimits
            });
        }
    }
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export const receiveBandwidth = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> => {
    try {
        const bandwidthData: PeerBandwidth[] = req.body;

        if (!Array.isArray(bandwidthData)) {
            throw new Error("Invalid bandwidth data");
        }

        // Accumulate in memory; the periodic timer (and the shutdown hook)
        // will write to the database.
        await updateSiteBandwidth(bandwidthData, build == "saas");

        return response(res, {
            data: {},
            success: true,
            error: false,
            message: "Bandwidth data updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("Error updating bandwidth data:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred..."
            )
        );
    }
};