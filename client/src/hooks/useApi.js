/**
 * API Hook — centralizes authenticated fetch calls
 */

import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export function useApi() {
  const { token, logout } = useAuth();

  const apiFetch = useCallback(async (path, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    };

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
      logout();
      throw new Error('Session expired');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }

    return res.json();
  }, [token, logout]);

  return { apiFetch };
}
