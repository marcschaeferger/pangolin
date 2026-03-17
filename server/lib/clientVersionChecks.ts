import semver from "semver";

export function canCompress(
    clientVersion: string | null | undefined,
    type: "newt" | "olm"
): boolean {
    try {
        if (!clientVersion) return false;
        // check if it is a valid semver
        if (!semver.valid(clientVersion)) return false;
        if (type === "newt") {
            return semver.gte(clientVersion, "1.10.3");
        } else if (type === "olm") {
            return semver.gte(clientVersion, "1.4.3");
        }
        return false;
    } catch {
        return false;
    }
}
