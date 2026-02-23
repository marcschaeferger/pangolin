import { assertEquals } from "@test/assert";
import { encodePath, sanitize } from "./utils";

function runTests() {
    console.log("Running path encoding tests...\n");

    // Test 1: null and empty return empty string
    {
        assertEquals(encodePath(null), "", "null should return empty");
        assertEquals(
            encodePath(undefined),
            "",
            "undefined should return empty"
        );
        assertEquals(encodePath(""), "", "empty string should return empty");
        console.log("  PASS: null/undefined/empty return empty string");
    }

    // Test 2: root path "/" encodes to something non-empty
    {
        const result = encodePath("/");
        assertEquals(result !== "", true, "root path should not be empty");
        assertEquals(result, "2f", "root path should encode to hex of '/'");
        console.log("  PASS: root path encodes to non-empty string");
    }

    // Test 3: different paths produce different encoded values
    {
        const paths = [
            "/",
            "/api",
            "/a/b",
            "/a-b",
            "/a.b",
            "/a_b",
            "/api/v1",
            "/api/v2"
        ];
        const encoded = new Set<string>();
        let collision = false;
        for (const p of paths) {
            const e = encodePath(p);
            if (encoded.has(e)) {
                collision = true;
                break;
            }
            encoded.add(e);
        }
        assertEquals(collision, false, "no two different paths should collide");
        console.log("  PASS: all different paths produce unique encodings");
    }

    // Test 4: alphanumeric characters pass through unchanged
    {
        assertEquals(
            encodePath("/api"),
            "2fapi",
            "/api should encode slash only"
        );
        assertEquals(encodePath("/v1"), "2fv1", "/v1 should encode slash only");
        console.log("  PASS: alphanumeric characters preserved");
    }

    // Test 5: special characters are hex-encoded
    {
        const dotEncoded = encodePath("/a.b");
        const dashEncoded = encodePath("/a-b");
        const slashEncoded = encodePath("/a/b");
        const underscoreEncoded = encodePath("/a_b");

        // all should be different
        const set = new Set([
            dotEncoded,
            dashEncoded,
            slashEncoded,
            underscoreEncoded
        ]);
        assertEquals(
            set.size,
            4,
            "dot, dash, slash, underscore paths should all be unique"
        );
        console.log("  PASS: special characters produce unique encodings");
    }

    // Test 6: full key generation - different paths create different keys
    {
        function makeKey(
            resourceId: number,
            path: string | null,
            pathMatchType: string | null
        ) {
            const targetPath = encodePath(path);
            const pmt = pathMatchType || "";
            const pathKey = [targetPath, pmt, "", ""].filter(Boolean).join("-");
            const mapKey = [resourceId, pathKey].filter(Boolean).join("-");
            return sanitize(mapKey);
        }

        const keySlash = makeKey(1, "/", "prefix");
        const keyApi = makeKey(1, "/api", "prefix");
        const keyNull = makeKey(1, null, null);

        assertEquals(
            keySlash !== keyApi,
            true,
            "/ and /api should have different keys"
        );
        assertEquals(
            keySlash !== keyNull,
            true,
            "/ and null should have different keys"
        );
        assertEquals(
            keyApi !== keyNull,
            true,
            "/api and null should have different keys"
        );

        console.log(
            "  PASS: different paths create different resource map keys"
        );
    }

    // Test 7: same path always produces same key (deterministic)
    {
        assertEquals(
            encodePath("/api"),
            encodePath("/api"),
            "same input should produce same output"
        );
        assertEquals(
            encodePath("/a/b/c"),
            encodePath("/a/b/c"),
            "same input should produce same output"
        );
        console.log("  PASS: encoding is deterministic");
    }

    // Test 8: encoded result is alphanumeric (valid for Traefik names after sanitize)
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
            const isAlphanumeric = /^[a-zA-Z0-9]+$/.test(e);
            assertEquals(
                isAlphanumeric,
                true,
                `encodePath("${p}") = "${e}" should be alphanumeric`
            );
        }
        console.log("  PASS: encoded values are alphanumeric");
    }

    console.log("\nAll path encoding tests passed!");
}

try {
    runTests();
} catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
}
