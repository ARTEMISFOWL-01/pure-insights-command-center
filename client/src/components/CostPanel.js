import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function CostPanel() {
  const { apiFetch } = useApi();
  const [allocation, setAllocation] = useState(null);
  const [topConsumers, setTopConsumers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCosts() {
      try {
        const [alloc, top] = await Promise.all([
          apiFetch('/api/costs/allocation'),
          apiFetch('/api/costs/top-consumers?limit=10')
        ]);
        setAllocation(alloc);
        setTopConsumers(top.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchCosts();
  }, []);

  if (loading) return <div style={styles.loading}>Loading cost data...</div>;

  const summary = allocation?.summary;

  return (
    <div>
      {/* Cost Summary Cards */}
      <div style={styles.summaryRow}>
        <div style={styles.summaryCard}>
          <div style={{...styles.summaryValue, color: '#0f3460'}}>
            ${summary?.totalCombinedCost?.toLocaleString()}
          </div>
          <div style={styles.summaryLabel}>Total Combined Cost</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={{...styles.summaryValue, color: '#533483'}}>
            {summary?.totalSnowflakeCredits?.toLocaleString()}
          </div>
          <div style={styles.summaryLabel}>Snowflake Credits (${summary?.totalSnowflakeCost?.toLocaleString()})</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={{...styles.summaryValue, color: '#fe6b35'}}>
            ${summary?.totalAWSCost?.toLocaleString()}
          </div>
          <div style={styles.summaryLabel}>AWS Hosting Cost</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={{...styles.summaryValue, color: '#e94560'}}>
            ${summary?.potentialSavings?.toLocaleString()}
          </div>
          <div style={styles.summaryLabel}>
            Potential Savings ({summary?.inefficientReportCount} inefficient reports)
          </div>
        </div>
      </div>

      {/* Top Consumers */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>Top 10 Most Expensive Reports</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Rank', 'Report', 'Owner', 'Total Cost', 'Snowflake', 'AWS', 'Views', 'Health'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topConsumers.map((r, i) => (
              <tr key={r.reportId} style={styles.tr}>
                <td style={styles.td}>{i + 1}</td>
                <td style={styles.td}><strong>{r.reportId}</strong><br/><span style={{color:'#888',fontSize:11}}>{r.reportName}</span></td>
                <td style={styles.td}>{r.owner}</td>
                <td style={{...styles.td, fontWeight: 700, color: '#0f3460'}}>${r.totalCost}</td>
                <td style={styles.td}>{r.snowflakeCredits?.toFixed(1)}</td>
                <td style={styles.td}>${r.awsCost?.toFixed(2)}</td>
                <td style={styles.td}>{r.monthlyViews}</td>
                <td style={styles.td}>
                  <span style={{fontWeight:700, color: r.healthScore > 70 ? '#1a8b6e' : r.healthScore > 40 ? '#fe6b35' : '#e94560'}}>
                    {r.healthScore}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Full Allocation Table */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>
          Full Cost Allocation
          <span style={{fontSize:13, fontWeight:400, color:'#888', marginLeft:8}}>
            Unit cost = (Snowflake credits × $3 + AWS cost) / monthly active views
          </span>
        </h3>
        <div style={{maxHeight: 400, overflowY: 'auto'}}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Report', 'Owner', 'Credits', 'AWS Cost', 'Total Cost', 'Views', 'Cost/View', 'Cost/Query', 'Flag'].map(h => (
                  <th key={h} style={{...styles.th, position: 'sticky', top: 0, background: '#f5f5fa'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allocation?.data?.map(r => (
                <tr key={r.reportId} style={{...styles.tr, background: r.isCostInefficient ? '#fef2f2' : 'transparent'}}>
                  <td style={styles.td}>{r.reportId}</td>
                  <td style={styles.td}>{r.owner}</td>
                  <td style={styles.td}>{r.snowflakeCredits?.toFixed(1)}</td>
                  <td style={styles.td}>${r.awsHostingCost?.toFixed(2)}</td>
                  <td style={{...styles.td, fontWeight:600}}>${r.totalCost}</td>
                  <td style={styles.td}>{r.monthlyActiveViews}</td>
                  <td style={styles.td}>{r.costPerView != null ? `$${r.costPerView}` : '—'}</td>
                  <td style={styles.td}>{r.costPerQuery != null ? `$${r.costPerQuery}` : '—'}</td>
                  <td style={styles.td}>
                    {r.isCostInefficient && <span style={styles.flagBadge}>INEFFICIENT</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles = {
  loading: { textAlign: 'center', padding: 60, color: '#999', fontSize: 16 },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 },
  summaryCard: { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  summaryValue: { fontSize: 28, fontWeight: 700, lineHeight: 1.2 },
  summaryLabel: { fontSize: 13, color: '#888', marginTop: 4 },
  panel: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 24 },
  panelTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#1a1a2e' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #eee' },
  tr: { borderBottom: '1px solid #f0f0f5' },
  td: { padding: '8px 12px', fontSize: 13, color: '#333' },
  flagBadge: { padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#e94560', background: '#fde8ec' }
};
