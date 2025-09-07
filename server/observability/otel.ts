import { metrics } from "@opentelemetry/api";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

// Centralized OpenTelemetry metrics bootstrap for Pangolin (Node/TS)
// - Exposes Prometheus scrape endpoint (pull) on :8081/metrics by default
// - Optionally exports OTLP metrics (push) to a Collector via gRPC

let meterProvider: MeterProvider | null = null;

export async function startOtel() {
  if (meterProvider) return; // idempotent

  const promEnabled = (process.env.PANGOLIN_OTEL_PROM_ENABLE ?? "true").toLowerCase() !== "false";
  const promPort = Number(process.env.PANGOLIN_OTEL_PROM_PORT ?? "8081");
  const promPath = process.env.PANGOLIN_OTEL_PROM_PATH ?? "/metrics";

  const otlpEnabled = (process.env.PANGOLIN_OTEL_OTLP_ENABLE ?? "true").toLowerCase() !== "false";
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://otel-collector:4317";
  const otlpIntervalMs = Number(process.env.PANGOLIN_OTEL_OTLP_INTERVAL_MS ?? "60000");

  // Prefer environment variables for resource attributes (OTEL_SERVICE_NAME, OTEL_RESOURCE_ATTRIBUTES)

  // Always create a provider up-front with explicit Resource attributes
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "pangolin",
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION ?? "0.0.0",
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.PANGOLIN_ENV ?? process.env.ENVIRONMENT ?? "dev",
  });
  meterProvider = new MeterProvider({ resource });

  if (promEnabled) {
    const promExporter = new PrometheusExporter(
      { port: promPort, endpoint: promPath, startServer: true } as any,
      () => {
        // eslint-disable-next-line no-console
        console.log(`Prometheus scrape endpoint listening on :${promPort}${promPath}`);
      }
    );
    meterProvider.addMetricReader(promExporter as any);
  }

  if (otlpEnabled) {
    const otlpExporter = new OTLPMetricExporter({ url: otlpEndpoint });
    const periodicReader = new PeriodicExportingMetricReader({ exporter: otlpExporter, exportIntervalMillis: otlpIntervalMs });
    meterProvider.addMetricReader(periodicReader);
  }

  metrics.setGlobalMeterProvider(meterProvider);

  // graceful shutdown
  const shutdown = async () => {
    try {
      await meterProvider?.shutdown();
    } catch (_) {
      // ignore
    }
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

export function getMeter() {
  return metrics.getMeter("pangolin");
}
