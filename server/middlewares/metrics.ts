import { Request, Response, NextFunction } from 'express';
import { getMetricsService } from '@server/lib/metrics';
import logger from '@server/logger';

/**
 * Middleware to track UI/API requests metrics
 * This middleware records metrics for each HTTP request
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    // Capture the original end function
    const originalEnd = res.end.bind(res);

    // Override res.end to capture metrics when response is sent
    res.end = function(chunk?: any, encoding?: any, callback?: any): Response {
        try {
            const metrics = getMetricsService();
            const duration = (Date.now() - startTime) / 1000; // Convert to seconds
            const statusCode = res.statusCode;
            const method = req.method;
            const endpoint = req.route?.path || req.path;

            // Record UI request metrics
            metrics.uiRequestsTotal.add(1, {
                endpoint,
                method,
                status: statusCode.toString()
            });

            logger.debug('Metrics recorded', {
                endpoint,
                method,
                status: statusCode,
                duration
            });
        } catch (error) {
            // Don't fail the request if metrics collection fails
            logger.error('Failed to record metrics:', error);
        }

        // Call the original end function
        return originalEnd(chunk, encoding, callback);
    };

    next();
}
