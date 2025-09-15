import { Attributes, metrics } from "@opentelemetry/api";
import { db, sites, sessions, resources } from "@server/db";
import { and, count, eq, gt } from "drizzle-orm";

// Canonical Pangolin metrics (Prometheus naming, OTel API)
// Low-cardinality labels only.

import type { Meter, Counter, Histogram, ObservableGauge } from "@opentelemetry/api";

let initialized = false;
let meter: Meter;

// ------------------------- Instruments (lazy) -------------------------
export const counters: {
  siteBandwidthBytes?: Counter;
  siteUptimeSeconds?: Counter;
  siteConnectionDrops?: Counter;
  tunnelReconnects?: Counter;
  tunnelBytes?: Counter;
  wgHandshakeTotal?: Counter;
  resourceRequests?: Counter;
  resourceErrors?: Counter;
  resourceBandwidthBytes?: Counter;
  authRequests?: Counter;
  authFailureReasons?: Counter;
  tokenIssued?: Counter;
  tokenRevoked?: Counter;
  tokenRefresh?: Counter;
  uiRequests?: Counter;
  configReloads?: Counter;
  restartCount?: Counter;
  backgroundJobs?: Counter;
} = {};

export const histograms: {
  siteHandshakeLatency?: Histogram;
  tunnelLatency?: Histogram;
  backendResponseSize?: Histogram;
  resourceRequestDuration?: Histogram;
  authRequestDuration?: Histogram;
} = {};

// ------------------------- Observable Gauges -------------------------
// Store last-sampled values; callbacks must be sync.
let lastSitesSnapshot: Array<{ siteId: number; online: boolean; type: string | null; region?: string | null } > = [];
let lastActiveUsers = 0;
let lastUiActiveSessions = 0;
let lastCertificates: Array<{ siteId?: number; resourceId?: number; days: number }> = [];
let backendHealth: Array<{ backend: string; siteId?: number; healthy: boolean }> = [];

let siteActiveSites: ObservableGauge | undefined;
let siteOnline: ObservableGauge | undefined;
let resourceActiveConnections: ObservableGauge | undefined;
let tunnelUp: ObservableGauge | undefined;
let backendHealthStatus: ObservableGauge | undefined;
let authActiveUsers: ObservableGauge | undefined;
let uiActiveSessions: ObservableGauge | undefined;
let certificatesExpiryDays: ObservableGauge | undefined;

function ensureInit() {
  if (initialized) return;
  meter = metrics.getMeter("pangolin");

  counters.siteBandwidthBytes = meter.createCounter("pangolin_site_bandwidth_bytes_total", { description: "Total site bandwidth bytes", unit: "bytes" });
  counters.siteUptimeSeconds = meter.createCounter("pangolin_site_uptime_seconds_total", { description: "Accumulated site uptime in seconds", unit: "seconds" });
  counters.siteConnectionDrops = meter.createCounter("pangolin_site_connection_drops_total", { description: "Connection drop events per site" });
  counters.tunnelReconnects = meter.createCounter("pangolin_tunnel_reconnects_total", { description: "Tunnel reconnect events" });
  counters.tunnelBytes = meter.createCounter("pangolin_tunnel_bytes_total", { description: "Tunnel bytes by direction", unit: "bytes" });
  counters.wgHandshakeTotal = meter.createCounter("pangolin_wg_handshake_total", { description: "WireGuard handshake events" });
  counters.resourceRequests = meter.createCounter("pangolin_resource_requests_total", { description: "Resource requests" });
  counters.resourceErrors = meter.createCounter("pangolin_resource_errors_total", { description: "Resource errors" });
  counters.resourceBandwidthBytes = meter.createCounter("pangolin_resource_bandwidth_bytes_total", { description: "Per-resource bandwidth bytes", unit: "bytes" });
  counters.authRequests = meter.createCounter("pangolin_auth_requests_total", { description: "Auth requests" });
  counters.authFailureReasons = meter.createCounter("pangolin_auth_failure_reasons_total", { description: "Auth failures by reason" });
  counters.tokenIssued = meter.createCounter("pangolin_token_issued_total", { description: "Tokens issued" });
  counters.tokenRevoked = meter.createCounter("pangolin_token_revoked_total", { description: "Tokens revoked" });
  counters.tokenRefresh = meter.createCounter("pangolin_token_refresh_total", { description: "Tokens refreshed" });
  counters.uiRequests = meter.createCounter("pangolin_ui_requests_total", { description: "UI/API requests" });
  counters.configReloads = meter.createCounter("pangolin_config_reloads_total", { description: "Config reloads" });
  counters.restartCount = meter.createCounter("pangolin_restart_count_total", { description: "Process restarts" });
  counters.backgroundJobs = meter.createCounter("pangolin_background_jobs_total", { description: "Background job counts" });

  histograms.siteHandshakeLatency = meter.createHistogram("pangolin_site_handshake_latency_seconds", { description: "Site handshake latency", unit: "seconds" });
  histograms.tunnelLatency = meter.createHistogram("pangolin_tunnel_latency_seconds", { description: "Tunnel latency", unit: "seconds" });
  histograms.backendResponseSize = meter.createHistogram("pangolin_backend_response_size_bytes", { description: "Backend response size", unit: "bytes" });
  histograms.resourceRequestDuration = meter.createHistogram("pangolin_resource_request_duration_seconds", { description: "Resource request duration", unit: "seconds" });
  histograms.authRequestDuration = meter.createHistogram("pangolin_auth_request_duration_seconds", { description: "Auth request duration", unit: "seconds" });

  siteActiveSites = meter.createObservableGauge("pangolin_site_active_sites", { description: "Active sites (1 per active)", unit: "count" });
  siteOnline = meter.createObservableGauge("pangolin_site_online", { description: "Site online state" });
  resourceActiveConnections = meter.createObservableGauge("pangolin_resource_active_connections", { description: "Active resource connections", unit: "count" });
  tunnelUp = meter.createObservableGauge("pangolin_tunnel_up", { description: "Tunnel up (0/1)" });
  backendHealthStatus = meter.createObservableGauge("pangolin_backend_health_status", { description: "Backend health (0/1)" });
  authActiveUsers = meter.createObservableGauge("pangolin_auth_active_users", { description: "Active users", unit: "count" });
  uiActiveSessions = meter.createObservableGauge("pangolin_ui_active_sessions", { description: "Active UI sessions", unit: "count" });
  certificatesExpiryDays = meter.createObservableGauge("pangolin_certificates_expiry_days", { description: "Certificates expiry in days", unit: "days" });

  siteActiveSites.addCallback((obs) => {
    for (const s of lastSitesSnapshot) {
      const labels: Attributes = { site_id: String(s.siteId), region: s.region ?? "unknown" };
      if (s.online) obs.observe(1, labels);
    }
  });

  siteOnline.addCallback((obs) => {
    for (const s of lastSitesSnapshot) {
      const labels: Attributes = { site_id: String(s.siteId), transport: s.type ?? "unknown" };
      obs.observe(s.online ? 1 : 0, labels);
    }
  });

  tunnelUp.addCallback((obs) => {
    for (const s of lastSitesSnapshot) {
      const labels: Attributes = { site_id: String(s.siteId), transport: s.type ?? "unknown" };
      obs.observe(s.online ? 1 : 0, labels);
    }
  });

  backendHealthStatus.addCallback((obs) => {
    for (const b of backendHealth) {
      const labels: Attributes = { backend: b.backend };
      if (b.siteId) (labels as any).site_id = String(b.siteId);
      obs.observe(b.healthy ? 1 : 0, labels);
    }
  });

  authActiveUsers.addCallback((obs) => {
    obs.observe(lastActiveUsers, { auth_method: "session" });
  });

  uiActiveSessions.addCallback((obs) => {
    obs.observe(lastUiActiveSessions);
  });

  certificatesExpiryDays.addCallback((obs) => {
    for (const c of lastCertificates) {
      const labels: Attributes = {};
      if (c.siteId) (labels as any).site_id = String(c.siteId);
      if (c.resourceId) (labels as any).resource_id = String(c.resourceId);
      obs.observe(c.days, labels);
    }
  });

  initialized = true;
}

// ------------------------- Helper updaters -------------------------
export const helpers = {
  incRestart() {
    ensureInit();
    counters.restartCount!.add(1);
  },
  incConfigReload(result: string = "success") {
    ensureInit();
    counters.configReloads!.add(1, { result });
  },
  recordBackendResponse(resSizeBytes: number, labels: Attributes) {
    ensureInit();
    histograms.backendResponseSize!.record(resSizeBytes, labels);
  },
  recordUiRequest(method: string, endpoint: string, status: number) {
    ensureInit();
    counters.uiRequests!.add(1, { method, endpoint, status: String(status) });
  },
  recordUiRequestDuration(seconds: number, method: string, endpoint: string) {
    ensureInit();
    histograms.resourceRequestDuration!.record(seconds, { method, endpoint });
  },
  recordResourceRequest(site_id?: string | number, resource_id?: string | number, backend?: string, method?: string, status?: number) {
    ensureInit();
    const labels: Attributes = {};
    if (site_id !== undefined) (labels as any).site_id = String(site_id);
    if (resource_id !== undefined) (labels as any).resource_id = String(resource_id);
    if (backend) (labels as any).backend = backend;
    if (method) (labels as any).method = method;
    if (status !== undefined) (labels as any).status = String(status);
    counters.resourceRequests!.add(1, labels);
  },
  recordResourceError(resource_id?: string | number, backend?: string, error_type?: string, site_id?: string | number) {
    ensureInit();
    const labels: Attributes = {};
    if (resource_id !== undefined) (labels as any).resource_id = String(resource_id);
    if (backend) (labels as any).backend = backend;
    if (error_type) (labels as any).error_type = error_type;
    if (site_id !== undefined) (labels as any).site_id = String(site_id);
    counters.resourceErrors!.add(1, labels);
  },
  recordResourceDuration(seconds: number, site_id?: string | number, resource_id?: string | number, backend?: string, method?: string) {
    ensureInit();
    const labels: Attributes = {};
    if (site_id !== undefined) (labels as any).site_id = String(site_id);
    if (resource_id !== undefined) (labels as any).resource_id = String(resource_id);
    if (backend) (labels as any).backend = backend;
    if (method) (labels as any).method = method;
    histograms.resourceRequestDuration!.record(seconds, labels);
  },
  addSiteBandwidth(site_id: number, direction: "in" | "out", protocol: string, bytes: number) {
    ensureInit();
    counters.siteBandwidthBytes!.add(bytes, { site_id: String(site_id), direction, protocol });
    counters.tunnelBytes!.add(bytes, { site_id: String(site_id), transport: protocol, direction });
  },
  incConnectionDrop(site_id: number) {
    ensureInit();
    counters.siteConnectionDrops!.add(1, { site_id: String(site_id) });
  },
  recordHandshakeLatency(site_id: number, transport: string, seconds: number) {
    ensureInit();
    histograms.siteHandshakeLatency!.record(seconds, { site_id: String(site_id), transport });
  },
  incTunnelReconnect(site_id: number, transport: string, reason: string = "unknown") {
    ensureInit();
    counters.tunnelReconnects!.add(1, { site_id: String(site_id), transport, reason });
  },
  incWgHandshake(site_id: number, result: string = "success") {
    ensureInit();
    counters.wgHandshakeTotal!.add(1, { site_id: String(site_id), result });
  },
  incAuthRequest(site_id?: number, method?: string, result?: string) {
    ensureInit();
    const labels: Attributes = {};
    if (site_id !== undefined) (labels as any).site_id = String(site_id);
    if (method) (labels as any).auth_method = method;
    if (result) (labels as any).result = result;
    counters.authRequests!.add(1, labels);
  },
  incAuthFailure(site_id?: number, reason?: string, method?: string) {
    ensureInit();
    const labels: Attributes = {};
    if (site_id !== undefined) (labels as any).site_id = String(site_id);
    if (reason) (labels as any).reason = reason;
    if (method) (labels as any).auth_method = method;
    counters.authFailureReasons!.add(1, labels);
  },
  incTokenIssued(site_id?: number, method?: string) {
    ensureInit();
    const labels: Attributes = {};
    if (site_id !== undefined) (labels as any).site_id = String(site_id);
    if (method) (labels as any).auth_method = method;
    counters.tokenIssued!.add(1, labels);
  },
  incTokenRevoked(reason?: string) {
    ensureInit();
    const labels: Attributes = {};
    if (reason) (labels as any).reason = reason;
    counters.tokenRevoked!.add(1, labels);
  },
  incTokenRefresh(site_id?: number, result?: string) {
    ensureInit();
    const labels: Attributes = {};
    if (site_id !== undefined) (labels as any).site_id = String(site_id);
    if (result) (labels as any).result = result;
    counters.tokenRefresh!.add(1, labels);
  },
};

// ------------------------- Pollers (DB sampling) -------------------------
export async function startObservablePollers() {
  ensureInit();
  // initial sample now, then at intervals
  await sampleSites();
  await sampleAuthUsers();
  await sampleBackendHealth();
  setInterval(sampleSites, 30000).unref();
  setInterval(sampleAuthUsers, 60000).unref();
  setInterval(sampleBackendHealth, 60000).unref();
}

async function sampleSites() {
  try {
    // Fetch minimal site data
    // @ts-ignore drizzle types vary by driver
    const rows = await db.select({ siteId: sites.siteId, online: sites.online, type: sites.type }).from(sites);
    lastSitesSnapshot = rows.map((r: any) => ({ siteId: Number(r.siteId), online: !!r.online, type: r.type ?? "unknown" }));
  } catch (e) {
    // leave snapshot as-is on error
  }
}

async function sampleAuthUsers() {
  try {
    const now = Date.now();
    // @ts-ignore
    const res = await db.select({ c: count() }).from(sessions).where(gt(sessions.expiresAt as any, now));
    lastActiveUsers = (Array.isArray(res) && res[0]?.c) ? Number(res[0].c) : 0;
    lastUiActiveSessions = lastActiveUsers; // same source for now
  } catch (_) {
    lastActiveUsers = 0;
    lastUiActiveSessions = 0;
  }
}

async function sampleBackendHealth() {
  const result: Array<{ backend: string; siteId?: number; healthy: boolean }> = [];
  try {
    // attempt lightweight query
    // @ts-ignore
    await db.select({ one: count() }).from(resources).limit(1);
    result.push({ backend: "database", healthy: true });
  } catch (_) {
    result.push({ backend: "database", healthy: false });
  }
  backendHealth = result;
}
