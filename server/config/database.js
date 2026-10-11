// In-memory data store - loads the cleaned CSV into memory
// In production this would connect to Snowflake/PostgreSQL
// but for the assessment this works fine and keeps it simple

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

let reports = [];
let reportIndex = new Map(); // report_id -> array of snapshots

function loadData() {
  const csvPath = path.join(__dirname, '..', '..', 'data', 'cleaned_monitoring_data.csv');
  const raw = fs.readFileSync(csvPath, 'utf-8');

  reports = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    cast: (value, context) => {
      const numericCols = [
        'monthly_active_views', 'snowflake_credits_consumed',
        'avg_load_time_sec', 'aws_hosting_cost_usd',
        'query_count_last_30d', 'concurrent_user_peak',
        'cost_per_view', 'health_score'
      ];
      const boolCols = ['is_orphaned', 'has_credit_anomaly', 'needs_alert', 'is_cost_inefficient'];

      if (numericCols.includes(context.column)) {
        const n = parseFloat(value);
        return isNaN(n) ? null : n;
      }
      if (boolCols.includes(context.column)) {
        return value === 'True' || value === 'true';
      }
      return value;
    }
  });

  // Build index: group snapshots by report_id
  reportIndex.clear();
  for (const row of reports) {
    if (!reportIndex.has(row.report_id)) {
      reportIndex.set(row.report_id, []);
    }
    reportIndex.get(row.report_id).push(row);
  }

  console.log(`[DB] Loaded ${reports.length} records for ${reportIndex.size} unique reports`);
}

function getAllReports() {
  return reports;
}

function getReportById(reportId) {
  return reportIndex.get(reportId) || [];
}

function getUniqueReportIds() {
  return Array.from(reportIndex.keys());
}

// get latest snapshot for each report (we have ~20 snapshots per report in the csv)
// just picks the last one since they're in order
function getLatestSnapshots() {
  const latest = [];
  for (const [id, snapshots] of reportIndex) {
    latest.push(snapshots[snapshots.length - 1]);
  }
  return latest;
}

// calculate all the stats for the dashboard overview page
function getDashboardStats() {
  const latest = getLatestSnapshots();

  const totalReports = latest.length;
  const orphanedCount = latest.filter(r => r.is_orphaned).length;
  const alertCount = latest.filter(r => r.needs_alert).length;
  const failedCount = latest.filter(r => r.last_refresh_status === 'FAILED').length;
  const totalCredits = latest.reduce((s, r) => s + (r.snowflake_credits_consumed || 0), 0);
  const totalAWSCost = latest.reduce((s, r) => s + (r.aws_hosting_cost_usd || 0), 0);
  const avgHealthScore = latest.reduce((s, r) => s + (r.health_score || 0), 0) / totalReports;
  const avgLoadTime = latest.reduce((s, r) => s + (r.avg_load_time_sec || 0), 0) / totalReports;

  const costInefficient = latest.filter(r => r.is_cost_inefficient).length;

  // Latency tier breakdown
  const tierCounts = {};
  latest.forEach(r => {
    tierCounts[r.latency_tier] = (tierCounts[r.latency_tier] || 0) + 1;
  });

  // Status breakdown
  const statusCounts = {};
  latest.forEach(r => {
    statusCounts[r.last_refresh_status] = (statusCounts[r.last_refresh_status] || 0) + 1;
  });

  // Owner distribution
  const ownerCounts = {};
  latest.forEach(r => {
    ownerCounts[r.owner_email] = (ownerCounts[r.owner_email] || 0) + 1;
  });

  return {
    totalReports,
    orphanedCount,
    alertCount,
    failedCount,
    totalCredits: Math.round(totalCredits * 100) / 100,
    totalAWSCost: Math.round(totalAWSCost * 100) / 100,
    avgHealthScore: Math.round(avgHealthScore * 10) / 10,
    avgLoadTime: Math.round(avgLoadTime * 10) / 10,
    costInefficient,
    tierCounts,
    statusCounts,
    ownerCounts
  };
}

module.exports = {
  loadData,
  getAllReports,
  getReportById,
  getUniqueReportIds,
  getLatestSnapshots,
  getDashboardStats
};
