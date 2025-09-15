# Pangolin Observability

## Overview

Pangolin implements OpenTelemetry-based metrics collection and export using industry best practices:

- **Prometheus scrape endpoint**: Exposed at `http://localhost:8081/metrics` for pull-based collection
- **OTLP export**: Push metrics to an OpenTelemetry Collector via gRPC (configurable)
- **Low-cardinality labels**: All metrics adhere to Prometheus naming conventions with stable label sets

## Architecture

```
┌─────────────┐
│  Pangolin   │
│  (Node.js)  │
├─────────────┤
│ OTel SDK    │──────► :8081/metrics (Prometheus scrape)
│ Metrics API │
└──────┬──────┘
       │
       │ OTLP/gRPC
       ▼
┌─────────────┐
│    OTel     │
│  Collector  │──────► :8889 (Prometheus exporter)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Prometheus  │──────► :9090 (Query UI)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Grafana    │──────► :3005 (Dashboards)
└─────────────┘
```

## Metric Catalog

### Site / Global Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `pangolin_site_active_sites` | Gauge | `site_id`, `region` | Number of active sites |
| `pangolin_site_online` | Gauge | `site_id`, `transport` | Site online status (0/1) |
| `pangolin_site_bandwidth_bytes_total` | Counter | `site_id`, `direction`, `protocol` | Total bandwidth in bytes |
| `pangolin_site_uptime_seconds_total` | Counter | `site_id` | Accumulated uptime in seconds |
| `pangolin_site_connection_drops_total` | Counter | `site_id` | Connection drop events |
| `pangolin_site_handshake_latency_seconds` | Histogram | `site_id`, `transport` | Handshake latency distribution |

### Resource / App Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `pangolin_resource_requests_total` | Counter | `site_id`, `resource_id`, `backend`, `method`, `status` | Total resource requests |
| `pangolin_resource_request_duration_seconds` | Histogram | `site_id`, `resource_id`, `backend`, `method` | Request duration distribution |
| `pangolin_resource_active_connections` | Gauge | `site_id`, `resource_id`, `protocol` | Active connections |
| `pangolin_resource_errors_total` | Counter | `site_id`, `resource_id`, `backend`, `error_type` | Total errors |
| `pangolin_resource_bandwidth_bytes_total` | Counter | `site_id`, `resource_id`, `direction` | Resource bandwidth usage |

### Tunnel / Transport Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `pangolin_tunnel_up` | Gauge | `site_id`, `transport` | Tunnel status (0/1) |
| `pangolin_tunnel_reconnects_total` | Counter | `site_id`, `transport`, `reason` | Reconnection events |
| `pangolin_tunnel_latency_seconds` | Histogram | `site_id`, `transport` | Tunnel latency |
| `pangolin_tunnel_bytes_total` | Counter | `site_id`, `transport`, `direction` | Tunnel bandwidth |
| `pangolin_wg_handshake_total` | Counter | `site_id`, `result` | WireGuard handshakes |

### Backend Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `pangolin_backend_health_status` | Gauge | `backend`, `site_id` | Backend health (0/1) |
| `pangolin_backend_connection_errors_total` | Counter | `backend`, `site_id`, `error_type` | Connection errors |
| `pangolin_backend_response_size_bytes` | Histogram | `backend`, `site_id` | Response size distribution |

### Auth / Identity Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `pangolin_auth_requests_total` | Counter | `site_id`, `auth_method`, `result` | Authentication requests |
| `pangolin_auth_request_duration_seconds` | Histogram | `auth_method`, `result` | Auth duration |
| `pangolin_auth_active_users` | Gauge | `site_id`, `auth_method` | Active user count |
| `pangolin_auth_failure_reasons_total` | Counter | `site_id`, `reason`, `auth_method` | Auth failures by reason |

### Token / Session Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `pangolin_token_issued_total` | Counter | `site_id`, `auth_method` | Tokens issued |
| `pangolin_token_revoked_total` | Counter | `reason` | Tokens revoked |
| `pangolin_token_refresh_total` | Counter | `site_id`, `result` | Token refreshes |

### UI / API Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `pangolin_ui_requests_total` | Counter | `endpoint`, `method`, `status` | UI/API requests |
| `pangolin_ui_active_sessions` | Gauge | - | Active UI sessions |

### Operational Metrics

| Metric Name | Type | Labels | Description |
|------------|------|--------|-------------|
| `pangolin_config_reloads_total` | Counter | `result` | Configuration reloads |
| `pangolin_restart_count_total` | Counter | - | Process restarts |
| `pangolin_background_jobs_total` | Counter | `job_type`, `status` | Background job executions |
| `pangolin_certificates_expiry_days` | Gauge | `site_id`, `resource_id` | Days until certificate expiry |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PANGOLIN_OTEL_PROM_ENABLE` | `true` | Enable Prometheus scrape endpoint |
| `PANGOLIN_OTEL_PROM_PORT` | `8081` | Prometheus endpoint port |
| `PANGOLIN_OTEL_PROM_PATH` | `/metrics` | Prometheus endpoint path |
| `PANGOLIN_OTEL_OTLP_ENABLE` | `true` | Enable OTLP export |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4317` | OTLP collector endpoint |
| `PANGOLIN_OTEL_OTLP_INTERVAL_MS` | `60000` | OTLP export interval (ms) |
| `OTEL_SERVICE_NAME` | `pangolin` | Service name in metrics |
| `PANGOLIN_ENV` | `dev` | Environment label |
| `PANGOLIN_METRICS_BUCKETS_LATENCY` | `0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5,10` | Histogram buckets for latency (seconds) |
| `PANGOLIN_METRICS_BUCKETS_SIZE` | `256,512,1024,2048,4096,8192,16384,32768,65536,131072,262144,524288,1048576,2097152,5242880,10485760` | Histogram buckets for sizes (bytes) |

## Running the Metrics Stack

### Using Docker Compose

```bash
# Build and start the full stack
docker compose -f docker-compose.metrics.yml up --build

# Services will be available at:
# - Pangolin API: http://localhost:3000
# - Prometheus metrics: http://localhost:8081/metrics
# - Prometheus UI: http://localhost:9090
# - Grafana: http://localhost:3005 (admin/admin)
```

### Testing Metrics

1. Generate some traffic:
```bash
# Create API requests
for i in {1..10}; do
  curl http://localhost:3000/api/v1/traefik-config
done
```

2. View raw metrics:
```bash
curl http://localhost:8081/metrics | grep pangolin_
```

3. Query in Prometheus (http://localhost:9090):
```promql
# Request rate
rate(pangolin_ui_requests_total[5m])

# 95th percentile latency
histogram_quantile(0.95, 
  sum by (le) (
    rate(pangolin_resource_request_duration_seconds_bucket[10m])
  )
)

# Bandwidth by site and direction
sum by (site_id, direction) (
  rate(pangolin_site_bandwidth_bytes_total[5m])
)

# Backend health
avg_over_time(pangolin_backend_health_status[15m])
```

## Performance Best Practices

### Label Cardinality

Keep labels low-cardinality (< 10 unique values per label):
- ✅ Good: `status="200"`, `method="GET"`, `site_id="123"`
- ❌ Bad: `user_id="uuid"`, `request_id="random"`, `ip="1.2.3.4"`

### Histogram Buckets

Default buckets are optimized for typical web applications:
- Latency: milliseconds to seconds range
- Size: bytes to megabytes range

Customize via environment variables if your workload differs.

### Sampling Rate

Observable gauges (e.g., active sites, health status) are sampled:
- Sites: every 30 seconds
- Active users: every 60 seconds
- Backend health: every 60 seconds

## Troubleshooting

### No metrics appearing

1. Check if OTel is enabled:
```bash
docker logs pangolin-metrics | grep "Prometheus scrape endpoint"
```

2. Verify endpoint is accessible:
```bash
curl http://localhost:8081/metrics
```

3. Check Prometheus targets (http://localhost:9090/targets)

### High memory usage

Reduce cardinality by:
- Removing high-cardinality labels
- Increasing aggregation intervals
- Reducing histogram buckets

### Missing specific metrics

Some metrics require specific events:
- Bandwidth metrics: Require gerbil/newt to send bandwidth updates
- Auth metrics: Require authentication events
- Certificate metrics: Require certificate data in the system

## Integration with Helm

The metrics configuration aligns with the Pangolin Helm chart defaults:
- Metrics port: 8081 (matches `values.yaml` defaults)
- Path: `/metrics`
- ServiceMonitor/PodMonitor CRDs supported for Kubernetes deployments

## Future Enhancements

- Tracing support (spans for request flows)
- Custom business metrics via API
- Alerting rules for Prometheus
- Pre-built Grafana dashboards
- Metrics aggregation for multi-site deployments
