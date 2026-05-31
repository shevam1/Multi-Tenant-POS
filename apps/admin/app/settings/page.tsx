'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface AuthMe { role: string; permissions: string[] }

interface SettingItem {
  href: string;
  title: string;
  description: string;
  icon: string;
  perm?: string; // required permission (undefined = always visible)
}

const SECTIONS: { group: string; items: SettingItem[] }[] = [
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
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthMe | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(setMe).catch(() => router.push('/login'));
  }, [router]);

  const can = (perm?: string) => !perm || (me?.permissions?.includes(perm) ?? false);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">Settings &amp; Configuration</h1>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {SECTIONS.map(section => {
          const visible = section.items.filter(i => can(i.perm));
          if (visible.length === 0) return null;
          return (
            <section key={section.group}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">{section.group}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {visible.map(item => (
                  <a key={item.href} href={item.href}
                    className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md hover:border-brand/40 transition">
                    <div className="text-2xl mb-2">{item.icon}</div>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{item.description}</p>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
