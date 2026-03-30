import { sendToClient } from "#dynamic/routers/ws";
import { clientSitesAssociationsCache, db, olms } from "@server/db";
import { canCompress } from "@server/lib/clientVersionChecks";
import config from "@server/lib/config";
import logger from "@server/logger";
import { and, eq } from "drizzle-orm";
import { Alias } from "yaml";

export async function addPeer(
    clientId: number,
    peer: {
        siteId: number;
        name: string;
        publicKey: string;
        endpoint: string;
        relayEndpoint: string;
        serverIP: string | null;
        serverPort: number | null;
        remoteSubnets: string[] | null; // optional, comma-separated list of subnets that this site can access
        aliases: Alias[];
    },
    olmId?: string,
    version?: string | null
) {
    if (!olmId) {
        const [olm] = await db
            .select()
            .from(olms)
            .where(eq(olms.clientId, clientId))
            .limit(1);
        if (!olm) {
            return; // ignore this because an olm might not be associated with the client anymore
        }
        olmId = olm.olmId;
        version = olm.version;
    }

    await sendToClient(
        olmId,
        {
            type: "olm/wg/peer/add",
            data: {
                siteId: peer.siteId,
                name: peer.name,
                publicKey: peer.publicKey,
                endpoint: peer.endpoint,
                relayEndpoint: peer.relayEndpoint,
                serverIP: peer.serverIP,
                serverPort: peer.serverPort,
                remoteSubnets: peer.remoteSubnets, // optional, comma-separated list of subnets that this site can access
                aliases: peer.aliases
            }
        },
        { incrementConfigVersion: true, compress: canCompress(version, "olm") }
    ).catch((error) => {
        logger.warn(`Error sending message:`, error);
    });

    logger.info(`Added peer ${peer.publicKey} to olm ${olmId}`);
}

export async function deletePeer(
    clientId: number,
    siteId: number,
    publicKey: string,
    olmId?: string,
    version?: string | null
) {
    if (!olmId) {
        const [olm] = await db
            .select()
            .from(olms)
            .where(eq(olms.clientId, clientId))
            .limit(1);
        if (!olm) {
            return;
        }
        olmId = olm.olmId;
        version = olm.version;
    }

    await sendToClient(
        olmId,
        {
            type: "olm/wg/peer/remove",
            data: {
                publicKey,
                siteId: siteId
            }
        },
        { incrementConfigVersion: true, compress: canCompress(version, "olm") }
    ).catch((error) => {
        logger.warn(`Error sending message:`, error);
    });

    logger.info(`Deleted peer ${publicKey} from olm ${olmId}`);
}

export async function updatePeer(
    clientId: number,
    peer: {
        siteId: number;
        publicKey: string;
        endpoint: string;
        relayEndpoint?: string;
        serverIP?: string | null;
        serverPort?: number | null;
        remoteSubnets?: string[] | null; // optional, comma-separated list of subnets that
        aliases?: Alias[] | null;
    },
    olmId?: string,
    version?: string | null
) {
    if (!olmId) {
        const [olm] = await db
            .select()
            .from(olms)
            .where(eq(olms.clientId, clientId))
            .limit(1);
        if (!olm) {
            return;
        }
        olmId = olm.olmId;
        version = olm.version;
    }

    await sendToClient(
        olmId,
        {
            type: "olm/wg/peer/update",
            data: {
                siteId: peer.siteId,
                publicKey: peer.publicKey,
                endpoint: peer.endpoint,
                relayEndpoint: peer.relayEndpoint,
                serverIP: peer.serverIP,
                serverPort: peer.serverPort,
                remoteSubnets: peer.remoteSubnets,
                aliases: peer.aliases
            }
        },
        { incrementConfigVersion: true, compress: canCompress(version, "olm") }
    ).catch((error) => {
        logger.warn(`Error sending message:`, error);
    });

    logger.info(`Updated peer ${peer.publicKey} on olm ${olmId}`);
}

export async function initPeerAddHandshake(
    clientId: number,
    peer: {
        siteId: number;
        exitNode: {
            publicKey: string;
            endpoint: string;
        };
    },
    olmId?: string,
    chainId?: string
) {
    if (!olmId) {
        const [olm] = await db
            .select()
            .from(olms)
            .where(eq(olms.clientId, clientId))
            .limit(1);
        if (!olm) {
            return;
        }
        olmId = olm.olmId;
    }

    await sendToClient(
        olmId,
        {
            type: "olm/wg/peer/holepunch/site/add",
            data: {
                siteId: peer.siteId,
                exitNode: {
                    publicKey: peer.exitNode.publicKey,
                    relayPort: config.getRawConfig().gerbil.clients_start_port,
                    endpoint: peer.exitNode.endpoint
                },
                chainId
            }
        },
        { incrementConfigVersion: true }
    ).catch((error) => {
        logger.warn(`Error sending message:`, error);
    });

    // update the clientSiteAssociationsCache to make the isJitMode flag false so that JIT mode is disabled for this site if it restarts or something after the connection
    await db
        .update(clientSitesAssociationsCache)
        .set({ isJitMode: false })
        .where(
            and(
                eq(clientSitesAssociationsCache.clientId, clientId),
                eq(clientSitesAssociationsCache.siteId, peer.siteId)
            )
        );

    logger.info(
        `Initiated peer add handshake for site ${peer.siteId} to olm ${olmId}`
    );
}
