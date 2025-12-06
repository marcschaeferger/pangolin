import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics, Counter, Histogram, ObservableGauge, Meter } from '@opentelemetry/api';
import logger from '@server/logger';

class MetricsService {
    private meterProvider: MeterProvider | null = null;
    private prometheusExporter: PrometheusExporter | null = null;
    private meter: Meter | null = null;

    // Site metrics
    public siteActiveSites!: ObservableGauge;
    public siteOnline!: ObservableGauge;
    public siteBandwidthBytesTotal!: Counter;
    public siteUptimeSecondsTotal!: Counter;
    public siteConnectionDropsTotal!: Counter;
    public siteHandshakeLatencySeconds!: Histogram;

    // Resource metrics
    public resourceRequestsTotal!: Counter;
    public resourceRequestDurationSeconds!: Histogram;
    public resourceActiveConnections!: ObservableGauge;
    public resourceErrorsTotal!: Counter;
    public resourceBandwidthBytesTotal!: Counter;

    // Tunnel metrics
    public tunnelUp!: ObservableGauge;
    public tunnelReconnectsTotal!: Counter;
    public tunnelLatencySeconds!: Histogram;
    public tunnelBytesTotal!: Counter;

    // WireGuard metrics
    public wgHandshakeTotal!: Counter;

    // Backend metrics
    public backendHealthStatus!: ObservableGauge;
    public backendConnectionErrorsTotal!: Counter;
    public backendResponseSizeBytes!: Histogram;

    // Auth metrics
    public authRequestsTotal!: Counter;
    public authRequestDurationSeconds!: Histogram;
    public authActiveUsers!: ObservableGauge;
    public authFailureReasonsTotal!: Counter;
    public tokenIssuedTotal!: Counter;
    public tokenRevokedTotal!: Counter;
    public tokenRefreshTotal!: Counter;

    // UI metrics
    public uiRequestsTotal!: Counter;
    public uiActiveSessions!: ObservableGauge;

    // System metrics
    public configReloadsTotal!: Counter;
    public restartCountTotal!: Counter;
    public backgroundJobsTotal!: Counter;
    public certificatesExpiryDays!: ObservableGauge;

    // WebSocket metrics
    public wsConnectionsTotal!: Counter;
    public wsActiveConnections!: ObservableGauge;
    public wsMessagesTotal!: Counter;

    // Traefik metrics
    public traefikProviderSyncSeconds!: Histogram;
    public traefikProviderErrorsTotal!: Counter;
    public pluginFetchTotal!: Counter;

    // ACME metrics
    public acmeCertEventsTotal!: Counter;
    public acmeCertExpiryDays!: ObservableGauge;

    // Database metrics
    public dbPoolConnections!: ObservableGauge;
    public dbWaitSecondsTotal!: Counter;

    // Integration metrics
    public integrationApiRequestsTotal!: Counter;
    public integrationApiDurationSeconds!: Histogram;

    // Background queue metrics
    public holepunchOrchestrationTotal!: Counter;
    public backgroundQueueDepth!: ObservableGauge;

    // Observable callback data stores
    private observableData = {
        siteActiveSites: new Map<string, number>(),
        siteOnline: new Map<string, { siteId: string; transport: string; value: number }>(),
        resourceActiveConnections: new Map<string, { siteId: string; resourceId: string; protocol: string; value: number }>(),
        tunnelUp: new Map<string, { siteId: string; transport: string; value: number }>(),
        backendHealthStatus: new Map<string, { backend: string; siteId: string; value: number }>(),
        authActiveUsers: new Map<string, { siteId: string; authMethod: string; value: number }>(),
        uiActiveSessions: 0,
        certificatesExpiryDays: new Map<string, { siteId: string; resourceId: string; value: number }>(),
        wsActiveConnections: new Map<string, number>(),
        acmeCertExpiryDays: new Map<string, number>(),
        dbPoolConnections: new Map<string, number>(),
        backgroundQueueDepth: new Map<string, number>()
    };

    constructor() {}

    initialize(port: number = 9464) {
        try {
            // Create Prometheus exporter
            this.prometheusExporter = new PrometheusExporter({
                port: port,
                endpoint: '/metrics'
            }, () => {
                logger.info(`Prometheus metrics available at http://localhost:${port}/metrics`);
            });

            // Create meter provider with Prometheus exporter
            this.meterProvider = new MeterProvider({
                readers: [this.prometheusExporter]
            });

            // Set global meter provider
            metrics.setGlobalMeterProvider(this.meterProvider);

            // Get meter
            this.meter = metrics.getMeter('pangolin');

            if (!this.meter) {
                throw new Error('Failed to get meter from MeterProvider');
            }

            // Initialize all metrics
            this.initializeSiteMetrics();
            this.initializeResourceMetrics();
            this.initializeTunnelMetrics();
            this.initializeWireGuardMetrics();
            this.initializeBackendMetrics();
            this.initializeAuthMetrics();
            this.initializeUIMetrics();
            this.initializeSystemMetrics();
            this.initializeWebSocketMetrics();
            this.initializeTraefikMetrics();
            this.initializeACMEMetrics();
            this.initializeDatabaseMetrics();
            this.initializeIntegrationMetrics();
            this.initializeBackgroundQueueMetrics();

            logger.info('OpenTelemetry metrics service initialized');
        } catch (error) {
            logger.error('Failed to initialize metrics service:', error);
            throw error;
        }
    }

    private initializeSiteMetrics() {
        // Observable gauge for active sites
        this.siteActiveSites = this.meter!.createObservableGauge('pangolin_site_active_sites', {
            description: 'Number of sites Pangolin is managing/connected',
            unit: '{sites}'
        });
        this.siteActiveSites.addCallback((observableResult) => {
            for (const [region, count] of Array.from(this.observableData.siteActiveSites.entries())) {
                observableResult.observe(count, { region });
            }
        });

        // Observable gauge for site online status
        this.siteOnline = this.meter!.createObservableGauge('pangolin_site_online', {
            description: 'Online heartbeat for a site over a given transport',
            unit: '{0|1}'
        });
        this.siteOnline.addCallback((observableResult) => {
            for (const [key, data] of Array.from(this.observableData.siteOnline.entries())) {
                observableResult.observe(data.value, {
                    site_id: data.siteId,
                    transport: data.transport
                });
            }
        });

        // Counter for site bandwidth
        this.siteBandwidthBytesTotal = this.meter!.createCounter('pangolin_site_bandwidth_bytes_total', {
            description: 'Aggregate site ingress/egress by protocol',
            unit: 'By'
        });

        // Counter for site uptime
        this.siteUptimeSecondsTotal = this.meter!.createCounter('pangolin_site_uptime_seconds_total', {
            description: 'Monotonic uptime per site',
            unit: 's'
        });

        // Counter for connection drops
        this.siteConnectionDropsTotal = this.meter!.createCounter('pangolin_site_connection_drops_total', {
            description: 'Site-level connection drops',
            unit: '{drops}'
        });

        // Histogram for handshake latency
        this.siteHandshakeLatencySeconds = this.meter!.createHistogram('pangolin_site_handshake_latency_seconds', {
            description: 'Initial connect/handshake latency',
            unit: 's'
        });
    }

    private initializeResourceMetrics() {
        // Counter for resource requests
        this.resourceRequestsTotal = this.meter!.createCounter('pangolin_resource_requests_total', {
            description: 'Proxied resource requests by method/status/backend',
            unit: '{requests}'
        });

        // Histogram for request duration
        this.resourceRequestDurationSeconds = this.meter!.createHistogram('pangolin_resource_request_duration_seconds', {
            description: 'Latency for proxied requests',
            unit: 's'
        });

        // Observable gauge for active connections
        this.resourceActiveConnections = this.meter!.createObservableGauge('pangolin_resource_active_connections', {
            description: 'Live upstream connections per resource/protocol',
            unit: '{connections}'
        });
        this.resourceActiveConnections.addCallback((observableResult) => {
            for (const [key, data] of Array.from(this.observableData.resourceActiveConnections.entries())) {
                observableResult.observe(data.value, {
                    site_id: data.siteId,
                    resource_id: data.resourceId,
                    protocol: data.protocol
                });
            }
        });

        // Counter for resource errors
        this.resourceErrorsTotal = this.meter!.createCounter('pangolin_resource_errors_total', {
            description: 'Errors by backend and error type',
            unit: '{errors}'
        });

        // Counter for resource bandwidth
        this.resourceBandwidthBytesTotal = this.meter!.createCounter('pangolin_resource_bandwidth_bytes_total', {
            description: 'Per-resource bytes in/out',
            unit: 'By'
        });
    }

    private initializeTunnelMetrics() {
        // Observable gauge for tunnel status
        this.tunnelUp = this.meter!.createObservableGauge('pangolin_tunnel_up', {
            description: 'Transport tunnel health',
            unit: '{0|1}'
        });
        this.tunnelUp.addCallback((observableResult) => {
            for (const [key, data] of Array.from(this.observableData.tunnelUp.entries())) {
                observableResult.observe(data.value, {
                    site_id: data.siteId,
                    transport: data.transport
                });
            }
        });

        // Counter for tunnel reconnects
        this.tunnelReconnectsTotal = this.meter!.createCounter('pangolin_tunnel_reconnects_total', {
            description: 'Reconnects with reason',
            unit: '{reconnects}'
        });

        // Histogram for tunnel latency
        this.tunnelLatencySeconds = this.meter!.createHistogram('pangolin_tunnel_latency_seconds', {
            description: 'Transport RTT latency',
            unit: 's'
        });

        // Counter for tunnel bytes
        this.tunnelBytesTotal = this.meter!.createCounter('pangolin_tunnel_bytes_total', {
            description: 'Transport bytes by direction',
            unit: 'By'
        });
    }

    private initializeWireGuardMetrics() {
        // Counter for WireGuard handshakes
        this.wgHandshakeTotal = this.meter!.createCounter('pangolin_wg_handshake_total', {
            description: 'WG handshake attempts by result',
            unit: '{handshakes}'
        });
    }

    private initializeBackendMetrics() {
        // Observable gauge for backend health
        this.backendHealthStatus = this.meter!.createObservableGauge('pangolin_backend_health_status', {
            description: 'Backend health check result',
            unit: '{0|1}'
        });
        this.backendHealthStatus.addCallback((observableResult) => {
            for (const [key, data] of Array.from(this.observableData.backendHealthStatus.entries())) {
                observableResult.observe(data.value, {
                    backend: data.backend,
                    site_id: data.siteId
                });
            }
        });

        // Counter for backend connection errors
        this.backendConnectionErrorsTotal = this.meter!.createCounter('pangolin_backend_connection_errors_total', {
            description: 'Backend connection errors by type',
            unit: '{errors}'
        });

        // Histogram for backend response size
        this.backendResponseSizeBytes = this.meter!.createHistogram('pangolin_backend_response_size_bytes', {
            description: 'Response sizes by backend',
            unit: 'By'
        });
    }

    private initializeAuthMetrics() {
        // Counter for auth requests
        this.authRequestsTotal = this.meter!.createCounter('pangolin_auth_requests_total', {
            description: 'Auth attempts by method/result',
            unit: '{requests}'
        });

        // Histogram for auth request duration
        this.authRequestDurationSeconds = this.meter!.createHistogram('pangolin_auth_request_duration_seconds', {
            description: 'Auth latency',
            unit: 's'
        });

        // Observable gauge for active users
        this.authActiveUsers = this.meter!.createObservableGauge('pangolin_auth_active_users', {
            description: 'Number of active authenticated sessions',
            unit: '{users}'
        });
        this.authActiveUsers.addCallback((observableResult) => {
            for (const [key, data] of Array.from(this.observableData.authActiveUsers.entries())) {
                observableResult.observe(data.value, {
                    site_id: data.siteId,
                    auth_method: data.authMethod
                });
            }
        });

        // Counter for auth failures
        this.authFailureReasonsTotal = this.meter!.createCounter('pangolin_auth_failure_reasons_total', {
            description: 'Failure reasons for auth',
            unit: '{failures}'
        });

        // Counter for tokens issued
        this.tokenIssuedTotal = this.meter!.createCounter('pangolin_token_issued_total', {
            description: 'Tokens issued by auth method',
            unit: '{tokens}'
        });

        // Counter for tokens revoked
        this.tokenRevokedTotal = this.meter!.createCounter('pangolin_token_revoked_total', {
            description: 'Tokens revoked by reason',
            unit: '{tokens}'
        });

        // Counter for token refreshes
        this.tokenRefreshTotal = this.meter!.createCounter('pangolin_token_refresh_total', {
            description: 'Token refreshes by result',
            unit: '{refreshes}'
        });
    }

    private initializeUIMetrics() {
        // Counter for UI requests
        this.uiRequestsTotal = this.meter!.createCounter('pangolin_ui_requests_total', {
            description: 'UI/API requests by endpoint/method/status',
            unit: '{requests}'
        });

        // Observable gauge for active sessions
        this.uiActiveSessions = this.meter!.createObservableGauge('pangolin_ui_active_sessions', {
            description: 'Active UI sessions',
            unit: '{sessions}'
        });
        this.uiActiveSessions.addCallback((observableResult) => {
            observableResult.observe(this.observableData.uiActiveSessions);
        });
    }

    private initializeSystemMetrics() {
        // Counter for config reloads
        this.configReloadsTotal = this.meter!.createCounter('pangolin_config_reloads_total', {
            description: 'Config reload outcomes',
            unit: '{reloads}'
        });

        // Counter for restarts
        this.restartCountTotal = this.meter!.createCounter('pangolin_restart_count_total', {
            description: 'Process restarts',
            unit: '{restarts}'
        });

        // Counter for background jobs
        this.backgroundJobsTotal = this.meter!.createCounter('pangolin_background_jobs_total', {
            description: 'Background jobs by type/status',
            unit: '{jobs}'
        });

        // Observable gauge for certificate expiry
        this.certificatesExpiryDays = this.meter!.createObservableGauge('pangolin_certificates_expiry_days', {
            description: 'Days until certificate expiry',
            unit: 'd'
        });
        this.certificatesExpiryDays.addCallback((observableResult) => {
            for (const [key, data] of Array.from(this.observableData.certificatesExpiryDays.entries())) {
                observableResult.observe(data.value, {
                    site_id: data.siteId,
                    resource_id: data.resourceId
                });
            }
        });
    }

    private initializeWebSocketMetrics() {
        // Counter for WebSocket connections
        this.wsConnectionsTotal = this.meter!.createCounter('pangolin_ws_connections_total', {
            description: 'Count Newt WS connection attempts by result and site_id',
            unit: '{connections}'
        });

        // Observable gauge for active WebSocket connections
        this.wsActiveConnections = this.meter!.createObservableGauge('pangolin_ws_active_connections', {
            description: 'Current WS connections per site',
            unit: '{connections}'
        });
        this.wsActiveConnections.addCallback((observableResult) => {
            for (const [siteId, count] of Array.from(this.observableData.wsActiveConnections.entries())) {
                observableResult.observe(count, { site_id: siteId });
            }
        });

        // Counter for WebSocket messages
        this.wsMessagesTotal = this.meter!.createCounter('pangolin_ws_messages_total', {
            description: 'In/out WS control/data messages by direction and msg_type',
            unit: '{messages}'
        });
    }

    private initializeTraefikMetrics() {
        // Histogram for Traefik provider sync
        this.traefikProviderSyncSeconds = this.meter!.createHistogram('pangolin_traefik_provider_sync_seconds', {
            description: 'Duration to render & push dynamic config to Traefik',
            unit: 's'
        });

        // Counter for Traefik provider errors
        this.traefikProviderErrorsTotal = this.meter!.createCounter('pangolin_traefik_provider_errors_total', {
            description: 'Config-provider errors by error_type',
            unit: '{errors}'
        });

        // Counter for plugin fetches
        this.pluginFetchTotal = this.meter!.createCounter('pangolin_plugin_fetch_total', {
            description: 'Traefik plugin fetch attempts by plugin and result',
            unit: '{fetches}'
        });
    }

    private initializeACMEMetrics() {
        // Counter for ACME cert events
        this.acmeCertEventsTotal = this.meter!.createCounter('pangolin_acme_cert_events_total', {
            description: 'ACME events by domain',
            unit: '{events}'
        });

        // Observable gauge for ACME cert expiry
        this.acmeCertExpiryDays = this.meter!.createObservableGauge('pangolin_acme_cert_expiry_days', {
            description: 'Days until cert expiry per domain',
            unit: 'd'
        });
        this.acmeCertExpiryDays.addCallback((observableResult) => {
            for (const [domain, days] of Array.from(this.observableData.acmeCertExpiryDays.entries())) {
                observableResult.observe(days, { domain });
            }
        });
    }

    private initializeDatabaseMetrics() {
        // Observable gauge for DB pool connections
        this.dbPoolConnections = this.meter!.createObservableGauge('pangolin_db_pool_connections', {
            description: 'DB pool state',
            unit: '{connections}'
        });
        this.dbPoolConnections.addCallback((observableResult) => {
            for (const [state, count] of Array.from(this.observableData.dbPoolConnections.entries())) {
                observableResult.observe(count, { state });
            }
        });

        // Counter for DB wait time
        this.dbWaitSecondsTotal = this.meter!.createCounter('pangolin_db_wait_seconds_total', {
            description: 'Time spent waiting for a DB connection',
            unit: 's'
        });
    }

    private initializeIntegrationMetrics() {
        // Counter for integration API requests
        this.integrationApiRequestsTotal = this.meter!.createCounter('pangolin_integration_api_requests_total', {
            description: 'Requests to internal/integration APIs by endpoint, method, status',
            unit: '{requests}'
        });

        // Histogram for integration API duration
        this.integrationApiDurationSeconds = this.meter!.createHistogram('pangolin_integration_api_duration_seconds', {
            description: 'Latency for internal API calls',
            unit: 's'
        });
    }

    private initializeBackgroundQueueMetrics() {
        // Counter for holepunch orchestration
        this.holepunchOrchestrationTotal = this.meter!.createCounter('pangolin_holepunch_orchestration_total', {
            description: 'Hole-punch coordination messages by result/reason',
            unit: '{messages}'
        });

        // Observable gauge for background queue depth
        this.backgroundQueueDepth = this.meter!.createObservableGauge('pangolin_background_queue_depth', {
            description: 'Pending background jobs by job_type',
            unit: '{jobs}'
        });
        this.backgroundQueueDepth.addCallback((observableResult) => {
            for (const [jobType, depth] of Array.from(this.observableData.backgroundQueueDepth.entries())) {
                observableResult.observe(depth, { job_type: jobType });
            }
        });
    }

    // Helper methods for updating observable data

    setSiteActiveSites(region: string, count: number) {
        this.observableData.siteActiveSites.set(region, count);
    }

    setSiteOnline(siteId: string, transport: string, online: boolean) {
        const key = `${siteId}:${transport}`;
        this.observableData.siteOnline.set(key, { siteId, transport, value: online ? 1 : 0 });
    }

    setResourceActiveConnections(siteId: string, resourceId: string, protocol: string, count: number) {
        const key = `${siteId}:${resourceId}:${protocol}`;
        this.observableData.resourceActiveConnections.set(key, { siteId, resourceId, protocol, value: count });
    }

    setTunnelUp(siteId: string, transport: string, up: boolean) {
        const key = `${siteId}:${transport}`;
        this.observableData.tunnelUp.set(key, { siteId, transport, value: up ? 1 : 0 });
    }

    setBackendHealthStatus(backend: string, siteId: string, healthy: boolean) {
        const key = `${backend}:${siteId}`;
        this.observableData.backendHealthStatus.set(key, { backend, siteId, value: healthy ? 1 : 0 });
    }

    setAuthActiveUsers(siteId: string, authMethod: string, count: number) {
        const key = `${siteId}:${authMethod}`;
        this.observableData.authActiveUsers.set(key, { siteId, authMethod, value: count });
    }

    setUiActiveSessions(count: number) {
        this.observableData.uiActiveSessions = count;
    }

    setCertificateExpiryDays(siteId: string, resourceId: string, days: number) {
        const key = `${siteId}:${resourceId}`;
        this.observableData.certificatesExpiryDays.set(key, { siteId, resourceId, value: days });
    }

    setWsActiveConnections(siteId: string, count: number) {
        this.observableData.wsActiveConnections.set(siteId, count);
    }

    setAcmeCertExpiryDays(domain: string, days: number) {
        this.observableData.acmeCertExpiryDays.set(domain, days);
    }

    setDbPoolConnections(state: string, count: number) {
        this.observableData.dbPoolConnections.set(state, count);
    }

    setBackgroundQueueDepth(jobType: string, depth: number) {
        this.observableData.backgroundQueueDepth.set(jobType, depth);
    }

    shutdown() {
        if (this.meterProvider) {
            this.meterProvider.shutdown();
        }
        if (this.prometheusExporter) {
            this.prometheusExporter.shutdown();
        }
    }
}

// Singleton instance
let metricsService: MetricsService | null = null;

export function initMetricsService(port?: number): MetricsService {
    if (!metricsService) {
        metricsService = new MetricsService();
        metricsService.initialize(port);
    }
    return metricsService;
}

export function recordRestart() {
    // Call this function on actual server restart to increment the counter
    if (metricsService) {
        metricsService.restartCountTotal.add(1);
    }
}

export function getMetricsService(): MetricsService {
    if (!metricsService) {
        throw new Error('Metrics service not initialized. Call initMetricsService() first.');
    }
    return metricsService;
}

export default metricsService;
