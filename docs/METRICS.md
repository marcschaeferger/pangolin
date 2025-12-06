# OpenTelemetry Metrics Implementation

This implementation provides comprehensive metrics for monitoring Pangolin using OpenTelemetry and Prometheus.

## Configuration

Add metrics configuration to your `config.yml`:

```yaml
metrics:
  enabled: true  # Enable/disable metrics collection (default: true)
  port: 9464     # Prometheus metrics endpoint port (default: 9464)
```

## Accessing Metrics

Once the server is running, metrics are available at:

```
http://localhost:9464/metrics
```

This endpoint exposes metrics in Prometheus format, which can be scraped by Prometheus or other compatible monitoring tools.

## Available Metrics

### Site Metrics
- `pangolin_site_active_sites` - Number of active sites by region
- `pangolin_site_online` - Site online status (0/1) by site_id and transport
- `pangolin_site_bandwidth_bytes_total` - Cumulative bandwidth by site_id, direction, and protocol
- `pangolin_site_uptime_seconds_total` - Site uptime in seconds
- `pangolin_site_connection_drops_total` - Connection drops by site_id
- `pangolin_site_handshake_latency_seconds` - Handshake latency distribution

### Resource Metrics
- `pangolin_resource_requests_total` - Total proxied requests by site_id, resource_id, backend, method, and status
- `pangolin_resource_request_duration_seconds` - Request duration distribution
- `pangolin_resource_active_connections` - Active connections by site_id, resource_id, and protocol
- `pangolin_resource_errors_total` - Errors by site_id, resource_id, backend, and error_type
- `pangolin_resource_bandwidth_bytes_total` - Resource bandwidth by direction

### Tunnel Metrics
- `pangolin_tunnel_up` - Tunnel health status (0/1) by site_id and transport
- `pangolin_tunnel_reconnects_total` - Reconnection count by site_id, transport, and reason
- `pangolin_tunnel_latency_seconds` - RTT latency distribution
- `pangolin_tunnel_bytes_total` - Tunnel bytes by direction

### WireGuard Metrics
- `pangolin_wg_handshake_total` - WireGuard handshake attempts by result

### Backend Metrics
- `pangolin_backend_health_status` - Backend health (0/1) by backend and site_id
- `pangolin_backend_connection_errors_total` - Connection errors by backend, site_id, and error_type
- `pangolin_backend_response_size_bytes` - Response size distribution

### Authentication Metrics
- `pangolin_auth_requests_total` - Auth attempts by site_id, auth_method, and result
- `pangolin_auth_request_duration_seconds` - Auth latency distribution
- `pangolin_auth_active_users` - Active authenticated sessions
- `pangolin_auth_failure_reasons_total` - Auth failures by reason
- `pangolin_token_issued_total` - Tokens issued by auth_method
- `pangolin_token_revoked_total` - Tokens revoked by reason
- `pangolin_token_refresh_total` - Token refreshes by result

### UI Metrics
- `pangolin_ui_requests_total` - UI/API requests by endpoint, method, and status
- `pangolin_ui_active_sessions` - Active UI sessions

### System Metrics
- `pangolin_config_reloads_total` - Config reload outcomes
- `pangolin_restart_count_total` - Process restart count
- `pangolin_background_jobs_total` - Background jobs by type and status
- `pangolin_certificates_expiry_days` - Certificate expiry in days

### WebSocket Metrics
- `pangolin_ws_connections_total` - WebSocket connection attempts by site_id and result
- `pangolin_ws_active_connections` - Active WebSocket connections by site_id
- `pangolin_ws_messages_total` - WebSocket messages by direction and msg_type

### Traefik Metrics
- `pangolin_traefik_provider_sync_seconds` - Config sync duration
- `pangolin_traefik_provider_errors_total` - Provider errors by error_type
- `pangolin_plugin_fetch_total` - Plugin fetch attempts by plugin and result

### ACME Metrics
- `pangolin_acme_cert_events_total` - ACME events by domain and event type
- `pangolin_acme_cert_expiry_days` - Certificate expiry in days

### Database Metrics
- `pangolin_db_pool_connections` - DB pool connections by state
- `pangolin_db_wait_seconds_total` - DB connection wait time

### Integration Metrics
- `pangolin_integration_api_requests_total` - Integration API requests
- `pangolin_integration_api_duration_seconds` - Integration API latency

### Background Queue Metrics
- `pangolin_holepunch_orchestration_total` - Hole-punch orchestration messages
- `pangolin_background_queue_depth` - Pending background jobs by type

## Usage Examples

### Recording a Counter Metric

```typescript
import { getMetricsService } from '@server/lib/metrics';

const metrics = getMetricsService();

// Record a site connection drop
metrics.siteConnectionDropsTotal.add(1, {
    site_id: 's-abc'
});

// Record bandwidth
metrics.siteBandwidthBytesTotal.add(4096, {
    site_id: 's-abc',
    direction: 'egress',
    protocol: 'tcp'
});
```

### Recording a Histogram Metric

```typescript
import { getMetricsService } from '@server/lib/metrics';

const metrics = getMetricsService();
const startTime = Date.now();

// ... perform operation ...

const duration = (Date.now() - startTime) / 1000; // Convert to seconds

// Record handshake latency
metrics.siteHandshakeLatencySeconds.record(duration, {
    site_id: 's-abc',
    transport: 'websocket'
});
```

### Updating Observable Gauge Data

```typescript
import { getMetricsService } from '@server/lib/metrics';

const metrics = getMetricsService();

// Update site online status
metrics.setSiteOnline('s-abc', 'websocket', true);

// Update active connections count
metrics.setResourceActiveConnections('s-abc', 'api', 'http/1.1', 12);

// Update UI active sessions
metrics.setUiActiveSessions(5);
```

## Integration with Prometheus

To scrape these metrics with Prometheus, add the following to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'pangolin'
    static_configs:
      - targets: ['localhost:9464']
```

## Integration with Grafana

You can create dashboards in Grafana to visualize these metrics. Example queries:

```promql
# Site bandwidth rate
rate(pangolin_site_bandwidth_bytes_total[5m])

# Request rate by endpoint
rate(pangolin_resource_requests_total[5m])

# Average request duration
rate(pangolin_resource_request_duration_seconds_sum[5m]) 
  / rate(pangolin_resource_request_duration_seconds_count[5m])

# Active connections
pangolin_resource_active_connections

# Error rate
rate(pangolin_resource_errors_total[5m])
```

## Disabling Metrics

To disable metrics collection, set `enabled: false` in your config:

```yaml
metrics:
  enabled: false
```

Or omit the metrics section entirely from your config file.
