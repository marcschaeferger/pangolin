import { assertEquals } from "../../../test/assert";
import { encodePath, sanitize } from "./pathUtils";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Exact replica of the OLD key computation from upstream main.
 * This is what existing Pangolin deployments use today for both
 * map grouping AND Traefik router/service names.
 *
 * Source: origin/main server/lib/traefik/getTraefikConfig.ts lines 130-146
 */
function oldKeyComputation(
    resourceId: number,
    path: string | null,
    pathMatchType: string | null,
    rewritePath: string | null,
    rewritePathType: string | null
): string {
    const targetPath = sanitize(path) || "";
    const pmt = pathMatchType || "";
    const rp = rewritePath || "";
    const rpt = rewritePathType || "";
    const pathKey = [targetPath, pmt, rp, rpt].filter(Boolean).join("-");
    const mapKey = [resourceId, pathKey].filter(Boolean).join("-");
    return sanitize(mapKey) || "";
}

/**
 * Replica of the NEW dual-key computation from our fix.
 * Returns both the internal map key (for grouping) and the
 * Traefik-facing key (for router/service names).
 *
 * Source: our getTraefikConfig.ts lines 135-163
 */
function newKeyComputation(
    resourceId: number,
    path: string | null,
    pathMatchType: string | null,
    rewritePath: string | null,
    rewritePathType: string | null
): { internalMapKey: string; traefikKey: string } {
    const pmt = pathMatchType || "";
    const rp = rewritePath || "";
    const rpt = rewritePathType || "";

    // Internal map key: uses encodePath (collision-free)
    const encodedPath = encodePath(path);
    const internalPathKey = [encodedPath, pmt, rp, rpt]
        .filter(Boolean)
        .join("-");
    const internalMapKey = [resourceId, internalPathKey]
        .filter(Boolean)
        .join("-");

    // Traefik-facing key: uses sanitize (backward-compatible)
    const sanitizedPath = sanitize(path) || "";
    const traefikPathKey = [sanitizedPath, pmt, rp, rpt]
        .filter(Boolean)
        .join("-");
    const traefikKey = sanitize(
        [resourceId, traefikPathKey].filter(Boolean).join("-")
    );

    return { internalMapKey, traefikKey: traefikKey || "" };
}

/**
 * Build the full Traefik router/service names the way getTraefikConfig does.
 */
function buildTraefikNames(key: string, resourceName: string) {
    const name = sanitize(resourceName) || "";
    return {
        routerName: `${key}-${name}-router`,
        serviceName: `${key}-${name}-service`,
        transportName: `${key}-transport`,
        headersMiddlewareName: `${key}-headers-middleware`
    };
}

// ── Tests ────────────────────────────────────────────────────────────

function runTests() {
    console.log("Running path encoding & backward compatibility tests...\n");

    let passed = 0;

    // ── encodePath unit tests ────────────────────────────────────────

    // Test 1: null/undefined/empty
    {
        assertEquals(encodePath(null), "", "null should return empty");
        assertEquals(
            encodePath(undefined),
            "",
            "undefined should return empty"
        );
        assertEquals(encodePath(""), "", "empty string should return empty");
        console.log("  PASS: encodePath handles null/undefined/empty");
        passed++;
    }

    // Test 2: root path
    {
        assertEquals(encodePath("/"), "2f", "/ should encode to 2f");
        console.log("  PASS: encodePath encodes root path");
        passed++;
    }

    // Test 3: alphanumeric passthrough
    {
        assertEquals(encodePath("/api"), "2fapi", "/api encodes slash only");
        assertEquals(encodePath("/v1"), "2fv1", "/v1 encodes slash only");
        assertEquals(encodePath("abc"), "abc", "plain alpha passes through");
        console.log("  PASS: encodePath preserves alphanumeric chars");
        passed++;
    }

    // Test 4: all special chars produce unique hex
    {
        const paths = ["/a/b", "/a-b", "/a.b", "/a_b", "/a b"];
        const results = paths.map((p) => encodePath(p));
        const unique = new Set(results);
        assertEquals(
            unique.size,
            paths.length,
            "all special-char paths must produce unique encodings"
        );
        console.log(
            "  PASS: encodePath produces unique output for different special chars"
        );
        passed++;
    }

    // Test 5: output is always alphanumeric (safe for Traefik names)
    {
        const paths = [
            "/",
            "/api",
            "/a/b",
            "/a-b",
            "/a.b",
            "/complex/path/here"
        ];
        for (const p of paths) {
            const e = encodePath(p);
            assertEquals(
                /^[a-zA-Z0-9]+$/.test(e),
                true,
                `encodePath("${p}") = "${e}" must be alphanumeric`
            );
        }
        console.log("  PASS: encodePath output is always alphanumeric");
        passed++;
    }

    // Test 6: deterministic
    {
        assertEquals(
            encodePath("/api"),
            encodePath("/api"),
            "same input same output"
        );
        assertEquals(
            encodePath("/a/b/c"),
            encodePath("/a/b/c"),
            "same input same output"
        );
        console.log("  PASS: encodePath is deterministic");
        passed++;
    }

    // Test 7: many distinct paths never collide
    {
        const paths = [
            "/",
            "/api",
            "/api/v1",
            "/api/v2",
            "/a/b",
            "/a-b",
            "/a.b",
            "/a_b",
            "/health",
            "/health/check",
            "/admin",
            "/admin/users",
            "/api/v1/users",
            "/api/v1/posts",
            "/app",
            "/app/dashboard"
        ];
        const encoded = new Set(paths.map((p) => encodePath(p)));
        assertEquals(
            encoded.size,
            paths.length,
            `expected ${paths.length} unique encodings, got ${encoded.size}`
        );
        console.log("  PASS: 16 realistic paths all produce unique encodings");
        passed++;
    }

    // ── Backward compatibility: Traefik names must match old code ─────

    // Test 8: simple resource, no path — Traefik name unchanged
    {
        const oldKey = oldKeyComputation(1, null, null, null, null);
        const { traefikKey } = newKeyComputation(1, null, null, null, null);
        assertEquals(
            traefikKey,
            oldKey,
            "no-path resource: Traefik key must match old"
        );
        console.log("  PASS: backward compat — no path resource");
        passed++;
    }

    // Test 9: resource with /api prefix — Traefik name unchanged
    {
        const oldKey = oldKeyComputation(1, "/api", "prefix", null, null);
        const { traefikKey } = newKeyComputation(
            1,
            "/api",
            "prefix",
            null,
            null
        );
        assertEquals(
            traefikKey,
            oldKey,
            "/api prefix: Traefik key must match old"
        );
        console.log("  PASS: backward compat — /api prefix");
        passed++;
    }

    // Test 10: resource with exact path — Traefik name unchanged
    {
        const oldKey = oldKeyComputation(5, "/health", "exact", null, null);
        const { traefikKey } = newKeyComputation(
            5,
            "/health",
            "exact",
            null,
            null
        );
        assertEquals(
            traefikKey,
            oldKey,
            "/health exact: Traefik key must match old"
        );
        console.log("  PASS: backward compat — /health exact");
        passed++;
    }

    // Test 11: resource with regex path — Traefik name unchanged
    {
        const oldKey = oldKeyComputation(
            3,
            "^/api/v[0-9]+",
            "regex",
            null,
            null
        );
        const { traefikKey } = newKeyComputation(
            3,
            "^/api/v[0-9]+",
            "regex",
            null,
            null
        );
        assertEquals(
            traefikKey,
            oldKey,
            "regex path: Traefik key must match old"
        );
        console.log("  PASS: backward compat — regex path");
        passed++;
    }

    // Test 12: resource with path rewrite — Traefik name unchanged
    {
        const oldKey = oldKeyComputation(
            10,
            "/api",
            "prefix",
            "/backend",
            "prefix"
        );
        const { traefikKey } = newKeyComputation(
            10,
            "/api",
            "prefix",
            "/backend",
            "prefix"
        );
        assertEquals(
            traefikKey,
            oldKey,
            "path rewrite: Traefik key must match old"
        );
        console.log("  PASS: backward compat — path rewrite (prefix→prefix)");
        passed++;
    }

    // Test 13: resource with stripPrefix rewrite — Traefik name unchanged
    {
        const oldKey = oldKeyComputation(
            7,
            "/app",
            "prefix",
            null,
            "stripPrefix"
        );
        const { traefikKey } = newKeyComputation(
            7,
            "/app",
            "prefix",
            null,
            "stripPrefix"
        );
        assertEquals(
            traefikKey,
            oldKey,
            "stripPrefix: Traefik key must match old"
        );
        console.log("  PASS: backward compat — stripPrefix rewrite");
        passed++;
    }

    // Test 14: root path "/" — Traefik name unchanged
    {
        const oldKey = oldKeyComputation(1, "/", "prefix", null, null);
        const { traefikKey } = newKeyComputation(1, "/", "prefix", null, null);
        assertEquals(
            traefikKey,
            oldKey,
            "root path: Traefik key must match old"
        );
        console.log("  PASS: backward compat — root path /");
        passed++;
    }

    // Test 15: full Traefik router/service names unchanged for existing users
    {
        const scenarios = [
            {
                rid: 1,
                name: "my-webapp",
                path: "/api",
                pmt: "prefix" as const,
                rp: null,
                rpt: null
            },
            {
                rid: 2,
                name: "backend",
                path: "/",
                pmt: "prefix" as const,
                rp: null,
                rpt: null
            },
            {
                rid: 3,
                name: "docs",
                path: "/docs",
                pmt: "prefix" as const,
                rp: "/",
                rpt: "stripPrefix" as const
            },
            {
                rid: 42,
                name: "api-service",
                path: null,
                pmt: null,
                rp: null,
                rpt: null
            },
            {
                rid: 100,
                name: "grafana",
                path: "/grafana",
                pmt: "prefix" as const,
                rp: null,
                rpt: null
            }
        ];
        for (const s of scenarios) {
            const oldKey = oldKeyComputation(s.rid, s.path, s.pmt, s.rp, s.rpt);
            const { traefikKey } = newKeyComputation(
                s.rid,
                s.path,
                s.pmt,
                s.rp,
                s.rpt
            );
            const oldNames = buildTraefikNames(oldKey, s.name);
            const newNames = buildTraefikNames(traefikKey, s.name);
            assertEquals(
                newNames.routerName,
                oldNames.routerName,
                `router name mismatch for resource ${s.rid} ${s.name} path=${s.path}`
            );
            assertEquals(
                newNames.serviceName,
                oldNames.serviceName,
                `service name mismatch for resource ${s.rid} ${s.name} path=${s.path}`
            );
            assertEquals(
                newNames.transportName,
                oldNames.transportName,
                `transport name mismatch for resource ${s.rid} ${s.name} path=${s.path}`
            );
        }
        console.log(
            "  PASS: backward compat — full router/service/transport names match old code for 5 scenarios"
        );
        passed++;
    }

    // Test 16: large resourceId — Traefik name unchanged
    {
        const oldKey = oldKeyComputation(
            99999,
            "/dashboard",
            "prefix",
            null,
            null
        );
        const { traefikKey } = newKeyComputation(
            99999,
            "/dashboard",
            "prefix",
            null,
            null
        );
        assertEquals(
            traefikKey,
            oldKey,
            "large resourceId: Traefik key must match old"
        );
        console.log("  PASS: backward compat — large resourceId");
        passed++;
    }

    // ── Collision fix: the actual bug we're fixing ───────────────────

    // Test 17: /a/b and /a-b now have different internal keys (THE BUG FIX)
    {
        const keysAB = newKeyComputation(1, "/a/b", "prefix", null, null);
        const keysDash = newKeyComputation(1, "/a-b", "prefix", null, null);
        assertEquals(
            keysAB.internalMapKey !== keysDash.internalMapKey,
            true,
            "/a/b and /a-b MUST have different internal map keys"
        );
        console.log(
            "  PASS: collision fix — /a/b vs /a-b have different internal keys"
        );
        passed++;
    }

    // Test 18: demonstrate the old bug — old code maps /a/b and /a-b to same key
    {
        const oldKeyAB = oldKeyComputation(1, "/a/b", "prefix", null, null);
        const oldKeyDash = oldKeyComputation(1, "/a-b", "prefix", null, null);
        assertEquals(
            oldKeyAB,
            oldKeyDash,
            "old code MUST have this collision (confirms the bug exists)"
        );
        console.log("  PASS: confirmed old code bug — /a/b and /a-b collided");
        passed++;
    }

    // Test 19: /api/v1 and /api-v1 — old code collision, new code fixes it
    {
        const oldKey1 = oldKeyComputation(1, "/api/v1", "prefix", null, null);
        const oldKey2 = oldKeyComputation(1, "/api-v1", "prefix", null, null);
        assertEquals(
            oldKey1,
            oldKey2,
            "old code collision for /api/v1 vs /api-v1"
        );

        const new1 = newKeyComputation(1, "/api/v1", "prefix", null, null);
        const new2 = newKeyComputation(1, "/api-v1", "prefix", null, null);
        assertEquals(
            new1.internalMapKey !== new2.internalMapKey,
            true,
            "new code must separate /api/v1 and /api-v1"
        );
        console.log("  PASS: collision fix — /api/v1 vs /api-v1");
        passed++;
    }

    // Test 20: /app.v2 and /app/v2 and /app-v2 — three-way collision fixed
    {
        const a = newKeyComputation(1, "/app.v2", "prefix", null, null);
        const b = newKeyComputation(1, "/app/v2", "prefix", null, null);
        const c = newKeyComputation(1, "/app-v2", "prefix", null, null);
        const keys = new Set([
            a.internalMapKey,
            b.internalMapKey,
            c.internalMapKey
        ]);
        assertEquals(
            keys.size,
            3,
            "three paths must produce three unique internal keys"
        );
        console.log(
            "  PASS: collision fix — three-way /app.v2, /app/v2, /app-v2"
        );
        passed++;
    }

    // ── Edge cases ───────────────────────────────────────────────────

    // Test 21: same path in different resources — always separate
    {
        const res1 = newKeyComputation(1, "/api", "prefix", null, null);
        const res2 = newKeyComputation(2, "/api", "prefix", null, null);
        assertEquals(
            res1.internalMapKey !== res2.internalMapKey,
            true,
            "different resources with same path must have different keys"
        );
        assertEquals(
            res1.traefikKey !== res2.traefikKey,
            true,
            "different resources with same path must have different Traefik keys"
        );
        console.log("  PASS: edge case — same path, different resources");
        passed++;
    }

    // Test 22: same resource, different pathMatchType — separate keys
    {
        const exact = newKeyComputation(1, "/api", "exact", null, null);
        const prefix = newKeyComputation(1, "/api", "prefix", null, null);
        assertEquals(
            exact.internalMapKey !== prefix.internalMapKey,
            true,
            "exact vs prefix must have different internal keys"
        );
        console.log("  PASS: edge case — same path, different match types");
        passed++;
    }

    // Test 23: same resource and path, different rewrite config — separate keys
    {
        const noRewrite = newKeyComputation(1, "/api", "prefix", null, null);
        const withRewrite = newKeyComputation(
            1,
            "/api",
            "prefix",
            "/backend",
            "prefix"
        );
        assertEquals(
            noRewrite.internalMapKey !== withRewrite.internalMapKey,
            true,
            "with vs without rewrite must have different internal keys"
        );
        console.log("  PASS: edge case — same path, different rewrite config");
        passed++;
    }

    // Test 24: paths with special URL characters
    {
        const paths = ["/api?foo", "/api#bar", "/api%20baz", "/api+qux"];
        const internal = new Set(
            paths.map(
                (p) =>
                    newKeyComputation(1, p, "prefix", null, null).internalMapKey
            )
        );
        assertEquals(
            internal.size,
            paths.length,
            "special URL chars must produce unique keys"
        );
        console.log("  PASS: edge case — special URL characters in paths");
        passed++;
    }

    // Test 25: very long path (sanitize truncates at 50 chars — verify consistency)
    {
        const longPath = "/" + "a".repeat(100);
        const oldKey = oldKeyComputation(1, longPath, "prefix", null, null);
        const { traefikKey } = newKeyComputation(
            1,
            longPath,
            "prefix",
            null,
            null
        );
        assertEquals(
            traefikKey,
            oldKey,
            "long path: Traefik key must match old (both truncate)"
        );
        console.log("  PASS: edge case — very long path (50-char truncation)");
        passed++;
    }

    // Test 26: sticky session cookie safety — service name doesn't change
    {
        // Sticky sessions use cookie name "p_sticky" tied to the service name.
        // If service name changes, existing cookies become invalid.
        const oldKey = oldKeyComputation(1, "/api", "prefix", null, null);
        const { traefikKey } = newKeyComputation(
            1,
            "/api",
            "prefix",
            null,
            null
        );
        const oldServiceName = `${oldKey}-my-app-service`;
        const newServiceName = `${traefikKey}-my-app-service`;
        assertEquals(
            newServiceName,
            oldServiceName,
            "service name must not change (would break sticky session cookies)"
        );
        console.log("  PASS: sticky session safety — service name preserved");
        passed++;
    }

    console.log(`\nAll ${passed} tests passed!`);
}

try {
    runTests();
} catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
}
