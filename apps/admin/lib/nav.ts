import {
  LayoutDashboard, CalendarDays, Users, MessageSquare, BellRing,
  Package, Ticket, Star, ShoppingBag, PawPrint,
  UserCog, ShieldCheck, CalendarClock, Banknote, Clock,
  BarChart3, Receipt, FileCheck, Settings, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Required permission (omit = always visible to authed users). */
  perm?: string;
}
export interface NavGroup {
  group: string;
  items: NavItem[];
}

/**
 * Central admin navigation manifest — the single source of truth for the
 * sidebar. Permission keys mirror the gating already used by each page
 * (see app/settings/page.tsx and per-page `/auth/me` checks). Items without
 * a `perm` are visible to any authenticated staff member.
 */
export const NAV: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    group: 'Operations',
    items: [
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/clients', label: 'Clients', icon: Users },
      { href: '/messages', label: 'Messages', icon: MessageSquare },
      { href: '/reminders', label: 'Reminders', icon: BellRing },
    ],
  },
  {
    group: 'Catalog & Pricing',
    items: [
      { href: '/packages', label: 'Packages', icon: Package, perm: 'packages.manage' },
      { href: '/coupons', label: 'Coupons', icon: Ticket, perm: 'coupons.manage' },
      { href: '/memberships', label: 'Memberships', icon: Star, perm: 'memberships.manage' },
      { href: '/products', label: 'Products', icon: ShoppingBag },
      { href: '/settings/pet-options', label: 'Pet Options', icon: PawPrint, perm: 'settings.manage' },
    ],
  },
  {
    group: 'Team',
    items: [
      { href: '/staff', label: 'Staff', icon: UserCog, perm: 'staff.manage' },
      { href: '/settings/roles', label: 'Roles', icon: ShieldCheck, perm: 'staff.manage' },
      { href: '/scheduling', label: 'Schedule', icon: CalendarClock, perm: 'scheduling.manage' },
      { href: '/payroll', label: 'Payroll', icon: Banknote, perm: 'settings.manage' },
      { href: '/timeclock', label: 'Time Clock', icon: Clock },
    ],
  },
  {
    group: 'Reports',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics.view' },
      { href: '/sales-expense', label: 'Sales & Expense', icon: Receipt, perm: 'analytics.view' },
      { href: '/compliance', label: 'Compliance', icon: FileCheck },
    ],
  },
  {
    group: 'Configure',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];
