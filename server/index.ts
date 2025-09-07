#! /usr/bin/env node
import "./extendZod.ts";

import { runSetupFunctions } from "./setup";
import { createApiServer } from "./apiServer";
import { createNextServer } from "./nextServer";
import { createInternalServer } from "./internalServer";
import { ApiKey, ApiKeyOrg, Session, User, UserOrg } from "@server/db";
import { createIntegrationApiServer } from "./integrationApiServer";
import { createHybridClientServer } from "./hybridServer";
import config from "@server/lib/config";
import { setHostMeta } from "@server/lib/hostMeta";
import { initTelemetryClient } from "./lib/telemetry.js";
import { TraefikConfigManager } from "./lib/traefikConfig.js";
import { startOtel } from "./observability/otel";
import { helpers as metricsHelpers, startObservablePollers } from "./observability/metrics";

async function startServers() {
    await setHostMeta();

    await config.initServer();
    await runSetupFunctions();

    await startOtel();
    await startObservablePollers();
    metricsHelpers.incRestart();

    initTelemetryClient();

    // Start all servers
    const apiServer = createApiServer();
    const internalServer = createInternalServer();

    let hybridClientServer;
    let nextServer;
    if (config.isManagedMode()) {
        hybridClientServer = await createHybridClientServer();
    } else {
        nextServer = await createNextServer();
        if (config.getRawConfig().traefik.file_mode) {
            const monitor = new TraefikConfigManager();
            await monitor.start();
        }
    }

    let integrationServer;
    if (config.getRawConfig().flags?.enable_integration_api) {
        integrationServer = createIntegrationApiServer();
    }

    return {
        apiServer,
        nextServer,
        internalServer,
        integrationServer,
        hybridClientServer
    };
}

// Types
declare global {
    namespace Express {
        interface Request {
            apiKey?: ApiKey;
            user?: User;
            session: Session;
            userOrg?: UserOrg;
            apiKeyOrg?: ApiKeyOrg;
            userOrgRoleId?: number;
            userOrgId?: string;
            userOrgIds?: string[];
        }
    }
}

startServers().catch(console.error);
