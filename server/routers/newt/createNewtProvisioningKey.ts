import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { newtProvisioningKeys, orgs } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { eq } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import {
    generateId,
    generateIdFromEntropySize
} from "@server/auth/sessions/app";
import { hashPassword } from "@server/auth/password";
import moment from "moment";

const paramsSchema = z.object({
    orgId: z.string().nonempty()
});

const bodySchema = z.object({
    expiresAt: z.number().int().positive().optional() // optional Unix timestamp (ms)
});

export type CreateNewtProvisioningKeyBody = z.infer<typeof bodySchema>;

export type CreateNewtProvisioningKeyResponse = {
    provisioningKeyId: string;
    provisioningKey: string; // returned only once: "id.secret"
    lastChars: string;
    createdAt: string;
    expiresAt: number | null;
};

export async function createNewtProvisioningKey(
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
        const { expiresAt } = parsedBody.data;

        // Verify org exists
        const [org] = await db.select().from(orgs).where(eq(orgs.orgId, orgId));
        if (!org) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, `Organization with ID ${orgId} not found`)
            );
        }

        const provisioningKeyId = generateId(15);
        const secret = generateIdFromEntropySize(25);
        const keyHash = await hashPassword(secret);
        const lastChars = secret.slice(-4);
        const createdAt = moment().toISOString();
        const provisioningKey = `${provisioningKeyId}.${secret}`;

        await db.insert(newtProvisioningKeys).values({
            provisioningKeyId,
            orgId,
            keyHash,
            lastChars,
            createdAt,
            expiresAt: expiresAt ?? null
        });

        return response<CreateNewtProvisioningKeyResponse>(res, {
            data: {
                provisioningKeyId,
                provisioningKey,
                lastChars,
                createdAt,
                expiresAt: expiresAt ?? null
            },
            success: true,
            error: false,
            message: "Provisioning key created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
