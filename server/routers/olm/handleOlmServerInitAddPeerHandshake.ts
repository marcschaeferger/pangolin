import {
    clientSiteResourcesAssociationsCache,
    clientSitesAssociationsCache,
    db,
    exitNodes,
    Site,
    siteResources
} from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import { clients, Olm, sites } from "@server/db";
import { and, eq, or } from "drizzle-orm";
import logger from "@server/logger";
import { initPeerAddHandshake } from "./peers";

export const handleOlmServerInitAddPeerHandshake: MessageHandler = async (
    context
) => {
    logger.info("Handling register olm message!");
    const { message, client: c, sendToClient } = context;
    const olm = c as Olm;

    if (!olm) {
        logger.warn("Olm not found");
        return;
    }

    if (!olm.clientId) {
        logger.warn("Olm has no client!"); // TODO: Maybe we create the site here?
        return;
    }

    const clientId = olm.clientId;

    const [client] = await db
        .select()
        .from(clients)
        .where(eq(clients.clientId, clientId))
        .limit(1);

    if (!client) {
        logger.warn("Client not found");
        return;
    }

    const { siteId, resourceId, chainId } = message.data;

    let site: Site | null = null;
    if (siteId) {
        // get the site
        const [siteRes] = await db
            .select()
            .from(sites)
            .where(eq(sites.siteId, siteId))
            .limit(1);
        if (siteRes) {
            site = siteRes;
        }
    }

    if (resourceId && !site) {
        const resources = await db
            .select()
            .from(siteResources)
            .where(
                and(
                    or(
                        eq(siteResources.niceId, resourceId),
                        eq(siteResources.alias, resourceId)
                    ),
                    eq(siteResources.orgId, client.orgId)
                )
            );

        if (!resources || resources.length === 0) {
            logger.error(`handleOlmServerPeerAddMessage: Resource not found`);
            // cancel the request from the olm side to not keep doing this
            await sendToClient(
                olm.olmId,
                {
                    type: "olm/wg/peer/chain/cancel",
                    data: {
                        chainId
                    }
                },
                { incrementConfigVersion: false }
            ).catch((error) => {
                logger.warn(`Error sending message:`, error);
            });
            return;
        }

        if (resources.length > 1) {
            // error but this should not happen because the nice id cant contain a dot and the alias has to have a dot and both have to be unique within the org so there should never be multiple matches
            logger.error(
                `handleOlmServerPeerAddMessage: Multiple resources found matching the criteria`
            );
            return;
        }

        const resource = resources[0];

        const currentResourceAssociationCaches = await db
            .select()
            .from(clientSiteResourcesAssociationsCache)
            .where(
                and(
                    eq(
                        clientSiteResourcesAssociationsCache.siteResourceId,
                        resource.siteResourceId
                    ),
                    eq(
                        clientSiteResourcesAssociationsCache.clientId,
                        client.clientId
                    )
                )
            );

        if (currentResourceAssociationCaches.length === 0) {
            logger.error(
                `handleOlmServerPeerAddMessage: Client ${client.clientId} does not have access to resource ${resource.siteResourceId}`
            );
            // cancel the request from the olm side to not keep doing this
            await sendToClient(
                olm.olmId,
                {
                    type: "olm/wg/peer/chain/cancel",
                    data: {
                        chainId
                    }
                },
                { incrementConfigVersion: false }
            ).catch((error) => {
                logger.warn(`Error sending message:`, error);
            });
            return;
        }

        const siteIdFromResource = resource.siteId;

        // get the site
        const [siteRes] = await db
            .select()
            .from(sites)
            .where(eq(sites.siteId, siteIdFromResource));
        if (!siteRes) {
            logger.error(
                `handleOlmServerPeerAddMessage: Site with ID ${site} not found`
            );
            return;
        }

        site = siteRes;
    }

    if (!site) {
        logger.error(`handleOlmServerPeerAddMessage: Site not found`);
        return;
    }

    // check if the client can access this site using the cache
    const currentSiteAssociationCaches = await db
        .select()
        .from(clientSitesAssociationsCache)
        .where(
            and(
                eq(clientSitesAssociationsCache.clientId, client.clientId),
                eq(clientSitesAssociationsCache.siteId, site.siteId)
            )
        );

    if (currentSiteAssociationCaches.length === 0) {
        logger.error(
            `handleOlmServerPeerAddMessage: Client ${client.clientId} does not have access to site ${site.siteId}`
        );
        // cancel the request from the olm side to not keep doing this
        await sendToClient(
            olm.olmId,
            {
                type: "olm/wg/peer/chain/cancel",
                data: {
                    chainId
                }
            },
            { incrementConfigVersion: false }
        ).catch((error) => {
            logger.warn(`Error sending message:`, error);
        });
        return;
    }

    if (!site.exitNodeId) {
        logger.error(
            `handleOlmServerPeerAddMessage: Site with ID ${site.siteId} has no exit node`
        );
        // cancel the request from the olm side to not keep doing this
        await sendToClient(
            olm.olmId,
            {
                type: "olm/wg/peer/chain/cancel",
                data: {
                    chainId
                }
            },
            { incrementConfigVersion: false }
        ).catch((error) => {
            logger.warn(`Error sending message:`, error);
        });
        return;
    }

    // get the exit node from the side
    const [exitNode] = await db
        .select()
        .from(exitNodes)
        .where(eq(exitNodes.exitNodeId, site.exitNodeId));

    if (!exitNode) {
        logger.error(
            `handleOlmServerPeerAddMessage: Site with ID ${site.siteId} has no exit node`
        );
        return;
    }

    // also trigger the peer add handshake in case the peer was not already added to the olm and we need to hole punch
    // if it has already been added this will be a no-op
    await initPeerAddHandshake(
        // this will kick off the add peer process for the client
        client.clientId,
        {
            siteId: site.siteId,
            exitNode: {
                publicKey: exitNode.publicKey,
                endpoint: exitNode.endpoint
            }
        },
        olm.olmId,
        chainId
    );

    return;
};
