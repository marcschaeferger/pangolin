/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { eventStreamingDestinations } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { and, eq } from "drizzle-orm";
import { parse } from "zod/v4/core";

const paramsSchema = z
    .object({
        orgId: z.string().nonempty(),
        destinationId: z.coerce.number<number>()
    })
    .strict();

const bodySchema = z.strictObject({
    type: z.string().optional(),
    config: z.string().optional(),
    enabled: z.boolean().optional(),
    sendConnectionLogs: z.boolean().optional().default(false),
    sendRequestLogs: z.boolean().optional().default(false),
    sendActionLogs: z.boolean().optional().default(false),
    sendAccessLogs: z.boolean().optional().default(false)
});

export type UpdateEventStreamingDestinationResponse = {
    destinationId: number;
};

registry.registerPath({
    method: "post",
    path: "/org/{orgId}/event-streaming-destination/{destinationId}",
    description: "Update an event streaming destination for a specific organization.",
    tags: [OpenAPITags.Org],
    request: {
        params: paramsSchema,
        body: {
            content: {
                "application/json": {
                    schema: bodySchema
                }
            }
        }
    },
    responses: {}
});

export async function updateEventStreamingDestination(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { orgId, destinationId } = parsedParams.data;

        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const [existing] = await db
            .select()
            .from(eventStreamingDestinations)
            .where(
                and(
                    eq(eventStreamingDestinations.destinationId, destinationId),
                    eq(eventStreamingDestinations.orgId, orgId)
                )
            );

        if (!existing) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "Event streaming destination not found"
                )
            );
        }

        const updateData = parsedBody.data;

        await db
            .update(eventStreamingDestinations)
            .set(updateData)
            .where(
                and(
                    eq(eventStreamingDestinations.destinationId, destinationId),
                    eq(eventStreamingDestinations.orgId, orgId)
                )
            );


        return response<UpdateEventStreamingDestinationResponse>(res, {
            data: {
                destinationId
            },
            success: true,
            error: false,
            message: "Event streaming destination updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
