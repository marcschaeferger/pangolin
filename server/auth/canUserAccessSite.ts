import { db, roleSites, userSites } from "@server/db";
import { and, eq, inArray } from "drizzle-orm";

export async function canUserAccessSite({
    userId,
    siteId,
    roleIds
}: {
    userId: string;
    siteId: number;
    roleIds: number[];
}): Promise<boolean> {
    const roleSiteAccess =
        roleIds.length > 0
            ? await db
                  .select()
                  .from(roleSites)
                  .where(
                      and(
                          eq(roleSites.siteId, siteId),
                          inArray(roleSites.roleId, roleIds)
                      )
                  )
                  .limit(1)
            : [];

    if (roleSiteAccess.length > 0) {
        return true;
    }

    const userSiteAccess = await db
        .select()
        .from(userSites)
        .where(and(eq(userSites.userId, userId), eq(userSites.siteId, siteId)))
        .limit(1);

    if (userSiteAccess.length > 0) {
        return true;
    }

    return false;
}
