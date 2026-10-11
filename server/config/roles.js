// RBAC (Role-Based Access Control) config
// Instead of checking "if user is admin" everywhere, we define permissions
// and assign them to roles. The middleware just checks the permission name.
// 3 roles: admin (everything), analyst (view + costs), viewer (read-only)

const ROLES = {
  ADMIN: 'admin',
  ANALYST: 'analyst',
  VIEWER: 'viewer'
};

const PERMISSIONS = {
  // Dashboard & reporting
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_REPORTS: 'view_reports',
  VIEW_REPORT_DETAIL: 'view_report_detail',

  // Cost & credits
  VIEW_COSTS: 'view_costs',
  VIEW_COST_ALLOCATION: 'view_cost_allocation',

  // Alerts & telemetry
  VIEW_ALERTS: 'view_alerts',
  CONFIGURE_ALERTS: 'configure_alerts',

  // Admin operations
  MANAGE_USERS: 'manage_users',
  REASSIGN_REPORTS: 'reassign_reports',
  VIEW_AUDIT_LOG: 'view_audit_log'
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS), // All permissions

  [ROLES.ANALYST]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_REPORT_DETAIL,
    PERMISSIONS.VIEW_COSTS,
    PERMISSIONS.VIEW_COST_ALLOCATION,
    PERMISSIONS.VIEW_ALERTS
  ],

  [ROLES.VIEWER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.VIEW_ALERTS
  ]
};

function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

module.exports = { ROLES, PERMISSIONS, ROLE_PERMISSIONS, hasPermission, getRolePermissions };
