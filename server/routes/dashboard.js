/**
 * Dashboard Routes
 * Aggregated statistics and visualizations for the admin dashboard
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/roles');
const db = require('../config/database');

router.use(authMiddleware);

/**
 * GET /api/dashboard/stats
 * Overall platform statistics
 */
router.get('/stats', requirePermission(PERMISSIONS.VIEW_DASHBOARD), (req, res) => {
  const stats = db.getDashboardStats();
  res.json(stats);
});

/**
 * GET /api/dashboard/latency-distribution
 * Latency tier breakdown for charting
 */
router.get('/latency-distribution', requirePermission(PERMISSIONS.VIEW_DASHBOARD), (req, res) => {
  const latest = db.getLatestSnapshots();

  const tiers = ['FAST', 'NORMAL', 'SLOW', 'CRITICAL', 'EXTREME'];
  const distribution = tiers.map(tier => ({
    tier,
    count: latest.filter(r => r.latency_tier === tier).length,
    avgLoadTime: Math.round(
      latest.filter(r => r.latency_tier === tier)
        .reduce((s, r) => s + r.avg_load_time_sec, 0) /
      Math.max(1, latest.filter(r => r.latency_tier === tier).length) * 10
    ) / 10
  }));

  res.json({ distribution });
});

/**
 * GET /api/dashboard/status-breakdown
 * Refresh status distribution
 */
router.get('/status-breakdown', requirePermission(PERMISSIONS.VIEW_DASHBOARD), (req, res) => {
  const latest = db.getLatestSnapshots();

  const statuses = ['SUCCESS', 'FAILED', 'TIMED_OUT', 'UNKNOWN'];
  const breakdown = statuses.map(status => ({
    status,
    count: latest.filter(r => r.last_refresh_status === status).length,
    avgHealthScore: Math.round(
      latest.filter(r => r.last_refresh_status === status)
        .reduce((s, r) => s + r.health_score, 0) /
      Math.max(1, latest.filter(r => r.last_refresh_status === status).length) * 10
    ) / 10
  }));

  res.json({ breakdown });
});

/**
 * GET /api/dashboard/owner-summary
 * Per-owner report health summary
 */
router.get('/owner-summary', requirePermission(PERMISSIONS.VIEW_DASHBOARD), (req, res) => {
  const latest = db.getLatestSnapshots();

  const ownerMap = {};
  latest.forEach(r => {
    const owner = r.owner_email;
    if (!ownerMap[owner]) {
      ownerMap[owner] = {
        owner,
        reportCount: 0,
        failedCount: 0,
        alertCount: 0,
        totalCredits: 0,
        totalAWSCost: 0,
        avgHealthScore: 0,
        totalHealthScore: 0
      };
    }
    const o = ownerMap[owner];
    o.reportCount++;
    if (r.last_refresh_status === 'FAILED') o.failedCount++;
    if (r.needs_alert) o.alertCount++;
    o.totalCredits += r.snowflake_credits_consumed || 0;
    o.totalAWSCost += r.aws_hosting_cost_usd || 0;
    o.totalHealthScore += r.health_score || 0;
  });

  const summary = Object.values(ownerMap).map(o => ({
    ...o,
    avgHealthScore: Math.round(o.totalHealthScore / o.reportCount * 10) / 10,
    totalCredits: Math.round(o.totalCredits * 100) / 100,
    totalAWSCost: Math.round(o.totalAWSCost * 100) / 100
  }));

  // Remove the intermediate field
  summary.forEach(s => delete s.totalHealthScore);

  res.json({ data: summary.sort((a, b) => a.avgHealthScore - b.avgHealthScore) });
});

module.exports = router;
