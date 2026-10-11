/**
 * Cloud Cost Allocation Routes
 *
 * KNOWLEDGE NOTE — Snowflake Cost Attribution:
 * Snowflake's ACCOUNT_USAGE schema provides views like QUERY_HISTORY,
 * WAREHOUSE_METERING_HISTORY, and STORAGE_USAGE. To attribute costs to
 * individual reports/dashboards, you join query metadata (tags, warehouse,
 * user) with credit consumption data.
 *
 * Unit cost per active user = total_credits_consumed / monthly_active_views
 * This metric reveals which reports are "expensive per eyeball" — high
 * compute cost relative to the number of people actually using them.
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/roles');
const db = require('../config/database');

router.use(authMiddleware);

/**
 * GET /api/costs/allocation
 * Per-report cost allocation with unit economics
 */
router.get('/allocation', requirePermission(PERMISSIONS.VIEW_COST_ALLOCATION), (req, res) => {
  const latest = db.getLatestSnapshots();

  const allocation = latest.map(r => ({
    reportId: r.report_id,
    reportName: r.report_name,
    owner: r.owner_email,
    snowflakeCredits: r.snowflake_credits_consumed,
    awsHostingCost: r.aws_hosting_cost_usd,
    totalCost: Math.round((r.snowflake_credits_consumed * 3 + r.aws_hosting_cost_usd) * 100) / 100, // $3/credit
    monthlyActiveViews: r.monthly_active_views,
    costPerView: r.cost_per_view ? Math.round(r.cost_per_view * 100) / 100 : null,
    costPerQuery: r.query_count_last_30d > 0
      ? Math.round((r.snowflake_credits_consumed * 3) / r.query_count_last_30d * 100) / 100
      : null,
    isCostInefficient: r.is_cost_inefficient,
    queryCount: r.query_count_last_30d
  }));

  // Sort by total cost descending
  allocation.sort((a, b) => b.totalCost - a.totalCost);

  // Summary
  const totalSnowflakeCredits = latest.reduce((s, r) => s + (r.snowflake_credits_consumed || 0), 0);
  const totalAWSCost = latest.reduce((s, r) => s + (r.aws_hosting_cost_usd || 0), 0);
  const totalCost = totalSnowflakeCredits * 3 + totalAWSCost;
  const inefficientCost = allocation
    .filter(a => a.isCostInefficient)
    .reduce((s, a) => s + a.totalCost, 0);

  res.json({
    data: allocation,
    summary: {
      totalSnowflakeCredits: Math.round(totalSnowflakeCredits * 100) / 100,
      totalSnowflakeCost: Math.round(totalSnowflakeCredits * 3 * 100) / 100,
      totalAWSCost: Math.round(totalAWSCost * 100) / 100,
      totalCombinedCost: Math.round(totalCost * 100) / 100,
      inefficientReportCount: allocation.filter(a => a.isCostInefficient).length,
      inefficientCost: Math.round(inefficientCost * 100) / 100,
      potentialSavings: Math.round(inefficientCost * 0.4 * 100) / 100 // Est. 40% recoverable
    }
  });
});

/**
 * GET /api/costs/by-owner
 * Cost breakdown grouped by report owner
 */
router.get('/by-owner', requirePermission(PERMISSIONS.VIEW_COSTS), (req, res) => {
  const latest = db.getLatestSnapshots();

  const ownerCosts = {};
  latest.forEach(r => {
    const owner = r.owner_email;
    if (!ownerCosts[owner]) {
      ownerCosts[owner] = {
        owner,
        reportCount: 0,
        totalCredits: 0,
        totalAWSCost: 0,
        totalViews: 0,
        totalQueries: 0
      };
    }
    const o = ownerCosts[owner];
    o.reportCount++;
    o.totalCredits += r.snowflake_credits_consumed || 0;
    o.totalAWSCost += r.aws_hosting_cost_usd || 0;
    o.totalViews += r.monthly_active_views || 0;
    o.totalQueries += r.query_count_last_30d || 0;
  });

  const result = Object.values(ownerCosts).map(o => ({
    ...o,
    totalCost: Math.round((o.totalCredits * 3 + o.totalAWSCost) * 100) / 100,
    costPerView: o.totalViews > 0
      ? Math.round((o.totalCredits * 3 + o.totalAWSCost) / o.totalViews * 100) / 100
      : null,
    totalCredits: Math.round(o.totalCredits * 100) / 100,
    totalAWSCost: Math.round(o.totalAWSCost * 100) / 100
  }));

  res.json({
    data: result.sort((a, b) => b.totalCost - a.totalCost)
  });
});

/**
 * GET /api/costs/top-consumers
 * Top N most expensive reports by total cost
 */
router.get('/top-consumers', requirePermission(PERMISSIONS.VIEW_COSTS), (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const latest = db.getLatestSnapshots();

  const ranked = latest
    .map(r => ({
      reportId: r.report_id,
      reportName: r.report_name,
      owner: r.owner_email,
      totalCost: Math.round((r.snowflake_credits_consumed * 3 + r.aws_hosting_cost_usd) * 100) / 100,
      snowflakeCredits: r.snowflake_credits_consumed,
      awsCost: r.aws_hosting_cost_usd,
      monthlyViews: r.monthly_active_views,
      healthScore: r.health_score
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, limit);

  res.json({ data: ranked });
});

module.exports = router;
