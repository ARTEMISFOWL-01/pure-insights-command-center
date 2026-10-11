import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function ReportTable() {
  const { apiFetch } = useApi();
  const [reports, setReports] = useState([]);
  const [filters, setFilters] = useState({ status: '', tier: '', orphaned: '' });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => { fetchReports(); }, [page, filters]);

  async function fetchReports() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (filters.status) params.set('status', filters.status);
      if (filters.tier) params.set('tier', filters.tier);
      if (filters.orphaned) params.set('orphaned', filters.orphaned);

      const data = await apiFetch(`/api/reports?${params}`);
      setReports(data.data);
      setPagination(data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function viewDetail(reportId) {
    try {
      const data = await apiFetch(`/api/reports/${reportId}/health`);
      setSelectedReport(data);
    } catch (err) {
      console.error(err);
    }
  }

  const getStatusColor = (s) => ({
    SUCCESS: '#1a8b6e', FAILED: '#e94560', TIMED_OUT: '#fe6b35', UNKNOWN: '#999'
  }[s] || '#999');

  const getTierColor = (t) => ({
    FAST: '#1a8b6e', NORMAL: '#2196f3', SLOW: '#fe6b35', CRITICAL: '#e94560', EXTREME: '#990011'
  }[t] || '#999');

  return (
    <div>
      {/* Filters */}
      <div style={styles.filterBar}>
        <select value={filters.status} onChange={e => { setFilters({...filters, status: e.target.value}); setPage(1); }} style={styles.select}>
          <option value="">All Statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="TIMED_OUT">Timed Out</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
        <select value={filters.tier} onChange={e => { setFilters({...filters, tier: e.target.value}); setPage(1); }} style={styles.select}>
          <option value="">All Latency Tiers</option>
          <option value="FAST">Fast (≤5s)</option>
          <option value="NORMAL">Normal (≤15s)</option>
          <option value="SLOW">Slow (≤30s)</option>
          <option value="CRITICAL">Critical (≤45s)</option>
          <option value="EXTREME">Extreme (&gt;45s)</option>
        </select>
        <select value={filters.orphaned} onChange={e => { setFilters({...filters, orphaned: e.target.value}); setPage(1); }} style={styles.select}>
          <option value="">All Reports</option>
          <option value="true">Orphaned Only</option>
        </select>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Report ID', 'Name', 'Owner', 'Status', 'Latency', 'Load Time', 'Health', 'Credits', 'AWS Cost', ''].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={styles.loading}>Loading...</td></tr>
            ) : reports.map(r => (
              <tr key={r.report_id + Math.random()} style={styles.tr}>
                <td style={styles.td}>{r.report_id}</td>
                <td style={styles.td}>{r.report_name}</td>
                <td style={styles.td}>
                  {r.is_orphaned ? <span style={styles.orphanBadge}>ORPHANED</span> : r.owner_email}
                </td>
                <td style={styles.td}>
                  <span style={{...styles.badge, background: getStatusColor(r.last_refresh_status)}}>
                    {r.last_refresh_status}
                  </span>
                </td>
                <td style={styles.td}>
                  <span style={{...styles.badge, background: getTierColor(r.latency_tier)}}>
                    {r.latency_tier}
                  </span>
                </td>
                <td style={styles.td}>{r.avg_load_time_sec}s</td>
                <td style={styles.td}>
                  <span style={{fontWeight: 700, color: r.health_score > 70 ? '#1a8b6e' : r.health_score > 40 ? '#fe6b35' : '#e94560'}}>
                    {r.health_score}
                  </span>
                </td>
                <td style={styles.td}>{r.snowflake_credits_consumed?.toFixed(1)}</td>
                <td style={styles.td}>${r.aws_hosting_cost_usd?.toFixed(2)}</td>
                <td style={styles.td}>
                  <button onClick={() => viewDetail(r.report_id)} style={styles.detailBtn}>Detail</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={styles.pager}>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={styles.pageBtn}>← Prev</button>
        <span style={styles.pageInfo}>Page {page} of {pagination.totalPages || 1} ({pagination.total || 0} reports)</span>
        <button onClick={() => setPage(p => p + 1)} disabled={page >= (pagination.totalPages || 1)} style={styles.pageBtn}>Next →</button>
      </div>

      {/* Detail Modal */}
      {selectedReport && (
        <div style={styles.overlay} onClick={() => setSelectedReport(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Health Score Breakdown: {selectedReport.reportId}</h2>
            <div style={styles.scoreTotal}>
              <span style={styles.scoreNum}>{selectedReport.healthScore}</span>
              <span style={styles.scoreMax}>/100</span>
            </div>
            {Object.entries(selectedReport.breakdown).map(([key, comp]) => (
              <div key={key} style={styles.breakdownRow}>
                <span style={styles.breakdownLabel}>{key.replace(/([A-Z])/g, ' $1')}</span>
                <div style={styles.breakdownBar}>
                  <div style={{...styles.breakdownFill, width: `${(comp.score / comp.max) * 100}%`}} />
                </div>
                <span style={styles.breakdownScore}>{comp.score}/{comp.max}</span>
                <span style={styles.breakdownValue}>{typeof comp.value === 'number' ? comp.value.toFixed(1) : comp.value}</span>
              </div>
            ))}
            <button onClick={() => setSelectedReport(null)} style={styles.closeBtn}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  filterBar: { display: 'flex', gap: 12, marginBottom: 16 },
  select: { padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, background: '#fff' },
  tableWrap: { background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '12px 16px', background: '#f5f5fa', fontSize: 12, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  tr: { borderBottom: '1px solid #f0f0f5' },
  td: { padding: '10px 16px', fontSize: 13, color: '#333' },
  loading: { textAlign: 'center', padding: 40, color: '#999' },
  badge: { padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#fff' },
  orphanBadge: { padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#e94560', background: '#fde8ec' },
  detailBtn: { padding: '4px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 12 },
  pager: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
  pageBtn: { padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 },
  pageInfo: { fontSize: 13, color: '#666' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 16, padding: 32, width: 480, maxWidth: '90vw' },
  modalTitle: { margin: '0 0 16px', fontSize: 18, color: '#1a1a2e' },
  scoreTotal: { textAlign: 'center', marginBottom: 24 },
  scoreNum: { fontSize: 56, fontWeight: 700, color: '#0f3460' },
  scoreMax: { fontSize: 24, color: '#999' },
  breakdownRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  breakdownLabel: { width: 120, fontSize: 13, color: '#555', textTransform: 'capitalize' },
  breakdownBar: { flex: 1, height: 8, background: '#f0f0f5', borderRadius: 4, overflow: 'hidden' },
  breakdownFill: { height: '100%', background: '#fe6b35', borderRadius: 4 },
  breakdownScore: { width: 50, fontSize: 13, fontWeight: 600, color: '#333', textAlign: 'right' },
  breakdownValue: { width: 80, fontSize: 12, color: '#999', textAlign: 'right' },
  closeBtn: { marginTop: 24, padding: '10px 24px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontSize: 14, width: '100%' }
};
