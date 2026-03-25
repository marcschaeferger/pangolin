import { NextFunction, Request, Response } from "express";
import { db, siteProvisioningKeyOrg, siteProvisioningKeys } from "@server/db";
import HttpCode from "@server/types/HttpCode";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import createHttpError from "http-errors";
import response from "@server/lib/response";
import moment from "moment";
import {
    generateId,
    generateIdFromEntropySize
} from "@server/auth/sessions/app";
import logger from "@server/logger";
import { hashPassword } from "@server/auth/password";

const paramsSchema = z.object({
    orgId: z.string().nonempty()
});

const bodySchema = z.strictObject({
    name: z.string().min(1).max(255)
});

export type CreateSiteProvisioningKeyBody = z.infer<typeof bodySchema>;

export type CreateSiteProvisioningKeyResponse = {
    siteProvisioningKeyId: string;
    orgId: string;
    name: string;
    siteProvisioningKey: string;
    lastChars: string;
    createdAt: string;
};

export async function createSiteProvisioningKey(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedParams.error).toString()
            )
        );
    }

    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const { orgId } = parsedParams.data;
    const { name } = parsedBody.data;

    const siteProvisioningKeyId = `spk-${generateId(15)}`;
    const siteProvisioningKey = generateIdFromEntropySize(25);
    const siteProvisioningKeyHash = await hashPassword(siteProvisioningKey);
    const lastChars = siteProvisioningKey.slice(-4);
    const createdAt = moment().toISOString();

    await db.transaction(async (trx) => {
        await trx.insert(siteProvisioningKeys).values({
            siteProvisioningKeyId,
            name,
            siteProvisioningKeyHash,
            createdAt,
            lastChars
        });

        await trx.insert(siteProvisioningKeyOrg).values({
            siteProvisioningKeyId,
            orgId
        });
    });

    try {
        return response<CreateSiteProvisioningKeyResponse>(res, {
            data: {
                siteProvisioningKeyId,
                orgId,
                name,
                siteProvisioningKey,
                lastChars,
                createdAt
            },
            success: true,
            error: false,
            message: "Site provisioning key created",
            status: HttpCode.CREATED
        });
    } catch (e) {
        logger.error(e);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to create site provisioning key"
            )
        );
    }
}
