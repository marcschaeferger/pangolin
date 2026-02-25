import { db, loginPage, LoginPage, loginPageOrg, Org, orgs, roles } from "@server/db";
import {
    Resource,
    ResourcePassword,
    ResourcePincode,
    ResourceRule,
    resourcePassword,
    resourcePincode,
    resourceHeaderAuth,
    ResourceHeaderAuth,
    resourceRules,
    resources,
    roleResources,
    sessions,
    userOrgRoles,
    userOrgs,
    userResources,
    users,
    ResourceHeaderAuthExtendedCompatibility,
    resourceHeaderAuthExtendedCompatibility
} from "@server/db";
import { and, eq } from "drizzle-orm";

export type ResourceWithAuth = {
    resource: Resource | null;
    pincode: ResourcePincode | null;
    password: ResourcePassword | null;
    headerAuth: ResourceHeaderAuth | null;
    headerAuthExtendedCompatibility: ResourceHeaderAuthExtendedCompatibility | null;
    org: Org;
};

export type UserSessionWithUser = {
    session: any;
    user: any;
};

/**
 * Get resource by domain with pincode and password information
 */
export async function getResourceByDomain(
    domain: string
): Promise<ResourceWithAuth | null> {
    const [result] = await db
        .select()
        .from(resources)
        .leftJoin(
            resourcePincode,
            eq(resourcePincode.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourcePassword,
            eq(resourcePassword.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourceHeaderAuth,
            eq(resourceHeaderAuth.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourceHeaderAuthExtendedCompatibility,
            eq(
                resourceHeaderAuthExtendedCompatibility.resourceId,
                resources.resourceId
            )
        )
        .innerJoin(orgs, eq(orgs.orgId, resources.orgId))
        .where(eq(resources.fullDomain, domain))
        .limit(1);

    if (!result) {
        return null;
    }

    return {
        resource: result.resources,
        pincode: result.resourcePincode,
        password: result.resourcePassword,
        headerAuth: result.resourceHeaderAuth,
        headerAuthExtendedCompatibility:
            result.resourceHeaderAuthExtendedCompatibility,
        org: result.orgs
    };
}

/**
 * Get user session with user information
 */
export async function getUserSessionWithUser(
    userSessionId: string
): Promise<UserSessionWithUser | null> {
    const [res] = await db
        .select()
        .from(sessions)
        .leftJoin(users, eq(users.userId, sessions.userId))
        .where(eq(sessions.sessionId, userSessionId));

    if (!res) {
        return null;
    }

    return {
        session: res.session,
        user: res.user
    };
}

/**
 * Get user organization role (single role; prefer getUserOrgRoleIds + roles for multi-role).
 * @deprecated Use userOrgRoles table and getUserOrgRoleIds for multi-role support.
 */
export async function getUserOrgRole(userId: string, orgId: string) {
    const userOrg = await db
        .select({
            userId: userOrgs.userId,
            orgId: userOrgs.orgId,
            isOwner: userOrgs.isOwner,
            autoProvisioned: userOrgs.autoProvisioned
        })
        .from(userOrgs)
        .where(and(eq(userOrgs.userId, userId), eq(userOrgs.orgId, orgId)))
        .limit(1);

    if (userOrg.length === 0) return null;

    const [firstRole] = await db
        .select({
            roleId: userOrgRoles.roleId,
            roleName: roles.name
        })
        .from(userOrgRoles)
        .leftJoin(roles, eq(userOrgRoles.roleId, roles.roleId))
        .where(
            and(
                eq(userOrgRoles.userId, userId),
                eq(userOrgRoles.orgId, orgId)
            )
        )
        .limit(1);

    return firstRole
        ? {
              ...userOrg[0],
              roleId: firstRole.roleId,
              roleName: firstRole.roleName
          }
        : { ...userOrg[0], roleId: null, roleName: null };
}

/**
 * Get role name by role ID (for display).
 */
export async function getRoleName(roleId: number): Promise<string | null> {
    const [row] = await db
        .select({ name: roles.name })
        .from(roles)
        .where(eq(roles.roleId, roleId))
        .limit(1);
    return row?.name ?? null;
}

/**
 * Check if role has access to resource
 */
export async function getRoleResourceAccess(
    resourceId: number,
    roleId: number
) {
    const roleResourceAccess = await db
        .select()
        .from(roleResources)
        .where(
            and(
                eq(roleResources.resourceId, resourceId),
                eq(roleResources.roleId, roleId)
            )
        )
        .limit(1);

    return roleResourceAccess.length > 0 ? roleResourceAccess[0] : null;
}

/**
 * Check if user has direct access to resource
 */
export async function getUserResourceAccess(
    userId: string,
    resourceId: number
) {
    const userResourceAccess = await db
        .select()
        .from(userResources)
        .where(
            and(
                eq(userResources.userId, userId),
                eq(userResources.resourceId, resourceId)
            )
        )
        .limit(1);

    return userResourceAccess.length > 0 ? userResourceAccess[0] : null;
}

/**
 * Get resource rules for a given resource
 */
export async function getResourceRules(
    resourceId: number
): Promise<ResourceRule[]> {
    const rules = await db
        .select()
        .from(resourceRules)
        .where(eq(resourceRules.resourceId, resourceId));

    return rules;
}

/**
 * Get organization login page
 */
export async function getOrgLoginPage(
    orgId: string
): Promise<LoginPage | null> {
    const [result] = await db
        .select()
        .from(loginPageOrg)
        .where(eq(loginPageOrg.orgId, orgId))
        .innerJoin(
            loginPage,
            eq(loginPageOrg.loginPageId, loginPage.loginPageId)
        )
        .limit(1);

    if (!result) {
        return null;
    }

    return result?.loginPage;
}
