/**
 * Pure utility functions for path/name encoding.
 * No external dependencies — safe to import in tests.
 */

export function sanitize(input: string | null | undefined): string | undefined {
    if (!input) return undefined;
    // clean any non alphanumeric characters from the input and replace with dashes
    // the input cant be too long either, so limit to 50 characters
    if (input.length > 50) {
        input = input.substring(0, 50);
    }
    return input
        .replace(/[^a-zA-Z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

/**
 * Encode a URL path into a collision-free alphanumeric string suitable for use
 * in Traefik map keys.
 *
 * Unlike sanitize(), this preserves uniqueness by encoding each non-alphanumeric
 * character as its hex code. Different paths always produce different outputs.
 *
 *   encodePath("/api")  => "2fapi"
 *   encodePath("/a/b")  => "2fa2fb"
 *   encodePath("/a-b")  => "2fa2db"   (different from /a/b)
 *   encodePath("/")     => "2f"
 *   encodePath(null)    => ""
 */
export function encodePath(path: string | null | undefined): string {
    if (!path) return "";
    return path.replace(/[^a-zA-Z0-9]/g, (ch) => {
        return ch.charCodeAt(0).toString(16);
    });
}
