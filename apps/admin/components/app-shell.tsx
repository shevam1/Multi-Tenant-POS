'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, Bell, Search, LogOut, Store, HelpCircle, type LucideIcon } from 'lucide-react';
import { apiFetch, getToken } from '@/lib/api';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

interface Me {
  userId: string; tenantId: string; role: string; roleName?: string;
  storeId: string | null; storeName?: string | null; fullName: string; permissions: string[];
}
interface StoreOpt { id: string; name: string }

interface ShellCtx {
  me: Me;
  stores: StoreOpt[];
  storeId: string;
  setStoreId: (id: string) => void;
}
const Ctx = createContext<ShellCtx | null>(null);

/** Access shell-provided auth + selected store inside any (dash) page. */
export function useShell(): ShellCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useShell must be used within AppShell');
  return v;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState('');
  const [businessName, setBusinessName] = useState('OmniPOS');

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<Me>('/auth/me').then(u => {
      setMe(u);
      if (u.role === 'FRANCHISE_HQ_ADMIN') {
        apiFetch<StoreOpt[]>('/customers/stores').then(s => {
          setStores(s);
          setStoreId(s[0]?.id ?? '');
        }).catch(() => {});
      } else {
        setStoreId(u.storeId ?? '');
      }
    }).catch(() => router.push('/login'));
    // Tenant business name for the sidebar wordmark (any authed user can read).
    apiFetch<{ businessName: string | null }>('/settings')
      .then(s => { if (s.businessName?.trim()) setBusinessName(s.businessName.trim()); })
      .catch(() => {});
  }, [router]);

  if (!me) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading…</div>;

  const can = (perm?: string) => !perm || me.permissions.includes(perm);

  return (
    <Ctx.Provider value={{ me, stores, storeId, setStoreId }}>
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar can={can} businessName={businessName} />
        <Topbar me={me} stores={stores} storeId={storeId} setStoreId={setStoreId} onSignOut={() => { localStorage.clear(); router.push('/login'); }} />
        {/* Pages own their container: padded screens use <PageBody>, full-bleed
            screens (chat, POS) fill the area directly. */}
        <main className="ml-64 pt-16 min-h-screen">{children}</main>
      </div>
    </Ctx.Provider>
  );
}

function Sidebar({ can, businessName }: { can: (perm?: string) => boolean; businessName: string }) {
  const pathname = usePathname();
  const groups = NAV
    .map(g => ({ ...g, items: g.items.filter(i => can(i.perm)) }))
    .filter(g => g.items.length > 0);

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col bg-sidebar">
      <div className="flex flex-col gap-0.5 px-6 py-6">
        <span className="truncate text-xl font-bold text-white" title={businessName}>{businessName}</span>
        <span className="text-xs text-slate-400">Pet Management</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {groups.map(g => (
          <NavGroup key={g.group} label={g.group} items={g.items} pathname={pathname} />
        ))}
      </nav>
    </aside>
  );
}

function NavGroup({ label, items, pathname }: {
  label: string; items: { href: string; label: string; icon: LucideIcon; perm?: string }[]; pathname: string;
}) {
  const containsActive = items.some(i => pathname === i.href || pathname.startsWith(i.href + '/'));
  const [open, setOpen] = useState(containsActive);
  useEffect(() => { if (containsActive) setOpen(true); }, [containsActive]);

  // Single-item group → direct link (e.g. Overview, Configure).
  if (items.length === 1) {
    const it = items[0];
    const active = pathname === it.href || pathname.startsWith(it.href + '/');
    return <NavLink href={it.href} icon={it.icon} label={it.label} active={active} />;
  }

  const GroupIcon = items[0].icon;
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className={cn('flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
          containsActive ? 'text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
        <GroupIcon className="h-5 w-5 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 pb-1 pl-4">
          {items.map(it => {
            const active = pathname === it.href || pathname.startsWith(it.href + '/');
            return <NavLink key={it.href} href={it.href} icon={it.icon} label={it.label} active={active} compact />;
          })}
        </div>
      )}
    </div>
  );
}

function NavLink({ href, icon: Icon, label, active, compact }: {
  href: string; icon: LucideIcon; label: string; active: boolean; compact?: boolean;
}) {
  return (
    <a href={href}
      className={cn('flex items-center gap-3 rounded-lg px-4 text-sm transition-colors',
        compact ? 'py-2' : 'py-2.5 font-medium',
        active ? 'bg-primary font-semibold text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
      <Icon className="h-5 w-5 shrink-0" />
      <span>{label}</span>
    </a>
  );
}

function Topbar({ me, stores, storeId, setStoreId, onSignOut }: {
  me: Me; stores: StoreOpt[]; storeId: string; setStoreId: (id: string) => void; onSignOut: () => void;
}) {
  const isHQ = me.role === 'FRANCHISE_HQ_ADMIN';
  const initials = me.fullName.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <header className="fixed left-64 right-0 top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-white px-6">
      {isHQ && stores.length > 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
          <Store className="h-4 w-4 text-primary" />
          <select value={storeId} onChange={e => setStoreId(e.target.value)}
            className="bg-transparent text-sm font-medium text-foreground focus:outline-none">
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      ) : me.storeName ? (
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
          <Store className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{me.storeName}</span>
        </div>
      ) : null}

      <div className="relative max-w-md flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input placeholder="Search pets, appointments, or clients…"
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="Notifications"><Bell className="h-5 w-5" /></button>
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="Help"><HelpCircle className="h-5 w-5" /></button>
        <div className="flex items-center gap-2 pl-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials}</div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-medium">{me.fullName}</p>
            <p className="text-xs text-muted-foreground">{me.roleName ?? me.role.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <button onClick={onSignOut} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="Sign out"><LogOut className="h-5 w-5" /></button>
      </div>
    </header>
  );
}
