import React from 'react';

export default function AlertPanel({ alerts }) {
  const sevCounts = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  alerts.forEach(a => { if (sevCounts[a.severity] !== undefined) sevCounts[a.severity]++; });

  const sevColor = { CRITICAL: '#e94560', WARNING: '#fe6b35', INFO: '#2196f3' };

  return (
    <div>
      {/* Summary Cards */}
      <div style={styles.summaryRow}>
        {Object.entries(sevCounts).map(([sev, count]) => (
          <div key={sev} style={{...styles.summaryCard, borderLeft: `4px solid ${sevColor[sev]}`}}>
            <div style={{...styles.summaryCount, color: sevColor[sev]}}>{count}</div>
            <div style={styles.summaryLabel}>{sev}</div>
          </div>
        ))}
        <div style={{...styles.summaryCard, borderLeft: '4px solid #1a8b6e'}}>
          <div style={{...styles.summaryCount, color: '#1a8b6e'}}>{alerts.length}</div>
          <div style={styles.summaryLabel}>TOTAL</div>
        </div>
      </div>

      {/* Alert Feed */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>Live Alert Feed (WebSocket)</h3>
        <p style={styles.note}>
          Alerts are pushed in real-time via WebSocket connection. The server evaluates
          each report snapshot against configurable thresholds (latency &gt; 15s, refresh failures,
          credit anomalies, orphaned reports) and broadcasts alerts to all connected clients.
        </p>

        {alerts.length === 0 ? (
          <div style={styles.empty}>Waiting for alerts... The server cycles through report data and generates alerts when thresholds are breached.</div>
        ) : (
          <div style={styles.alertList}>
            {alerts.map((alert, i) => (
              <div key={i} style={styles.alertCard}>
                <div style={styles.alertHeader}>
                  <span style={{
                    ...styles.sevBadge,
                    background: sevColor[alert.severity] || '#999'
                  }}>
                    {alert.severity}
                  </span>
                  <span style={styles.typeBadge}>{alert.type}</span>
                  <span style={styles.timestamp}>
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div style={styles.alertBody}>
                  <p style={styles.alertMessage}>{alert.message}</p>
                  <span style={styles.reportRef}>Report: {alert.reportId} — {alert.reportName}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 },
  summaryCard: { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  summaryCount: { fontSize: 36, fontWeight: 700 },
  summaryLabel: { fontSize: 13, color: '#888', fontWeight: 600, marginTop: 4 },
  panel: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  panelTitle: { margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#1a1a2e' },
  note: { margin: '0 0 16px', fontSize: 13, color: '#888', lineHeight: 1.5 },
  empty: { textAlign: 'center', padding: 40, color: '#999', fontSize: 14, fontStyle: 'italic' },
  alertList: { maxHeight: 600, overflowY: 'auto' },
  alertCard: { padding: '12px 16px', borderBottom: '1px solid #f0f0f5' },
  alertHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  sevBadge: { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#fff' },
  typeBadge: { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, color: '#555', background: '#f0f0f5' },
  timestamp: { marginLeft: 'auto', fontSize: 12, color: '#999' },
  alertBody: {},
  alertMessage: { margin: '0 0 4px', fontSize: 14, color: '#333' },
  reportRef: { fontSize: 12, color: '#888' }
};
