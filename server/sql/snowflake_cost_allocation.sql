-- ============================================================================
-- Snowflake Cloud Cost Allocation SQL Scripts
-- Pure Insights Command Center - Case Study 3
-- Author: Abhay Pratap Singh
-- ============================================================================
--
-- These queries run against Snowflake's ACCOUNT_USAGE schema to figure out
-- how much each report costs us in compute credits and AWS hosting.
--
-- Snowflake charges by "credits" - each warehouse query uses compute credits
-- (roughly $3 per credit). The ACCOUNT_USAGE schema has views like:
--   QUERY_HISTORY - every query with its warehouse, user, credits, duration
--   WAREHOUSE_METERING_HISTORY - credit usage per warehouse per hour
--
-- The main goal: answer "how much does Report X cost per month?"
-- ============================================================================


-- ============================================================================
-- 1. CREATE SIMULATED ACCOUNT_USAGE TABLES (for assessment purposes)
-- In production, these exist as views in SNOWFLAKE.ACCOUNT_USAGE
-- ============================================================================

CREATE OR REPLACE TABLE pure_insights.account_usage.query_history (
    query_id            VARCHAR(36)     NOT NULL,
    query_text          VARCHAR(10000),
    query_tag           VARCHAR(500),     -- Used to tag queries with report_id
    database_name       VARCHAR(256),
    schema_name         VARCHAR(256),
    warehouse_name      VARCHAR(256),
    warehouse_size      VARCHAR(20),
    user_name           VARCHAR(256),
    role_name           VARCHAR(256),
    execution_status    VARCHAR(20),       -- SUCCESS, FAIL, INCIDENT
    start_time          TIMESTAMP_NTZ,
    end_time            TIMESTAMP_NTZ,
    total_elapsed_time  NUMBER(38,0),      -- milliseconds
    credits_used_cloud_services  FLOAT,
    bytes_scanned       NUMBER(38,0),
    rows_produced       NUMBER(38,0),
    partitions_scanned  NUMBER(38,0),
    partitions_total    NUMBER(38,0)
);

CREATE OR REPLACE TABLE pure_insights.account_usage.warehouse_metering_history (
    start_time          TIMESTAMP_NTZ,
    end_time            TIMESTAMP_NTZ,
    warehouse_name      VARCHAR(256),
    credits_used        FLOAT,
    credits_used_compute  FLOAT,
    credits_used_cloud_services  FLOAT
);

CREATE OR REPLACE TABLE pure_insights.report_registry (
    report_id           VARCHAR(20)     PRIMARY KEY,
    report_name         VARCHAR(256),
    owner_email         VARCHAR(256),
    warehouse_name      VARCHAR(256),
    database_name       VARCHAR(256),
    refresh_schedule    VARCHAR(50),     -- e.g. 'EVERY 1 HOUR', 'DAILY'
    created_at          TIMESTAMP_NTZ,
    last_refreshed_at   TIMESTAMP_NTZ,
    is_active           BOOLEAN DEFAULT TRUE
);


-- ============================================================================
-- 2. PER-REPORT CREDIT CONSUMPTION (monthly)
-- Joins query_history with report_registry using query_tag
-- ============================================================================

-- Using a CTE (WITH ... AS) here to break this into readable steps
-- basically a named temporary result that makes the query easier to follow

WITH monthly_report_credits AS (
    SELECT
        rr.report_id,
        rr.report_name,
        rr.owner_email,
        DATE_TRUNC('MONTH', qh.start_time) AS usage_month,
        COUNT(DISTINCT qh.query_id)        AS query_count,
        SUM(qh.credits_used_cloud_services) AS total_credits,
        SUM(qh.bytes_scanned) / POWER(1024, 3) AS total_gb_scanned,
        AVG(qh.total_elapsed_time) / 1000   AS avg_query_duration_sec,
        MAX(qh.total_elapsed_time) / 1000   AS max_query_duration_sec
    FROM pure_insights.report_registry rr
    JOIN pure_insights.account_usage.query_history qh
        ON qh.query_tag = rr.report_id
    WHERE qh.execution_status = 'SUCCESS'
      AND qh.start_time >= DATEADD('MONTH', -3, CURRENT_TIMESTAMP())
    GROUP BY 1, 2, 3, 4
)
SELECT
    report_id,
    report_name,
    owner_email,
    usage_month,
    query_count,
    ROUND(total_credits, 4)         AS credits_consumed,
    ROUND(total_credits * 3, 2)     AS estimated_cost_usd,  -- $3/credit
    ROUND(total_gb_scanned, 2)      AS gb_scanned,
    ROUND(avg_query_duration_sec, 2) AS avg_duration_sec,
    ROUND(max_query_duration_sec, 2) AS max_duration_sec
FROM monthly_report_credits
ORDER BY estimated_cost_usd DESC;


-- ============================================================================
-- 3. UNIT COST PER ACTIVE USER VIEW
-- The key metric: how much does each "eyeball" on a report cost?
-- ============================================================================

-- using window functions here - they let you rank/calculate across rows
-- without collapsing them like GROUP BY does
-- DENSE_RANK = ranking (no gaps), PERCENT_RANK = percentile position

WITH report_costs AS (
    SELECT
        rr.report_id,
        rr.report_name,
        rr.owner_email,
        SUM(qh.credits_used_cloud_services) * 3  AS snowflake_cost_usd,
        COUNT(DISTINCT qh.query_id)               AS total_queries
    FROM pure_insights.report_registry rr
    JOIN pure_insights.account_usage.query_history qh
        ON qh.query_tag = rr.report_id
    WHERE qh.start_time >= DATEADD('MONTH', -1, CURRENT_TIMESTAMP())
    GROUP BY 1, 2, 3
),
report_usage AS (
    -- In production, this comes from the monitoring table or analytics events
    SELECT
        report_id,
        monthly_active_views,
        aws_hosting_cost_usd,
        concurrent_user_peak
    FROM pure_insights.monitoring_data
),
combined AS (
    SELECT
        rc.report_id,
        rc.report_name,
        rc.owner_email,
        rc.snowflake_cost_usd,
        ru.aws_hosting_cost_usd,
        (rc.snowflake_cost_usd + ru.aws_hosting_cost_usd) AS total_cost,
        ru.monthly_active_views,
        rc.total_queries,
        ru.concurrent_user_peak,
        -- Unit cost per view
        CASE
            WHEN ru.monthly_active_views > 0
            THEN ROUND((rc.snowflake_cost_usd + ru.aws_hosting_cost_usd)
                        / ru.monthly_active_views, 4)
            ELSE NULL  -- Avoid division by zero
        END AS cost_per_active_view,
        -- Unit cost per query
        CASE
            WHEN rc.total_queries > 0
            THEN ROUND(rc.snowflake_cost_usd / rc.total_queries, 4)
            ELSE NULL
        END AS cost_per_query,
        -- Ranking by total cost
        DENSE_RANK() OVER (ORDER BY (rc.snowflake_cost_usd + ru.aws_hosting_cost_usd) DESC)
            AS cost_rank,
        -- Percentile within cost distribution
        PERCENT_RANK() OVER (ORDER BY (rc.snowflake_cost_usd + ru.aws_hosting_cost_usd))
            AS cost_percentile
    FROM report_costs rc
    JOIN report_usage ru ON rc.report_id = ru.report_id
)
SELECT
    report_id,
    report_name,
    owner_email,
    ROUND(snowflake_cost_usd, 2)     AS snowflake_cost,
    ROUND(aws_hosting_cost_usd, 2)   AS aws_cost,
    ROUND(total_cost, 2)             AS total_cost,
    monthly_active_views,
    cost_per_active_view,
    cost_per_query,
    cost_rank,
    ROUND(cost_percentile * 100, 1)  AS cost_percentile_pct,
    -- Flag inefficient reports: high cost, low usage
    CASE
        WHEN cost_per_active_view > 1.0 OR monthly_active_views = 0
        THEN 'REVIEW_FOR_OPTIMIZATION'
        WHEN cost_per_active_view > 0.50
        THEN 'MONITOR'
        ELSE 'HEALTHY'
    END AS cost_efficiency_status
FROM combined
ORDER BY total_cost DESC;


-- ============================================================================
-- 4. WAREHOUSE-LEVEL COST AGGREGATION
-- Roll up credits by warehouse to identify the most expensive compute resources
-- ============================================================================

SELECT
    wmh.warehouse_name,
    DATE_TRUNC('DAY', wmh.start_time)   AS usage_date,
    SUM(wmh.credits_used)               AS daily_credits,
    SUM(wmh.credits_used_compute)       AS compute_credits,
    SUM(wmh.credits_used_cloud_services) AS cloud_services_credits,
    ROUND(SUM(wmh.credits_used) * 3, 2) AS daily_cost_usd,
    -- 7-day moving average for trend analysis
    AVG(SUM(wmh.credits_used)) OVER (
        PARTITION BY wmh.warehouse_name
        ORDER BY DATE_TRUNC('DAY', wmh.start_time)
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS credits_7day_avg
FROM pure_insights.account_usage.warehouse_metering_history wmh
WHERE wmh.start_time >= DATEADD('MONTH', -1, CURRENT_TIMESTAMP())
GROUP BY 1, 2
ORDER BY warehouse_name, usage_date;


-- ============================================================================
-- 5. OWNER-LEVEL COST ATTRIBUTION (chargeback model)
-- Aggregate costs by report owner for departmental chargeback
-- ============================================================================

-- Chargeback = actually billing teams for their cloud usage
-- This query groups costs by report owner so each team sees what they owe

WITH owner_costs AS (
    SELECT
        rr.owner_email,
        COUNT(DISTINCT rr.report_id)                AS report_count,
        SUM(qh.credits_used_cloud_services)         AS total_credits,
        SUM(qh.credits_used_cloud_services) * 3     AS total_snowflake_cost,
        SUM(qh.bytes_scanned) / POWER(1024, 4)      AS total_tb_scanned,
        COUNT(DISTINCT qh.query_id)                  AS total_queries,
        AVG(qh.total_elapsed_time) / 1000            AS avg_query_duration_sec
    FROM pure_insights.report_registry rr
    JOIN pure_insights.account_usage.query_history qh
        ON qh.query_tag = rr.report_id
    WHERE qh.start_time >= DATEADD('MONTH', -1, CURRENT_TIMESTAMP())
      AND rr.owner_email IS NOT NULL
      AND rr.owner_email != 'UNASSIGNED'
    GROUP BY 1
)
SELECT
    owner_email,
    report_count,
    ROUND(total_credits, 2)             AS credits_consumed,
    ROUND(total_snowflake_cost, 2)      AS snowflake_cost_usd,
    ROUND(total_tb_scanned, 4)          AS tb_scanned,
    total_queries,
    ROUND(avg_query_duration_sec, 2)    AS avg_duration_sec,
    -- Owner's share of total spend
    ROUND(total_snowflake_cost / NULLIF(SUM(total_snowflake_cost) OVER (), 0) * 100, 1)
        AS pct_of_total_spend,
    -- Rank by cost
    RANK() OVER (ORDER BY total_snowflake_cost DESC) AS cost_rank
FROM owner_costs
ORDER BY total_snowflake_cost DESC;


-- ============================================================================
-- 6. ORPHANED REPORT COST WASTE ANALYSIS
-- Quantify how much is spent on reports with no assigned owner
-- ============================================================================

SELECT
    rr.report_id,
    rr.report_name,
    rr.owner_email,
    COUNT(DISTINCT qh.query_id)                      AS queries_still_running,
    ROUND(SUM(qh.credits_used_cloud_services) * 3, 2) AS wasted_cost_usd,
    MAX(qh.start_time)                                AS last_query_time,
    DATEDIFF('DAY', MAX(qh.start_time), CURRENT_TIMESTAMP()) AS days_since_last_query
FROM pure_insights.report_registry rr
JOIN pure_insights.account_usage.query_history qh
    ON qh.query_tag = rr.report_id
WHERE (rr.owner_email IS NULL OR rr.owner_email = 'UNASSIGNED')
  AND qh.start_time >= DATEADD('MONTH', -1, CURRENT_TIMESTAMP())
GROUP BY 1, 2, 3
HAVING wasted_cost_usd > 0
ORDER BY wasted_cost_usd DESC;


-- ============================================================================
-- 7. COST ANOMALY DETECTION
-- Flag reports with unusual credit consumption patterns
-- ============================================================================

-- Z-score = how many standard deviations away from the mean
-- if |z| > 2 its considered anomalous (outside 95% of normal values)
-- helps catch sudden cost spikes from runaway queries or misconfig

WITH daily_costs AS (
    SELECT
        qh.query_tag                        AS report_id,
        DATE_TRUNC('DAY', qh.start_time)   AS usage_date,
        SUM(qh.credits_used_cloud_services) AS daily_credits
    FROM pure_insights.account_usage.query_history qh
    WHERE qh.query_tag IS NOT NULL
      AND qh.start_time >= DATEADD('MONTH', -1, CURRENT_TIMESTAMP())
    GROUP BY 1, 2
),
cost_stats AS (
    SELECT
        report_id,
        usage_date,
        daily_credits,
        AVG(daily_credits) OVER (PARTITION BY report_id) AS avg_daily_credits,
        STDDEV(daily_credits) OVER (PARTITION BY report_id) AS stddev_daily_credits
    FROM daily_costs
)
SELECT
    report_id,
    usage_date,
    ROUND(daily_credits, 4)     AS credits,
    ROUND(avg_daily_credits, 4) AS avg_credits,
    ROUND(
        CASE
            WHEN stddev_daily_credits > 0
            THEN (daily_credits - avg_daily_credits) / stddev_daily_credits
            ELSE 0
        END, 2
    ) AS z_score,
    CASE
        WHEN ABS((daily_credits - avg_daily_credits) / NULLIF(stddev_daily_credits, 0)) > 3
        THEN 'CRITICAL_ANOMALY'
        WHEN ABS((daily_credits - avg_daily_credits) / NULLIF(stddev_daily_credits, 0)) > 2
        THEN 'ANOMALY'
        ELSE 'NORMAL'
    END AS anomaly_status
FROM cost_stats
WHERE ABS((daily_credits - avg_daily_credits) / NULLIF(stddev_daily_credits, 0)) > 2
ORDER BY z_score DESC;


-- ============================================================================
-- 8. EXECUTIVE COST SUMMARY VIEW
-- Materialized view for the dashboard's cost overview panel
-- ============================================================================

CREATE OR REPLACE VIEW pure_insights.cost_summary_v AS
WITH totals AS (
    SELECT
        SUM(qh.credits_used_cloud_services) * 3 AS total_snowflake_cost,
        COUNT(DISTINCT qh.query_id)              AS total_queries,
        COUNT(DISTINCT qh.query_tag)             AS reports_with_queries
    FROM pure_insights.account_usage.query_history qh
    WHERE qh.start_time >= DATEADD('MONTH', -1, CURRENT_TIMESTAMP())
),
monitoring AS (
    SELECT
        SUM(aws_hosting_cost_usd) AS total_aws_cost,
        SUM(monthly_active_views) AS total_views,
        COUNT(*) AS total_reports
    FROM pure_insights.monitoring_data
)
SELECT
    ROUND(t.total_snowflake_cost, 2)                AS snowflake_cost,
    ROUND(m.total_aws_cost, 2)                      AS aws_cost,
    ROUND(t.total_snowflake_cost + m.total_aws_cost, 2) AS combined_cost,
    t.total_queries,
    t.reports_with_queries,
    m.total_views,
    m.total_reports,
    ROUND((t.total_snowflake_cost + m.total_aws_cost) / NULLIF(m.total_views, 0), 4)
        AS overall_cost_per_view,
    ROUND(t.total_snowflake_cost / NULLIF(t.total_queries, 0), 4)
        AS cost_per_query
FROM totals t
CROSS JOIN monitoring m;
