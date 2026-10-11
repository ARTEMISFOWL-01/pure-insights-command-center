// Main dashboard - shows overview stats, reports, alerts, and costs
// Uses tabs to switch between different views
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import AlertPanel from './AlertPanel';
import ReportTable from './ReportTable';
import CostPanel from './CostPanel';

export default function Dashboard() {
  const { user, logout, hasPermission } = useAuth();
  const { apiFetch } = useApi();
  const { token } = useAuth();
  const { isConnected, alerts } = useWebSocket(token);

  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const data = await apiFetch('/api/dashboard/stats');
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div style={styles.loading}>Loading dashboard...</div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>⚡</span>
          <h1 style={styles.title}>Pure Insights Command Center</h1>
        </div>
        <div style={styles.headerRight}>
          <span style={{
            ...styles.wsIndicator,
            background: isConnected ? '#1a8b6e' : '#e94560'
          }}>
            {isConnected ? '● Live' : '○ Offline'}
          </span>
          <span style={styles.userBadge}>
            {user?.username} ({user?.role})
          </span>
          <button onClick={logout} style={styles.logoutBtn}>Sign Out</button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav style={styles.nav}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'reports', label: 'Reports' },
          { id: 'alerts', label: `Alerts (${alerts.length})` },
          ...(hasPermission('view_costs') ? [{ id: 'costs', label: 'Cost Allocation' }] : [])
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {})
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={styles.main}>
        {activeTab === 'overview' && stats && (
          <OverviewPanel stats={stats} alerts={alerts} />
        )}
        {activeTab === 'reports' && <ReportTable />}
        {activeTab === 'alerts' && <AlertPanel alerts={alerts} />}
        {activeTab === 'costs' && <CostPanel />}
      </main>
    </div>
  );
}

function OverviewPanel({ stats, alerts }) {
  const statCards = [
    { label: 'Total Reports', value: stats.totalReports, color: '#0f3460' },
    { label: 'Avg Health Score', value: stats.avgHealthScore, color: stats.avgHealthScore > 70 ? '#1a8b6e' : '#fe6b35' },
    { label: 'Failed Refreshes', value: stats.failedCount, color: stats.failedCount > 0 ? '#e94560' : '#1a8b6e' },
    { label: 'Orphaned Reports', value: stats.orphanedCount, color: stats.orphanedCount > 0 ? '#e94560' : '#1a8b6e' },
    { label: 'Latency Alerts', value: stats.alertCount, color: stats.alertCount > 10 ? '#e94560' : '#fe6b35' },
    { label: 'Cost Inefficient', value: stats.costInefficient, color: '#533483' },
    { label: 'Snowflake Credits', value: stats.totalCredits.toLocaleString(), color: '#0f3460' },
    { label: 'AWS Hosting Cost', value: `$${stats.totalAWSCost.toLocaleString()}`, color: '#0f3460' },
  ];

  return (
    <div>
      {/* Stat Cards Grid */}
      <div style={styles.statsGrid}>
        {statCards.map((card, i) => (
          <div key={i} style={styles.statCard}>
            <div style={{ ...styles.statValue, color: card.color }}>{card.value}</div>
            <div style={styles.statLabel}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Status & Latency Breakdown */}
      <div style={styles.twoCol}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Refresh Status Distribution</h3>
          {Object.entries(stats.statusCounts || {}).map(([status, count]) => (
            <div key={status} style={styles.barRow}>
              <span style={styles.barLabel}>{status}</span>
              <div style={styles.barTrack}>
                <div style={{
                  ...styles.barFill,
                  width: `${(count / stats.totalReports) * 100}%`,
                  background: status === 'SUCCESS' ? '#1a8b6e' :
                             status === 'FAILED' ? '#e94560' :
                             status === 'TIMED_OUT' ? '#fe6b35' : '#999'
                }} />
              </div>
              <span style={styles.barCount}>{count}</span>
            </div>
          ))}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Latency Tier Distribution</h3>
          {Object.entries(stats.tierCounts || {}).sort().map(([tier, count]) => (
            <div key={tier} style={styles.barRow}>
              <span style={styles.barLabel}>{tier}</span>
              <div style={styles.barTrack}>
                <div style={{
                  ...styles.barFill,
                  width: `${(count / stats.totalReports) * 100}%`,
                  background: tier === 'FAST' ? '#1a8b6e' :
                             tier === 'NORMAL' ? '#2196f3' :
                             tier === 'SLOW' ? '#fe6b35' :
                             tier === 'CRITICAL' ? '#e94560' : '#990011'
                }} />
              </div>
              <span style={styles.barCount}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Alerts */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>Recent Alerts (Live via WebSocket)</h3>
        {alerts.length === 0 ? (
          <p style={styles.empty}>No alerts yet — monitoring active...</p>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {alerts.slice(0, 10).map((alert, i) => (
              <div key={i} style={styles.alertRow}>
                <span style={{
                  ...styles.severity,
                  background: alert.severity === 'CRITICAL' ? '#e94560' :
                             alert.severity === 'WARNING' ? '#fe6b35' : '#2196f3'
                }}>
                  {alert.severity}
                </span>
                <span style={styles.alertMsg}>{alert.message}</span>
                <span style={styles.alertTime}>
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', background: '#f0f0f5', fontFamily: 'system-ui, -apple-system, sans-serif' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 18, color: '#666' },

  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 32px', background: '#1a1a2e', color: '#fff'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  logo: { fontSize: 28 },
  title: { margin: 0, fontSize: 20, fontWeight: 600 },
  wsIndicator: { padding: '4px 12px', borderRadius: 12, fontSize: 12, color: '#fff', fontWeight: 600 },
  userBadge: { fontSize: 14, color: '#aab' },
  logoutBtn: {
    padding: '6px 16px', borderRadius: 6, border: '1px solid #555',
    background: 'transparent', color: '#aab', cursor: 'pointer', fontSize: 13
  },

  nav: { display: 'flex', gap: 4, padding: '0 32px', background: '#16213e' },
  tab: {
    padding: '12px 24px', border: 'none', background: 'transparent',
    color: '#aab', fontSize: 14, cursor: 'pointer', fontWeight: 500,
    borderBottom: '2px solid transparent', transition: 'all 0.2s'
  },
  tabActive: { color: '#fe6b35', borderBottomColor: '#fe6b35' },

  main: { padding: '24px 32px', maxWidth: 1400, margin: '0 auto' },

  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16, marginBottom: 24
  },
  statCard: {
    background: '#fff', borderRadius: 12, padding: '20px 24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  statValue: { fontSize: 32, fontWeight: 700, lineHeight: 1.2 },
  statLabel: { fontSize: 13, color: '#888', marginTop: 4 },

  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 },
  panel: {
    background: '#fff', borderRadius: 12, padding: 24,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  panelTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#1a1a2e' },

  barRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  barLabel: { width: 90, fontSize: 13, color: '#555', fontWeight: 500 },
  barTrack: { flex: 1, height: 20, background: '#f0f0f5', borderRadius: 10, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 10, transition: 'width 0.5s ease' },
  barCount: { width: 40, fontSize: 13, color: '#888', textAlign: 'right' },

  alertRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '8px 12px', borderBottom: '1px solid #f0f0f5'
  },
  severity: {
    padding: '2px 8px', borderRadius: 4, fontSize: 11,
    fontWeight: 700, color: '#fff', minWidth: 70, textAlign: 'center'
  },
  alertMsg: { flex: 1, fontSize: 13, color: '#444' },
  alertTime: { fontSize: 12, color: '#999' },
  empty: { color: '#999', fontSize: 14, fontStyle: 'italic' }
};
