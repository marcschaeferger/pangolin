import { sendToClient } from "#dynamic/routers/ws";
import { db, olms, Transaction } from "@server/db";
import { canCompress } from "@server/lib/clientVersionChecks";
import { Alias, SubnetProxyTarget } from "@server/lib/ip";
import logger from "@server/logger";
import { eq } from "drizzle-orm";

export async function addTargets(
    newtId: string,
    targets: SubnetProxyTarget[],
    version?: string | null
) {
    await sendToClient(
        newtId,
        {
            type: `newt/wg/targets/add`,
            data: targets
        },
        { incrementConfigVersion: true, compress: canCompress(version, "newt") }
    );
}

export async function removeTargets(
    newtId: string,
    targets: SubnetProxyTarget[],
    version?: string | null
) {
    await sendToClient(
        newtId,
        {
            type: `newt/wg/targets/remove`,
            data: targets
        },
        { incrementConfigVersion: true, compress: canCompress(version, "newt") }
    );
}

export async function updateTargets(
    newtId: string,
    targets: {
        oldTargets: SubnetProxyTarget[];
        newTargets: SubnetProxyTarget[];
    },
    version?: string | null
) {
    await sendToClient(
        newtId,
        {
            type: `newt/wg/targets/update`,
            data: {
                oldTargets: targets.oldTargets,
                newTargets: targets.newTargets
            }
        },
        { incrementConfigVersion: true, compress: canCompress(version, "newt") }
    ).catch((error) => {
        logger.warn(`Error sending message:`, error);
    });
}

export async function addPeerData(
    clientId: number,
    siteId: number,
    remoteSubnets: string[],
    aliases: Alias[],
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
            type: `olm/wg/peer/data/add`,
            data: {
                siteId: siteId,
                remoteSubnets: remoteSubnets,
                aliases: aliases
            }
        },
        { incrementConfigVersion: true, compress: canCompress(version, "olm") }
    ).catch((error) => {
        logger.warn(`Error sending message:`, error);
    });
}

export async function removePeerData(
    clientId: number,
    siteId: number,
    remoteSubnets: string[],
    aliases: Alias[],
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
            type: `olm/wg/peer/data/remove`,
            data: {
                siteId: siteId,
                remoteSubnets: remoteSubnets,
                aliases: aliases
            }
        },
        { incrementConfigVersion: true, compress: canCompress(version, "olm") }
    ).catch((error) => {
        logger.warn(`Error sending message:`, error);
    });
}

export async function updatePeerData(
    clientId: number,
    siteId: number,
    remoteSubnets:
        | {
              oldRemoteSubnets: string[];
              newRemoteSubnets: string[];
          }
        | undefined,
    aliases:
        | {
              oldAliases: Alias[];
              newAliases: Alias[];
          }
        | undefined,
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
            type: `olm/wg/peer/data/update`,
            data: {
                siteId: siteId,
                ...remoteSubnets,
                ...aliases
            }
        },
        { incrementConfigVersion: true, compress: canCompress(version, "olm") }
    ).catch((error) => {
        logger.warn(`Error sending message:`, error);
    });
}
