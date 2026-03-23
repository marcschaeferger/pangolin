import { flushBandwidthToDb } from "@server/routers/newt/handleReceiveBandwidthMessage";
import { flushSiteBandwidthToDb } from "@server/routers/gerbil/receiveBandwidth";
import { cleanup as wsCleanup } from "#dynamic/routers/ws";

async function cleanup() {
    await flushBandwidthToDb();
    await flushSiteBandwidthToDb();
    await wsCleanup();

    process.exit(0);
}

export async function initCleanup() {
    // Handle process termination
    process.on("SIGTERM", () => cleanup());
    process.on("SIGINT", () => cleanup());
}