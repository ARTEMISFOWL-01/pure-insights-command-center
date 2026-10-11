// Pure Insights Command Center - Main Server
// Using Express for REST API + ws library for WebSocket real-time alerts
// Reference: https://expressjs.com/en/starter/hello-world.html

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const db = require('./config/database');
const alertService = require('./services/alertService');
const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');
const costRoutes = require('./routes/costs');
const alertRoutes = require('./routes/alerts');
const { authMiddleware } = require('./middleware/auth');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./middleware/auth');

const app = express();
// need http.createServer so we can attach WebSocket to the same port
const server = http.createServer(app);

// CORS so the React dev server (port 3000) can talk to this server (port 4000)
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// simple request logger so i can see whats happening in the terminal
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/costs', costRoutes);
app.use('/api/alerts', alertRoutes);

// health check - no auth needed, just to verify server is running
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    reportCount: db.getUniqueReportIds().length,
    activeWebSockets: alertService.wsClients.size,
    activeSSEClients: alertService.sseClients.size
  });
});

// WebSocket server - attached to the same HTTP server on /ws path
// I chose the 'ws' library over socket.io because its lighter and we dont need rooms/namespaces
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log('[WS] New client connected');

  // authenticate via query param since WebSocket doesnt support headers directly
  // the client sends the JWT token as ?token=xxx in the URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  let user = null;
  if (token) {
    try {
      user = jwt.verify(token, JWT_SECRET);
      console.log(`[WS] Authenticated: ${user.username} (${user.role})`);
    } catch (e) {
      console.log('[WS] Invalid token, allowing read-only');
    }
  }

  alertService.addWSClient(ws);

  // let the client know connection worked
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: 'WebSocket connection established',
    user: user ? user.username : 'anonymous',
    timestamp: new Date().toISOString()
  }));

  // handle messages from the client (mainly for acknowledging alerts)
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'ACKNOWLEDGE_ALERT') {
        if (user) {
          const alert = alertService.acknowledgeAlert(msg.alertId, user.username);
          ws.send(JSON.stringify({
            type: 'ACKNOWLEDGE_RESPONSE',
            success: !!alert,
            alertId: msg.alertId
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'ERROR',
            message: 'Authentication required to acknowledge alerts'
          }));
        }
      } else if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
      } else {
        ws.send(JSON.stringify({ type: 'ERROR', message: `Unknown message type: ${msg.type}` }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected${user ? `: ${user.username}` : ''}`);
  });
});

// serve the react build for production (when you do npm run build in client/)
const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuildPath));
// any route that isnt /api or /ws should serve the react app (for client-side routing)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  }
});

// catch-all error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 4000;

// load the cleaned CSV data into memory
db.loadData();

// start the alert simulation - it cycles through reports and fires alerts
// in production this would be event-driven from the actual data pipeline
const allReports = db.getAllReports();
const alertReports = allReports.filter(r =>
  r.needs_alert || r.last_refresh_status === 'FAILED' || r.is_orphaned || r.has_credit_anomaly
);
alertService.startSimulation(alertReports, 5000);  // check every 5 sec

server.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Pure Insights Command Center`);
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log(`  WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`  API docs: http://localhost:${PORT}/api/health`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`  Demo credentials:`);
  console.log(`    admin/admin123    — Full access`);
  console.log(`    analyst/analyst123 — Read + costs`);
  console.log(`    viewer/viewer123  — Read only\n`);
});

module.exports = { app, server };
