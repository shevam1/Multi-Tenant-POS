import type { UserRole } from '@omnipos/db';

/**
 * Permission catalog. Each key gates a capability in the admin app.
 * Grouped for display in the staff-management UI.
 */
export const PERMISSION_CATALOG = [
  { group: 'Clients', perms: [
    { key: 'clients.view', label: 'View clients' },
    { key: 'clients.edit', label: 'Add / edit clients' },
    { key: 'clients.delete', label: 'Delete clients' },
  ]},
  { group: 'Calendar & Bookings', perms: [
    { key: 'calendar.view', label: 'View calendar' },
    { key: 'calendar.manage', label: 'Move / schedule appointments' },
    { key: 'bookings.checkout', label: 'POS checkout' },
    { key: 'bookings.process', label: 'No-show / cancel / close' },
  ]},
  { group: 'Catalog & Pricing', perms: [
    { key: 'packages.manage', label: 'Manage packages & pricing' },
    { key: 'coupons.manage', label: 'Manage coupons & discounts' },
  ]},
  { group: 'Memberships & Loyalty', perms: [
    { key: 'memberships.manage', label: 'Manage memberships & loyalty' },
  ]},
  { group: 'Operations', perms: [
    { key: 'inventory.manage', label: 'Manage inventory' },
    { key: 'scheduling.manage', label: 'Staff scheduling & time clock' },
  ]},
  { group: 'Administration', perms: [
    { key: 'analytics.view', label: 'View HQ analytics' },
    { key: 'staff.manage', label: 'Manage staff & permissions' },
    { key: 'settings.manage', label: 'Manage business settings' },
    { key: 'allLocations', label: 'Access all locations' },
  ]},
] as const;

export const ALL_PERMISSIONS: string[] = PERMISSION_CATALOG.flatMap(g => g.perms.map(p => p.key));

/** Default permission set per role. Used when a user has no explicit overrides. */
export const ROLE_DEFAULTS: Record<UserRole, string[]> = {
  FRANCHISE_HQ_ADMIN: [...ALL_PERMISSIONS], // everything, incl. allLocations
  STORE_MANAGER: [
    'clients.view', 'clients.edit', 'clients.delete',
    'calendar.view', 'calendar.manage', 'bookings.checkout', 'bookings.process',
    'packages.manage', 'coupons.manage', 'memberships.manage',
    'inventory.manage', 'scheduling.manage', 'analytics.view', 'staff.manage', 'settings.manage',
  ],
  RECEPTION: [
    'clients.view', 'clients.edit',
    'calendar.view', 'calendar.manage', 'bookings.checkout', 'bookings.process',
    'coupons.manage', 'memberships.manage',
  ],
  GROOMER: [
    'calendar.view', 'clients.view',
  ],
  CALL_CENTER_AGENT: [
    'clients.view', 'clients.edit', 'calendar.view',
  ],
  CUSTOMER: [],
};

/** Effective permissions = explicit overrides if present, otherwise role defaults. */
export function effectivePermissions(role: UserRole, overrides: string[]): string[] {
  return overrides.length > 0 ? overrides : ROLE_DEFAULTS[role];
}
