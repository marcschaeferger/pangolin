import {
    db,
    siteProvisioningKeyOrg,
    siteProvisioningKeys
} from "@server/db";
import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";
import response from "@server/lib/response";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import { eq } from "drizzle-orm";

const paramsSchema = z.object({
    orgId: z.string().nonempty()
});

const querySchema = z.object({
    limit: z
        .string()
        .optional()
        .default("1000")
        .transform(Number)
        .pipe(z.int().positive()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.int().nonnegative())
});

function querySiteProvisioningKeys(orgId: string) {
    return db
        .select({
            siteProvisioningKeyId:
                siteProvisioningKeys.siteProvisioningKeyId,
            orgId: siteProvisioningKeyOrg.orgId,
            lastChars: siteProvisioningKeys.lastChars,
            createdAt: siteProvisioningKeys.createdAt,
            name: siteProvisioningKeys.name
        })
        .from(siteProvisioningKeyOrg)
        .innerJoin(
            siteProvisioningKeys,
            eq(
                siteProvisioningKeys.siteProvisioningKeyId,
                siteProvisioningKeyOrg.siteProvisioningKeyId
            )
        )
        .where(eq(siteProvisioningKeyOrg.orgId, orgId));
}

export type ListSiteProvisioningKeysResponse = {
    siteProvisioningKeys: Awaited<
        ReturnType<typeof querySiteProvisioningKeys>
    >;
    pagination: { total: number; limit: number; offset: number };
};

export async function listSiteProvisioningKeys(
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
                    fromError(parsedParams.error)
                )
            );
        }

        const parsedQuery = querySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error)
                )
            );
        }

        const { orgId } = parsedParams.data;
        const { limit, offset } = parsedQuery.data;

        const siteProvisioningKeysList = await querySiteProvisioningKeys(orgId)
            .limit(limit)
            .offset(offset);

        return response<ListSiteProvisioningKeysResponse>(res, {
            data: {
                siteProvisioningKeys: siteProvisioningKeysList,
                pagination: {
                    total: siteProvisioningKeysList.length,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Site provisioning keys retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
