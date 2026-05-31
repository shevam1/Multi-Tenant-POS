'use client';

import { useShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';

interface SettingItem { href: string; title: string; description: string; icon: string; perm?: string }

const SECTIONS: { group: string; items: SettingItem[] }[] = [
  {
    group: 'My Account',
    items: [
      { href: '/settings/account', title: 'My Account', description: 'Your profile, contact info & password', icon: '👤' },
    ],
  },
  {
    group: 'Business',
    items: [
      { href: '/settings/business', title: 'Business Settings', description: 'Info, localization, social & business hours', icon: '🏢', perm: 'settings.manage' },
      { href: '/settings/booking', title: 'Appointment Controls', description: 'Double-booking, slot interval, large-dog weight', icon: '⚙️', perm: 'settings.manage' },
    ],
  },
  {
    group: 'Catalog & Pricing',
    items: [
      { href: '/packages', title: 'Packages', description: 'Services, add-ons & per-location pricing', icon: '📦', perm: 'packages.manage' },
      { href: '/coupons', title: 'Coupons', description: 'Discount codes & promotions', icon: '🏷️', perm: 'coupons.manage' },
      { href: '/memberships', title: 'Memberships', description: 'Subscription tiers & loyalty', icon: '⭐', perm: 'memberships.manage' },
    ],
  },
  {
    group: 'Pet & CRM Data',
    items: [
      { href: '/settings/pet-options', title: 'Pet Options', description: 'Type, breed, behavior, coat, weight, vaccine & tag lists', icon: '🐾', perm: 'settings.manage' },
    ],
  },
  {
    group: 'Communications',
    items: [
      { href: '/reminders/automation', title: 'Automation Settings', description: 'Automated message & email triggers', icon: '⚙️', perm: 'settings.manage' },
      { href: '/settings/sms-auto-reply', title: 'SMS Auto-Reply', description: 'Instant reply to inbound texts', icon: '💬', perm: 'settings.manage' },
    ],
  },
  {
    group: 'Forms & Compliance',
    items: [
      { href: '/forms', title: 'Forms', description: 'Intake & consent form builder', icon: '📝' },
    ],
  },
  {
    group: 'Team',
    items: [
      { href: '/staff', title: 'Staff', description: 'Staff logins & accounts', icon: '👥', perm: 'staff.manage' },
      { href: '/settings/roles', title: 'Roles & Permissions', description: 'Custom role tiers, access & login control', icon: '🔐', perm: 'staff.manage' },
      { href: '/scheduling', title: 'Schedule', description: 'Shift roster & leave requests', icon: '🗓️', perm: 'scheduling.manage' },
      { href: '/payroll', title: 'Payroll', description: 'Commission, clock in/out & tip splitting', icon: '💵', perm: 'settings.manage' },
    ],
  },
];

export default function SettingsPage() {
  const { me } = useShell();
  const can = (perm?: string) => !perm || me.permissions.includes(perm);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings &amp; Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your business configuration, staff, and preferences.</p>
      </div>

      {SECTIONS.map(section => {
        const visible = section.items.filter(i => can(i.perm));
        if (visible.length === 0) return null;
        return (
          <section key={section.group}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{section.group}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map(item => (
                <a key={item.href} href={item.href} className="group">
                  <Card className="h-full p-5 transition hover:border-primary/40 hover:shadow-md">
                    <div className="mb-2 text-2xl">{item.icon}</div>
                    <p className="font-medium group-hover:text-primary">{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                  </Card>
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
