/**
 * Alert Management Routes
 * REST endpoints + SSE stream for real-time alerts
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/roles');
const alertService = require('../services/alertService');

router.use(authMiddleware);

/**
 * GET /api/alerts
 * List all alerts with filtering
 * Query: severity, type, acknowledged, reportId, limit
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_ALERTS), (req, res) => {
  const filters = {};
  if (req.query.severity) filters.severity = req.query.severity.toUpperCase();
  if (req.query.type) filters.type = req.query.type.toUpperCase();
  if (req.query.acknowledged !== undefined) filters.acknowledged = req.query.acknowledged === 'true';
  if (req.query.reportId) filters.reportId = req.query.reportId;

  let alerts = alertService.getAlerts(filters);

  const limit = parseInt(req.query.limit) || 50;
  alerts = alerts.slice(0, limit);

  res.json({
    data: alerts,
    total: alerts.length,
    unacknowledged: alerts.filter(a => !a.acknowledged).length
  });
});

/**
 * POST /api/alerts/:id/acknowledge
 * Acknowledge an alert (admin/analyst only)
 */
router.post('/:id/acknowledge', requirePermission(PERMISSIONS.VIEW_ALERTS), (req, res) => {
  const alertId = parseInt(req.params.id);
  const alert = alertService.acknowledgeAlert(alertId, req.user.username);

  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  res.json({ alert });
});

/**
 * GET /api/alerts/stream
 * Server-Sent Events endpoint for real-time alert streaming
 *
 * KNOWLEDGE NOTE — SSE (Server-Sent Events):
 * The client opens a long-lived HTTP connection. The server sends events
 * as they happen using the text/event-stream format:
 *   data: {"type":"LATENCY_WARNING","reportId":"RPT_205"}\n\n
 *
 * Client-side code:
 *   const evtSource = new EventSource('/api/alerts/stream');
 *   evtSource.onmessage = (e) => { const alert = JSON.parse(e.data); };
 *
 * Advantages over WebSocket for one-way streams:
 *   - Built-in browser reconnection
 *   - Standard HTTP (works through proxies/load balancers)
 *   - Simpler server implementation
 */
router.get('/stream', requirePermission(PERMISSIONS.VIEW_ALERTS), (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable nginx buffering
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

  // Register client
  alertService.addSSEClient(res);

  // Keep connection alive with heartbeats
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

/**
 * GET /api/alerts/summary
 * Alert statistics grouped by type and severity
 */
router.get('/summary', requirePermission(PERMISSIONS.VIEW_ALERTS), (req, res) => {
  const alerts = alertService.getAlerts();

  const bySeverity = {};
  const byType = {};

  alerts.forEach(a => {
    bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
    byType[a.type] = (byType[a.type] || 0) + 1;
  });

  res.json({
    total: alerts.length,
    unacknowledged: alerts.filter(a => !a.acknowledged).length,
    bySeverity,
    byType
  });
});

module.exports = router;
