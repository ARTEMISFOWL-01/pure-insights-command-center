# Pure Insights Command Center

Case Study 3 - Platform Operational Analytics  
Abhay Pratap Singh (230911522)

---

## Setup

need Node.js v18+ installed

```
cd server
npm install
npm start
```

opens on http://localhost:4000

if you want to run the react dev server separately:

```
cd client
npm install
npm start
```

that runs on port 3000 and proxies to 4000

### test logins

- admin / admin123 (full access)
- analyst / analyst123 (reports + costs)
- viewer / viewer123 (read only, no cost tab)

---

## Deliverables

1. **Codebase** - server/ and client/ folders (React + Node.js + RBAC)
2. **API & WebSocket Spec** - docs/API_Technical_Specification.md
3. **Snowflake SQL Scripts** - server/sql/snowflake_cost_allocation.sql

---

## Data Cleaning

ran clean_data.py on the raw csv to find the 4 defects. output is in cleaned_monitoring_data.csv and defect_log.json

defects found:

- 245 orphaned reports (owner_email was NaN or 'ORPHANED_REPORT') - flagged with is_orphaned column
- 24 negative snowflake credit values - flagged as anomaly and zeroed out
- 1490 records with load time above 15s threshold (some up to 55s) - added latency_tier column
- 126 cost-inefficient reports where aws cost didnt match usage - added cost_per_view and is_cost_inefficient

---

## Folder structure

- data/ - raw csv, cleaning script, cleaned csv, defect log
- server/ - express backend, routes, middleware, alert service
- server/sql/ - snowflake cost allocation queries (8 scripts)
- client/src/ - react components, auth context, websocket hook
- docs/ - api specification document
