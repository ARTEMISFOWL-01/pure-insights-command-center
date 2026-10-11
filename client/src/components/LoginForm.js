import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginForm() {
  const { login, error, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(username, password);
    } catch (err) {
      // Error is handled by AuthContext
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>⚡</div>
        <h1 style={styles.title}>Pure Insights</h1>
        <p style={styles.subtitle}>Command Center</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={styles.input}
            required
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={styles.demo}>
          <p style={styles.demoTitle}>Demo Credentials:</p>
          <p style={styles.demoItem}><strong>admin</strong> / admin123 — Full access</p>
          <p style={styles.demoItem}><strong>analyst</strong> / analyst123 — Read + costs</p>
          <p style={styles.demoItem}><strong>viewer</strong> / viewer123 — Read only</p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
  },
  card: {
    background: '#fff', borderRadius: 16, padding: '48px 40px',
    width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    textAlign: 'center'
  },
  logo: { fontSize: 48, marginBottom: 8 },
  title: { margin: 0, fontSize: 28, color: '#1a1a2e', fontWeight: 700 },
  subtitle: { margin: '4px 0 32px', fontSize: 16, color: '#666' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  input: {
    padding: '14px 16px', borderRadius: 8, border: '1px solid #ddd',
    fontSize: 15, outline: 'none', transition: 'border-color 0.2s'
  },
  button: {
    padding: '14px', borderRadius: 8, border: 'none',
    background: '#fe6b35', color: '#fff', fontSize: 16, fontWeight: 600,
    cursor: 'pointer', transition: 'background 0.2s', marginTop: 8
  },
  error: { color: '#e94560', margin: 0, fontSize: 14 },
  demo: {
    marginTop: 32, padding: '16px', background: '#f5f5fa',
    borderRadius: 8, textAlign: 'left'
  },
  demoTitle: { margin: '0 0 8px', fontSize: 13, color: '#666', fontWeight: 600 },
  demoItem: { margin: '4px 0', fontSize: 13, color: '#444' }
};
