import { APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.17.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");

        // Query existing roleId data from userOrgs before the transaction destroys it
        const existingUserOrgRoles = db
            .prepare(
                `SELECT "userId", "orgId", "roleId" FROM 'userOrgs' WHERE "roleId" IS NOT NULL`
            )
            .all() as { userId: string; orgId: string; roleId: number }[];

        console.log(
            `Found ${existingUserOrgRoles.length} existing userOrgs role assignment(s) to migrate`
        );

        db.transaction(() => {
            db.prepare(
                `
                CREATE TABLE 'userOrgRoles' (
                   	'userId' text NOT NULL,
                   	'orgId' text NOT NULL,
                   	'roleId' integer NOT NULL,
                   	FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('roleId') REFERENCES 'roles'('roleId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();

            db.prepare(
                `CREATE UNIQUE INDEX 'userOrgRoles_userId_orgId_roleId_unique' ON 'userOrgRoles' ('userId','orgId','roleId');`
            ).run();

            db.prepare(
                `
                CREATE TABLE '__new_userOrgs' (
                   	'userId' text NOT NULL,
                   	'orgId' text NOT NULL,
                   	'isOwner' integer DEFAULT false NOT NULL,
                   	'autoProvisioned' integer DEFAULT false,
                   	'pamUsername' text,
                   	FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();

            db.prepare(
                `INSERT INTO '__new_userOrgs'("userId", "orgId", "isOwner", "autoProvisioned", "pamUsername") SELECT "userId", "orgId", "isOwner", "autoProvisioned", "pamUsername" FROM 'userOrgs';`
            ).run();
            db.prepare(`DROP TABLE 'userOrgs';`).run();
            db.prepare(
                `ALTER TABLE '__new_userOrgs' RENAME TO 'userOrgs';`
            ).run();
        })();

        db.pragma("foreign_keys = ON");

        // Re-insert the preserved role assignments into the new userOrgRoles table
        if (existingUserOrgRoles.length > 0) {
            const insertUserOrgRole = db.prepare(
                `INSERT OR IGNORE INTO 'userOrgRoles' ("userId", "orgId", "roleId") VALUES (?, ?, ?)`
            );

            const insertAll = db.transaction(() => {
                for (const row of existingUserOrgRoles) {
                    insertUserOrgRole.run(row.userId, row.orgId, row.roleId);
                }
            });

            insertAll();

            console.log(
                `Migrated ${existingUserOrgRoles.length} role assignment(s) into userOrgRoles`
            );
        }

        console.log(`Migrated database`);
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}