import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";

const version = "1.17.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    // Query existing roleId data from userOrgs before the transaction destroys it
    const existingRolesQuery = await db.execute(
        sql`SELECT "userId", "orgId", "roleId" FROM "userOrgs" WHERE "roleId" IS NOT NULL`
    );
    const existingUserOrgRoles = existingRolesQuery.rows as {
        userId: string;
        orgId: string;
        roleId: number;
    }[];

    console.log(
        `Found ${existingUserOrgRoles.length} existing userOrgs role assignment(s) to migrate`
    );

    try {
        await db.execute(sql`BEGIN`);

        await db.execute(sql`
            CREATE TABLE "userOrgRoles" (
               	"userId" varchar NOT NULL,
               	"orgId" varchar NOT NULL,
               	"roleId" integer NOT NULL,
               	CONSTRAINT "userOrgRoles_userId_orgId_roleId_unique" UNIQUE("userId","orgId","roleId")
            );
        `);
        await db.execute(sql`ALTER TABLE "userOrgs" DROP CONSTRAINT "userOrgs_roleId_roles_roleId_fk";`);
        await db.execute(sql`ALTER TABLE "userOrgRoles" ADD CONSTRAINT "userOrgRoles_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;`);
        await db.execute(sql`ALTER TABLE "userOrgRoles" ADD CONSTRAINT "userOrgRoles_orgId_orgs_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "public"."orgs"("orgId") ON DELETE cascade ON UPDATE no action;`);
        await db.execute(sql`ALTER TABLE "userOrgRoles" ADD CONSTRAINT "userOrgRoles_roleId_roles_roleId_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("roleId") ON DELETE cascade ON UPDATE no action;`);
        await db.execute(sql`ALTER TABLE "userOrgs" DROP COLUMN "roleId";`);

        await db.execute(sql`COMMIT`);
        console.log("Migrated database");
    } catch (e) {
        await db.execute(sql`ROLLBACK`);
        console.log("Unable to migrate database");
        console.log(e);
        throw e;
    }

    // Re-insert the preserved role assignments into the new userOrgRoles table
    if (existingUserOrgRoles.length > 0) {
        try {
            for (const row of existingUserOrgRoles) {
                await db.execute(sql`
                    INSERT INTO "userOrgRoles" ("userId", "orgId", "roleId")
                    VALUES (${row.userId}, ${row.orgId}, ${row.roleId})
                    ON CONFLICT DO NOTHING
                `);
            }

            console.log(
                `Migrated ${existingUserOrgRoles.length} role assignment(s) into userOrgRoles`
            );
        } catch (e) {
            console.error(
                "Error while migrating role assignments into userOrgRoles:",
                e
            );
            throw e;
        }
    }

    console.log(`${version} migration complete`);
}