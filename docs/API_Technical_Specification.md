# Pure Insights Command Center — REST API & WebSocket Technical Specification

**Version:** 1.0  
**Author:** Abhay Pratap Singh  
**Date:** October 2026  
**Case Study:** 3 — Platform Operational Analytics

---

## 1. Architecture Overview

The Pure Insights Command Center is a full-stack operational analytics platform built on:

- **Backend:** Node.js v18+ with Express.js 4.x
- **Real-time:** WebSocket (ws library) + Server-Sent Events (SSE)
- **Authentication:** JWT (JSON Web Tokens) with RBAC (Role-Based Access Control)
- **Data Store:** In-memory store loaded from cleaned CSV (production: Snowflake + PostgreSQL)
- **Frontend:** React 18 SPA with real-time WebSocket integration

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     REACT FRONTEND                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │Dashboard │  │ Reports  │  │  Alerts  │  │Cost Alloc. │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘ │
│       │              │             │               │        │
│       └──────────────┴──────┬──────┴───────────────┘        │
│                             │                               │
│                    ┌────────┴────────┐                      │
│                    │  API Client +   │                      │
│                    │  WebSocket Hook │                      │
│                    └────────┬────────┘                      │
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTP/WS
┌─────────────────────────────┼───────────────────────────────┐
│                    NODE.JS SERVER                           │
│                    ┌────────┴────────┐                      │
│                    │   Express.js    │                      │
│                    │   + WS Server   │                      │
│                    └────────┬────────┘                      │
│          ┌──────────────────┼──────────────────┐            │
│   ┌──────┴──────┐   ┌──────┴──────┐   ┌───────┴───────┐   │
│   │ Auth MW     │   │ RBAC MW     │   │ Alert Service │   │
│   │ (JWT)       │   │ (Permissions)│   │ (EventEmitter)│   │
│   └─────────────┘   └─────────────┘   └───────────────┘   │
│          ┌──────────────────┼──────────────────┐            │
│   ┌──────┴──────┐   ┌──────┴──────┐   ┌───────┴───────┐   │
│   │ /api/auth   │   │/api/reports │   │ /api/costs    │   │
│   │ /api/alerts │   │/api/dashboard│   │ /ws           │   │
│   └─────────────┘   └─────────────┘   └───────────────┘   │
│                    ┌────────┴────────┐                      │
│                    │  Data Layer     │                      │
│                    │  (CSV → Memory) │                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication & Authorization

### 2.1 Authentication Flow (JWT)

```
Client                          Server
  │                               │
  │  POST /api/auth/login         │
  │  {username, password}  ─────► │ Validate credentials
  │                               │ Generate JWT (24h expiry)
  │  ◄───── {token, user}        │
  │                               │
  │  GET /api/reports             │
  │  Authorization: Bearer <jwt> ─► Verify JWT signature
  │                               │ Extract user.role
  │  ◄───── {data: [...]}        │ Check RBAC permissions
  │                               │
```

**JWT Payload Structure:**
```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "email": "admin@purestorage.com",
  "iat": 1696900000,
  "exp": 1696986400
}
```

### 2.2 RBAC Permission Matrix

| Permission              | Admin | Analyst | Viewer |
|--------------------------|-------|---------|--------|
| `view_dashboard`         | ✅    | ✅      | ✅     |
| `view_reports`           | ✅    | ✅      | ✅     |
| `view_report_detail`     | ✅    | ✅      | ❌     |
| `view_costs`             | ✅    | ✅      | ❌     |
| `view_cost_allocation`   | ✅    | ✅      | ❌     |
| `view_alerts`            | ✅    | ✅      | ✅     |
| `configure_alerts`       | ✅    | ❌      | ❌     |
| `manage_users`           | ✅    | ❌      | ❌     |
| `reassign_reports`       | ✅    | ❌      | ❌     |
| `view_audit_log`         | ✅    | ❌      | ❌     |

---

## 3. REST API Endpoints

### 3.1 Authentication

#### `POST /api/auth/login`
Authenticate and receive JWT token.

**Request:**
```json
{ "username": "admin", "password": "admin123" }
```

**Response (200):**
```json
{
  "token": "eyJhbG...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "email": "admin@purestorage.com",
    "permissions": ["view_dashboard", "view_reports", ...]
  }
}
```

**Errors:** `400` missing fields, `401` invalid credentials.

#### `GET /api/auth/me`
Returns current authenticated user's profile.  
**Auth:** Required. **Response:** `{ user: { ...profile, permissions } }`

---

### 3.2 Dashboard

#### `GET /api/dashboard/stats`
Aggregated platform statistics.  
**Auth:** Required. **Permission:** `view_dashboard`

**Response (200):**
```json
{
  "totalReports": 100,
  "orphanedCount": 14,
  "alertCount": 76,
  "failedCount": 16,
  "totalCredits": 61174.31,
  "totalAWSCost": 24439.82,
  "avgHealthScore": 67.6,
  "avgLoadTime": 26.3,
  "costInefficient": 4,
  "tierCounts": { "FAST": 8, "NORMAL": 18, "SLOW": 29, "CRITICAL": 27, "EXTREME": 18 },
  "statusCounts": { "SUCCESS": 68, "FAILED": 16, "TIMED_OUT": 8, "UNKNOWN": 8 },
  "ownerCounts": { "user_1@company.com": 8, ... }
}
```

#### `GET /api/dashboard/latency-distribution`
Latency tier breakdown for charting.

#### `GET /api/dashboard/status-breakdown`
Refresh status distribution with average health scores.

#### `GET /api/dashboard/owner-summary`
Per-owner report health summary with cost aggregation.

---

### 3.3 Reports

#### `GET /api/reports`
List all reports with filtering, sorting, and pagination.

**Query Parameters:**
| Param     | Type   | Description                          |
|-----------|--------|--------------------------------------|
| `status`  | string | Filter: SUCCESS, FAILED, TIMED_OUT, UNKNOWN |
| `tier`    | string | Filter: FAST, NORMAL, SLOW, CRITICAL, EXTREME |
| `orphaned`| bool   | Filter: true = orphaned only         |
| `owner`   | string | Filter by owner email                |
| `search`  | string | Search report_id or report_name      |
| `sort`    | string | Sort field (prefix `-` for desc). Default: `-health_score` |
| `page`    | int    | Page number (default: 1)             |
| `limit`   | int    | Items per page (default: 20, max: 100) |

**Response (200):**
```json
{
  "data": [ { "report_id": "RPT_200", ... } ],
  "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

#### `GET /api/reports/orphaned`
List orphaned reports with aggregated cost impact.

#### `GET /api/reports/:id`
Detailed report with all historical snapshots.

#### `GET /api/reports/:id/health`
Health score breakdown showing component scores.

**Response (200):**
```json
{
  "reportId": "RPT_200",
  "healthScore": 85.2,
  "breakdown": {
    "refreshStatus": { "score": 40, "max": 40, "value": "SUCCESS" },
    "loadTime":      { "score": 21.8, "max": 30, "value": 15.0 },
    "costEfficiency": { "score": 11.2, "max": 15, "value": 0.25 },
    "ownership":     { "score": 15, "max": 15, "value": "Owned" }
  },
  "healthHistory": [ { "healthScore": 85.2, "loadTime": 15.0, "status": "SUCCESS" }, ... ]
}
```

---

### 3.4 Cost Allocation

#### `GET /api/costs/allocation`
Per-report cost allocation with unit economics.  
**Permission:** `view_cost_allocation`

**Response includes per-report:** snowflakeCredits, awsHostingCost, totalCost (credits × $3 + AWS), monthlyActiveViews, costPerView, costPerQuery, isCostInefficient flag.

**Summary object:** totalSnowflakeCredits, totalSnowflakeCost, totalAWSCost, totalCombinedCost, inefficientReportCount, inefficientCost, potentialSavings (est. 40% recoverable).

#### `GET /api/costs/by-owner`
Cost breakdown grouped by report owner for chargeback.

#### `GET /api/costs/top-consumers?limit=10`
Top N most expensive reports by total cost.

---

### 3.5 Alerts

#### `GET /api/alerts`
List alerts with filtering.

**Query Parameters:** `severity`, `type`, `acknowledged`, `reportId`, `limit`

#### `POST /api/alerts/:id/acknowledge`
Acknowledge an alert. Broadcasts acknowledgment to all connected WebSocket clients.

#### `GET /api/alerts/stream` (SSE)
Server-Sent Events endpoint for real-time alert streaming.

**Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event format:**
```
data: {"id":42,"type":"LATENCY_WARNING","severity":"WARNING","reportId":"RPT_205","message":"Load latency exceeds threshold: 32.5s","timestamp":"2026-10-10T08:00:00.000Z"}\n\n
```

#### `GET /api/alerts/summary`
Alert statistics grouped by type and severity.

---

### 3.6 System

#### `GET /api/health`
Health check endpoint (no auth required).

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2026-10-10T08:00:00.000Z",
  "reportCount": 100,
  "activeWebSockets": 3,
  "activeSSEClients": 1
}
```

---

## 4. WebSocket Protocol

### 4.1 Connection

```
ws://localhost:4000/ws?token=<JWT>
```

The `token` query parameter authenticates the WebSocket connection. Without it, the client receives read-only access (can receive alerts but cannot acknowledge them).

### 4.2 Server → Client Messages

| Type                  | Trigger                        | Payload                                   |
|-----------------------|--------------------------------|-------------------------------------------|
| `CONNECTED`           | On connection                 | `{ message, user, timestamp }`            |
| `LATENCY_EXTREME`     | Load time > 45s               | `{ severity: "CRITICAL", reportId, value, threshold }` |
| `LATENCY_WARNING`     | Load time > 15s               | `{ severity: "WARNING", reportId, value, threshold }`  |
| `REFRESH_FAILED`      | Refresh status = FAILED       | `{ severity: "CRITICAL", reportId }`      |
| `REFRESH_TIMEOUT`     | Refresh status = TIMED_OUT    | `{ severity: "WARNING", reportId }`       |
| `CREDIT_ANOMALY`      | Negative credit consumption   | `{ severity: "WARNING", reportId, value }`|
| `ORPHANED_REPORT`     | No owner assigned             | `{ severity: "INFO", reportId }`          |
| `ALERT_ACKNOWLEDGED`  | Alert acknowledged            | `{ alertId, acknowledgedBy, timestamp }`  |

### 4.3 Client → Server Messages

| Type                  | Purpose                        | Payload                    |
|-----------------------|--------------------------------|----------------------------|
| `ACKNOWLEDGE_ALERT`   | Acknowledge an alert           | `{ alertId: <number> }`   |
| `PING`                | Keep-alive                     | `{}`                       |

### 4.4 Server → Client Responses

| Type                    | Trigger                     | Payload                      |
|-------------------------|-----------------------------|------------------------------|
| `ACKNOWLEDGE_RESPONSE`  | After ACKNOWLEDGE_ALERT     | `{ success, alertId }`       |
| `PONG`                  | After PING                  | `{ timestamp }`              |
| `ERROR`                 | Invalid message             | `{ message }`                |

### 4.5 Alert Evaluation Logic

The AlertService evaluates each report snapshot against configurable thresholds:

```
For each report snapshot:
  IF avg_load_time_sec > 45  → LATENCY_EXTREME (CRITICAL)
  ELIF avg_load_time_sec > 15 → LATENCY_WARNING (WARNING)
  
  IF last_refresh_status = FAILED   → REFRESH_FAILED (CRITICAL)
  ELIF last_refresh_status = TIMED_OUT → REFRESH_TIMEOUT (WARNING)
  
  IF has_credit_anomaly = true → CREDIT_ANOMALY (WARNING)
  IF is_orphaned = true        → ORPHANED_REPORT (INFO)
```

---

## 5. Data Quality Defects Identified

| ID     | Defect                    | Column(s)                      | Records | Severity | Resolution                           |
|--------|---------------------------|--------------------------------|---------|----------|--------------------------------------|
| DQ-001 | Orphaned reports          | owner_email                    | 245     | HIGH     | Added `is_orphaned` flag; set to 'UNASSIGNED' |
| DQ-002 | Negative credits          | snowflake_credits_consumed     | 24      | MEDIUM   | Flagged anomaly; zeroed negatives    |
| DQ-003 | Extreme latency spikes    | avg_load_time_sec              | 1,490   | HIGH     | Added `latency_tier` classification  |
| DQ-004 | User/cost discrepancy     | monthly_active_views + aws_cost| 126     | MEDIUM   | Added `cost_per_view` + inefficiency flag |

---

## 6. Error Response Format

All error responses follow a consistent structure:

```json
{
  "error": "Short error code",
  "message": "Human-readable explanation",
  "required": "permission_name",  // for 403 only
  "userRole": "viewer"            // for 403 only
}
```

**HTTP Status Codes Used:**
- `200` — Success
- `400` — Bad request (missing/invalid parameters)
- `401` — Authentication required or token expired
- `403` — Insufficient permissions (RBAC violation)
- `404` — Resource not found
- `500` — Internal server error

---

## 7. Running the Application

### Prerequisites
- Node.js 18+
- npm 9+

### Server
```bash
cd server
npm install
npm start          # Starts on port 4000
```

### Client (Development)
```bash
cd client
npm install
npm start          # Starts on port 3000, proxies API to 4000
```

### Demo Credentials
| Username  | Password     | Role    | Access Level |
|-----------|-------------|---------|--------------|
| admin     | admin123    | admin   | Full access  |
| analyst   | analyst123  | analyst | Read + costs |
| viewer    | viewer123   | viewer  | Read only    |
