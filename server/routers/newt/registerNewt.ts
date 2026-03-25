import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import {
    newtProvisioningKeys,
    newts,
    orgs,
    roles,
    roleSites,
    sites
} from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { eq, and } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import { verifyPassword, hashPassword } from "@server/auth/password";
import {
    generateId,
    generateIdFromEntropySize
} from "@server/auth/sessions/app";
import { getUniqueSiteName } from "@server/db/names";
import moment from "moment";
import { build } from "@server/build";
import { usageService } from "@server/lib/billing/usageService";
import { FeatureId } from "@server/lib/billing";

const bodySchema = z.object({
    provisioningKey: z.string().nonempty()
});

export type RegisterNewtBody = z.infer<typeof bodySchema>;

export type RegisterNewtResponse = {
    newtId: string;
    secret: string;
};

export async function registerNewt(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { provisioningKey } = parsedBody.data;

        // Keys are in the format "id.secret"
        const dotIndex = provisioningKey.indexOf(".");
        if (dotIndex === -1) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Invalid provisioning key format"
                )
            );
        }

        const provisioningKeyId = provisioningKey.substring(0, dotIndex);
        const provisioningKeySecret = provisioningKey.substring(dotIndex + 1);

        // Look up the provisioning key by ID
        const [keyRecord] = await db
            .select()
            .from(newtProvisioningKeys)
            .where(
                eq(newtProvisioningKeys.provisioningKeyId, provisioningKeyId)
            )
            .limit(1);

        if (!keyRecord) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "Invalid provisioning key")
            );
        }

        // Verify the secret
        const validSecret = await verifyPassword(
            provisioningKeySecret,
            keyRecord.keyHash
        );
        if (!validSecret) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "Invalid provisioning key")
            );
        }

        // Check if key has already been used
        if (keyRecord.siteId !== null) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    "Provisioning key has already been used"
                )
            );
        }

        // Check expiry
        if (keyRecord.expiresAt !== null && keyRecord.expiresAt < Date.now()) {
            return next(
                createHttpError(HttpCode.GONE, "Provisioning key has expired")
            );
        }

        const { orgId } = keyRecord;

        // Verify the org exists
        const [org] = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId));
        if (!org) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Organization not found")
            );
        }

        // SaaS billing check
        if (build == "saas") {
            const usage = await usageService.getUsage(orgId, FeatureId.SITES);
            if (!usage) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        "No usage data found for this organization"
                    )
                );
            }
            const rejectSites = await usageService.checkLimitSet(
                orgId,
                FeatureId.SITES,
                {
                    ...usage,
                    instantaneousValue: (usage.instantaneousValue || 0) + 1
                }
            );
            if (rejectSites) {
                return next(
                    createHttpError(
                        HttpCode.FORBIDDEN,
                        "Site limit exceeded. Please upgrade your plan."
                    )
                );
            }
        }

        const niceId = await getUniqueSiteName(orgId);
        const newtId = generateId(15);
        const newtSecret = generateIdFromEntropySize(25);
        const secretHash = await hashPassword(newtSecret);

        let newSiteId: number | undefined;

        await db.transaction(async (trx) => {
            // Create the site (type "newt", name = niceId)
            const [newSite] = await trx
                .insert(sites)
                .values({
                    orgId,
                    name: niceId,
                    niceId,
                    type: "newt",
                    dockerSocketEnabled: true
                })
                .returning();

            newSiteId = newSite.siteId;

            // Grant admin role access to the new site
            const [adminRole] = await trx
                .select()
                .from(roles)
                .where(and(eq(roles.isAdmin, true), eq(roles.orgId, orgId)))
                .limit(1);

            if (!adminRole) {
                throw new Error(`Admin role not found for org ${orgId}`);
            }

            await trx.insert(roleSites).values({
                roleId: adminRole.roleId,
                siteId: newSite.siteId
            });

            // Create the newt for this site
            await trx.insert(newts).values({
                newtId,
                secretHash,
                siteId: newSite.siteId,
                dateCreated: moment().toISOString()
            });

            // Mark the provisioning key as used
            await trx
                .update(newtProvisioningKeys)
                .set({ siteId: newSite.siteId })
                .where(
                    eq(
                        newtProvisioningKeys.provisioningKeyId,
                        provisioningKeyId
                    )
                );

            await usageService.add(orgId, FeatureId.SITES, 1, trx);
        });

        logger.info(
            `Provisioned new site (ID: ${newSiteId}) and newt (ID: ${newtId}) for org ${orgId} via provisioning key ${provisioningKeyId}`
        );

        return response<RegisterNewtResponse>(res, {
            data: {
                newtId,
                secret: newtSecret
            },
            success: true,
            error: false,
            message: "Newt registered successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred"
            )
        );
    }
}