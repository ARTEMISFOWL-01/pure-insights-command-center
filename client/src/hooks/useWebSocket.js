// Custom hook for WebSocket connection
// Handles connecting, reconnecting (with exponential backoff), and collecting alerts
// Exponential backoff means: if connection fails, wait 1s, then 2s, then 4s, etc.
// so we dont spam the server with reconnection attempts

import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:4000/ws';
const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;

export function useWebSocket(token) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const wsRef = useRef(null);
  const reconnectDelay = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = token ? `${WS_URL}?token=${token}` : WS_URL;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[WS] Connected');
      setIsConnected(true);
      reconnectDelay.current = INITIAL_RECONNECT_DELAY;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);

        // Accumulate alerts
        if (data.severity && data.reportId) {
          setAlerts(prev => [data, ...prev].slice(0, 100)); // Keep last 100
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      setIsConnected(false);

      // Auto-reconnect with exponential backoff
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    wsRef.current = ws;
  }, [token]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const acknowledgeAlert = useCallback((alertId) => {
    sendMessage({ type: 'ACKNOWLEDGE_ALERT', alertId });
  }, [sendMessage]);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    alerts,
    sendMessage,
    acknowledgeAlert,
    clearAlerts: () => setAlerts([])
  };
}
