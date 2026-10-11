/**
 * Report Management Routes
 *
 * KNOWLEDGE NOTE — REST API Design:
 * REST (Representational State Transfer) organizes APIs around resources.
 * Each URL represents a resource (/api/reports, /api/reports/:id), and
 * HTTP methods define operations (GET=read, POST=create, PUT=update, DELETE=remove).
 *
 * Key principles:
 *   - Stateless: each request contains all info needed to process it
 *   - Resource-based URLs: nouns, not verbs (/api/reports, not /api/getReports)
 *   - HTTP status codes: 200=OK, 201=Created, 400=Bad Request, 401=Unauthorized,
 *     403=Forbidden, 404=Not Found, 500=Server Error
 *   - Pagination: use ?page=1&limit=20 for large collections
 *   - Filtering: use query params ?status=FAILED&tier=CRITICAL
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/roles');
const db = require('../config/database');

// All report routes require authentication
router.use(authMiddleware);

/**
 * GET /api/reports
 * List all reports with optional filtering and pagination
 * Query params: status, tier, orphaned, owner, page, limit, sort
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_REPORTS), (req, res) => {
  let reports = db.getLatestSnapshots();

  // Filtering
  const { status, tier, orphaned, owner, search } = req.query;

  if (status) {
    reports = reports.filter(r => r.last_refresh_status === status.toUpperCase());
  }
  if (tier) {
    reports = reports.filter(r => r.latency_tier === tier.toUpperCase());
  }
  if (orphaned === 'true') {
    reports = reports.filter(r => r.is_orphaned);
  }
  if (owner) {
    reports = reports.filter(r => r.owner_email === owner);
  }
  if (search) {
    const s = search.toLowerCase();
    reports = reports.filter(r =>
      r.report_id.toLowerCase().includes(s) ||
      r.report_name.toLowerCase().includes(s)
    );
  }

  // Sorting
  const sort = req.query.sort || '-health_score';
  const sortDir = sort.startsWith('-') ? -1 : 1;
  const sortField = sort.replace(/^-/, '');
  reports.sort((a, b) => {
    if (a[sortField] < b[sortField]) return -1 * sortDir;
    if (a[sortField] > b[sortField]) return 1 * sortDir;
    return 0;
  });

  // Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const startIdx = (page - 1) * limit;
  const paginatedReports = reports.slice(startIdx, startIdx + limit);

  res.json({
    data: paginatedReports,
    pagination: {
      page,
      limit,
      total: reports.length,
      totalPages: Math.ceil(reports.length / limit)
    }
  });
});

/**
 * GET /api/reports/orphaned
 * List all orphaned reports (no owner assigned)
 * Admin-only: includes reassignment capability
 */
router.get('/orphaned', requirePermission(PERMISSIONS.VIEW_REPORTS), (req, res) => {
  const orphaned = db.getLatestSnapshots().filter(r => r.is_orphaned);

  res.json({
    data: orphaned,
    count: orphaned.length,
    totalAWSCost: Math.round(orphaned.reduce((s, r) => s + r.aws_hosting_cost_usd, 0) * 100) / 100,
    totalCredits: Math.round(orphaned.reduce((s, r) => s + r.snowflake_credits_consumed, 0) * 100) / 100
  });
});

/**
 * GET /api/reports/:id
 * Get detailed report information including historical snapshots
 */
router.get('/:id', requirePermission(PERMISSIONS.VIEW_REPORT_DETAIL), (req, res) => {
  const snapshots = db.getReportById(req.params.id);

  if (snapshots.length === 0) {
    return res.status(404).json({ error: 'Report not found', reportId: req.params.id });
  }

  const latest = snapshots[snapshots.length - 1];

  res.json({
    report: latest,
    history: snapshots,
    snapshotCount: snapshots.length
  });
});

/**
 * GET /api/reports/:id/health
 * Get health score breakdown for a specific report
 */
router.get('/:id/health', requirePermission(PERMISSIONS.VIEW_REPORT_DETAIL), (req, res) => {
  const snapshots = db.getReportById(req.params.id);

  if (snapshots.length === 0) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const latest = snapshots[snapshots.length - 1];

  // Break down health score components
  const statusScores = { SUCCESS: 40, TIMED_OUT: 20, UNKNOWN: 10, FAILED: 0 };
  const refreshScore = statusScores[latest.last_refresh_status] || 0;
  const loadScore = Math.round(Math.max(0, 30 * (1 - latest.avg_load_time_sec / 55)) * 10) / 10;

  let costScore = 0;
  if (latest.cost_per_view && latest.cost_per_view > 0) {
    costScore = Math.round(Math.max(0, 15 * (1 - Math.min(latest.cost_per_view, 1.0))) * 10) / 10;
  }

  const ownershipScore = latest.is_orphaned ? 0 : 15;

  res.json({
    reportId: latest.report_id,
    healthScore: latest.health_score,
    breakdown: {
      refreshStatus: { score: refreshScore, max: 40, value: latest.last_refresh_status },
      loadTime: { score: loadScore, max: 30, value: latest.avg_load_time_sec },
      costEfficiency: { score: costScore, max: 15, value: latest.cost_per_view },
      ownership: { score: ownershipScore, max: 15, value: latest.is_orphaned ? 'Orphaned' : 'Owned' }
    },
    healthHistory: snapshots.map(s => ({
      healthScore: s.health_score,
      loadTime: s.avg_load_time_sec,
      status: s.last_refresh_status
    }))
  });
});

module.exports = router;
