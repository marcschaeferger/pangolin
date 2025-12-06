#!/usr/bin/env node
/**
 * Test script to verify metrics service initialization
 * This validates that all metrics are properly configured and can be initialized
 */

import { initMetricsService, getMetricsService } from './lib/metrics.js';

async function testMetricsService() {
    console.log('Testing OpenTelemetry Metrics Service...\n');

    try {
        // Initialize metrics service on a test port
        console.log('1. Initializing metrics service on port 9465...');
        const metrics = initMetricsService(9465);
        console.log('✓ Metrics service initialized successfully\n');

        // Test that we can get the service
        console.log('2. Testing getMetricsService()...');
        const metricsInstance = getMetricsService();
        console.log('✓ Metrics service retrieved successfully\n');

        // Test counter metrics
        console.log('3. Testing counter metrics...');
        metrics.siteConnectionDropsTotal.add(1, { site_id: 'test-site' });
        metrics.siteBandwidthBytesTotal.add(1024, { 
            site_id: 'test-site', 
            direction: 'egress', 
            protocol: 'tcp' 
        });
        console.log('✓ Counter metrics work\n');

        // Test histogram metrics
        console.log('4. Testing histogram metrics...');
        metrics.siteHandshakeLatencySeconds.record(0.25, { 
            site_id: 'test-site', 
            transport: 'websocket' 
        });
        metrics.resourceRequestDurationSeconds.record(0.1, {
            site_id: 'test-site',
            resource_id: 'api',
            backend: 'svc-A',
            method: 'GET'
        });
        console.log('✓ Histogram metrics work\n');

        // Test observable gauge setters
        console.log('5. Testing observable gauge setters...');
        metrics.setSiteOnline('test-site', 'websocket', true);
        metrics.setResourceActiveConnections('test-site', 'api', 'http/1.1', 5);
        metrics.setTunnelUp('test-site', 'wireguard', true);
        metrics.setBackendHealthStatus('svc-A', 'test-site', true);
        metrics.setAuthActiveUsers('test-site', 'oidc', 3);
        metrics.setUiActiveSessions(10);
        metrics.setCertificateExpiryDays('test-site', 'ui', 42);
        metrics.setWsActiveConnections('test-site', 8);
        metrics.setAcmeCertExpiryDays('app.example.com', 23);
        metrics.setDbPoolConnections('in_use', 12);
        metrics.setBackgroundQueueDepth('cert_renewal', 4);
        console.log('✓ Observable gauge setters work\n');

        console.log('6. All metrics types validated successfully!\n');
        console.log('Metrics endpoint available at: http://localhost:9465/metrics\n');
        
        console.log('7. Fetching metrics from endpoint...');
        const response = await fetch('http://localhost:9465/metrics');
        const metricsText = await response.text();
        console.log('✓ Successfully fetched metrics from endpoint\n');
        console.log('Sample metrics output:');
        console.log(metricsText.split('\n').slice(0, 20).join('\n'));
        console.log('...\n');
        
        console.log('8. Shutting down metrics service...');
        metrics.shutdown();
        console.log('✓ Metrics service shutdown successfully\n');

        console.log('✅ All tests passed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testMetricsService();
