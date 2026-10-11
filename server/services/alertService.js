// Alert service - evaluates reports against thresholds and sends real-time alerts
// Uses EventEmitter pattern so other parts of the app can listen for alerts
// Broadcasts to both WebSocket clients and SSE clients simultaneously
//
// Alert conditions:
// - latency > 15s (warning) or > 45s (critical)
// - refresh status FAILED or TIMED_OUT
// - negative credit values (data anomaly)
// - orphaned reports (no owner)

const EventEmitter = require('events');

class AlertService extends EventEmitter {
  constructor() {
    super();
    this.alerts = [];
    this.alertIdCounter = 1;
    this.sseClients = new Set();
    this.wsClients = new Set();
    this.thresholds = {
      latencyWarning: 15,   // seconds
      latencyCritical: 45,  // seconds
      creditMinimum: 0,     // negative = anomaly
    };
  }

  // check a report against all thresholds and create alerts if needed
  evaluateReport(report) {
    const alerts = [];

    // Check latency threshold
    if (report.avg_load_time_sec > this.thresholds.latencyCritical) {
      alerts.push(this.createAlert({
        type: 'LATENCY_EXTREME',
        severity: 'CRITICAL',
        reportId: report.report_id,
        reportName: report.report_name,
        message: `Extreme load latency: ${report.avg_load_time_sec}s (threshold: ${this.thresholds.latencyCritical}s)`,
        value: report.avg_load_time_sec,
        threshold: this.thresholds.latencyCritical
      }));
    } else if (report.avg_load_time_sec > this.thresholds.latencyWarning) {
      alerts.push(this.createAlert({
        type: 'LATENCY_WARNING',
        severity: 'WARNING',
        reportId: report.report_id,
        reportName: report.report_name,
        message: `Load latency exceeds threshold: ${report.avg_load_time_sec}s (threshold: ${this.thresholds.latencyWarning}s)`,
        value: report.avg_load_time_sec,
        threshold: this.thresholds.latencyWarning
      }));
    }

    // Check refresh failure
    if (report.last_refresh_status === 'FAILED') {
      alerts.push(this.createAlert({
        type: 'REFRESH_FAILED',
        severity: 'CRITICAL',
        reportId: report.report_id,
        reportName: report.report_name,
        message: `Automated refresh FAILED for ${report.report_name}`,
        value: report.last_refresh_status
      }));
    } else if (report.last_refresh_status === 'TIMED_OUT') {
      alerts.push(this.createAlert({
        type: 'REFRESH_TIMEOUT',
        severity: 'WARNING',
        reportId: report.report_id,
        reportName: report.report_name,
        message: `Refresh timed out for ${report.report_name}`,
        value: report.last_refresh_status
      }));
    }

    // Check credit anomaly
    if (report.has_credit_anomaly) {
      alerts.push(this.createAlert({
        type: 'CREDIT_ANOMALY',
        severity: 'WARNING',
        reportId: report.report_id,
        reportName: report.report_name,
        message: `Negative Snowflake credit consumption detected`,
        value: report.snowflake_credits_consumed
      }));
    }

    // Check orphaned status
    if (report.is_orphaned) {
      alerts.push(this.createAlert({
        type: 'ORPHANED_REPORT',
        severity: 'INFO',
        reportId: report.report_id,
        reportName: report.report_name,
        message: `Report has no assigned owner`,
        value: report.owner_email
      }));
    }

    return alerts;
  }

  createAlert(data) {
    const alert = {
      id: this.alertIdCounter++,
      ...data,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    this.alerts.push(alert);

    // Broadcast to all connected clients
    this.broadcast(alert);

    return alert;
  }

  acknowledgeAlert(alertId, userId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = userId;
      alert.acknowledgedAt = new Date().toISOString();

      this.broadcast({
        type: 'ALERT_ACKNOWLEDGED',
        alertId,
        acknowledgedBy: userId,
        timestamp: alert.acknowledgedAt
      });
    }
    return alert;
  }

  getAlerts(filters = {}) {
    let result = [...this.alerts];

    if (filters.severity) {
      result = result.filter(a => a.severity === filters.severity);
    }
    if (filters.type) {
      result = result.filter(a => a.type === filters.type);
    }
    if (filters.acknowledged !== undefined) {
      result = result.filter(a => a.acknowledged === filters.acknowledged);
    }
    if (filters.reportId) {
      result = result.filter(a => a.reportId === filters.reportId);
    }

    return result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // send alert to everyone whos connected (both WS and SSE)
  broadcast(data) {
    const message = JSON.stringify(data);

    // WebSocket clients
    for (const ws of this.wsClients) {
      if (ws.readyState === 1) { // OPEN
        ws.send(message);
      }
    }

    // SSE clients
    for (const res of this.sseClients) {
      res.write(`data: ${message}\n\n`);
    }

    this.emit('alert', data);
  }

  addWSClient(ws) {
    this.wsClients.add(ws);
    ws.on('close', () => this.wsClients.delete(ws));
  }

  addSSEClient(res) {
    this.sseClients.add(res);
    res.on('close', () => this.sseClients.delete(res));
  }

  // simulates real-time monitoring by going through reports one by one
  // in a real system this would be triggered by actual data pipeline events
  startSimulation(reports, intervalMs = 3000) {
    let index = 0;
    this.simulationInterval = setInterval(() => {
      if (index >= reports.length) index = 0;
      const report = reports[index];
      this.evaluateReport(report);
      index++;
    }, intervalMs);
    console.log(`[AlertService] Simulation started (${intervalMs}ms interval)`);
  }

  stopSimulation() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      console.log('[AlertService] Simulation stopped');
    }
  }
}

// Singleton
module.exports = new AlertService();
