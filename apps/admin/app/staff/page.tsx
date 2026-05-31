'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Store { id: string; name: string }
interface StaffUser {
  id: string; email: string; fullName: string; role: string;
  phone: string | null; jobTitle: string | null;
  storeId: string | null; storeName: string | null; active: boolean;
  permissions: string[]; effectivePermissions: string[]; mustResetPassword: boolean;
}
interface PermCatalog {
  catalog: { group: string; perms: { key: string; label: string }[] }[];
  roleDefaults: Record<string, string[]>;
  all: string[];
}
interface AuthMe { userId: string; role: string; storeId: string | null; permissions: string[] }

const ROLE_LABEL: Record<string, string> = {
  FRANCHISE_HQ_ADMIN: 'HQ Admin', STORE_MANAGER: 'Store Manager', RECEPTION: 'Reception',
  GROOMER: 'Groomer', CALL_CENTER_AGENT: 'Call Center',
};
const ROLE_BADGE: Record<string, string> = {
  FRANCHISE_HQ_ADMIN: 'bg-violet-100 text-violet-700', STORE_MANAGER: 'bg-blue-100 text-blue-700',
  RECEPTION: 'bg-teal-100 text-teal-700', GROOMER: 'bg-amber-100 text-amber-700',
  CALL_CENTER_AGENT: 'bg-neutral-100 text-neutral-600',
};

export default function StaffPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthMe | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [perms, setPerms] = useState<PermCatalog | null>(null);
  const [storeFilter, setStoreFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const loadStaff = useCallback(async (sid: string) => {
    const data = await apiFetch<StaffUser[]>(`/staff${sid ? `?storeId=${sid}` : ''}`);
    setStaff(data);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    Promise.all([
      apiFetch<AuthMe>('/auth/me'),
      apiFetch<Store[]>('/customers/stores').catch(() => []),
      apiFetch<PermCatalog>('/staff/permissions'),
    ]).then(([u, s, p]) => {
      setMe(u);
      setStores(s);
      setPerms(p);
      if (!u.permissions.includes('staff.manage')) { router.push('/dashboard'); return; }
      loadStaff('').finally(() => setLoading(false));
    }).catch(() => router.push('/login'));
  }, [router, loadStaff]);

  function onFilter(sid: string) {
    setStoreFilter(sid);
    loadStaff(sid);
  }

  const isHQ = me?.role === 'FRANCHISE_HQ_ADMIN';

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">Staff &amp; Permissions</h1>
        <div className="ml-auto flex items-center gap-2">
          {isHQ && (
            <select className="rounded-md border px-3 py-1.5 text-sm bg-white" value={storeFilter} onChange={e => onFilter(e.target.value)}>
              <option value="">All locations</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button onClick={() => setShowAdd(true)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Add staff</button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading ? <p className="text-sm text-neutral-400">Loading…</p> : (
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                <tr>{['Name', 'Email', 'Role', 'Location', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {staff.map(u => (
                  <tr key={u.id} className={`hover:bg-neutral-50 ${!u.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{u.fullName}</td>
                    <td className="px-4 py-3 text-neutral-500">{u.email}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[u.role] ?? ''}`}>{ROLE_LABEL[u.role] ?? u.role}</span></td>
                    <td className="px-4 py-3 text-neutral-600">{u.storeName ?? <span className="text-violet-600">All locations</span>}</td>
                    <td className="px-4 py-3">
                      {u.active
                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Active</span>
                        : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">Inactive</span>}
                      {u.mustResetPassword && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">temp pw</span>}
                    </td>
                    <td className="px-4 py-3"><button onClick={() => setEditUser(u)} className="text-brand text-xs hover:underline">Manage</button></td>
                  </tr>
                ))}
                {staff.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-400">No staff found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showAdd && perms && (
        <StaffModal mode="create" stores={stores} perms={perms} isHQ={isHQ} myStoreId={me?.storeId ?? null}
          onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); loadStaff(storeFilter); }} />
      )}
      {editUser && perms && (
        <StaffModal mode="edit" user={editUser} stores={stores} perms={perms} isHQ={isHQ} myStoreId={me?.storeId ?? null}
          onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); loadStaff(storeFilter); }} />
      )}
    </div>
  );
}

function StaffModal({ mode, user, stores, perms, isHQ, myStoreId, onClose, onSaved }: {
  mode: 'create' | 'edit'; user?: StaffUser; stores: Store[]; perms: PermCatalog;
  isHQ: boolean; myStoreId: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? '');
  const [roles, setRoles] = useState<{ id: string; name: string; baseRole: string; permissions: string[] }[]>([]);
  const [roleId, setRoleId] = useState('');
  const [storeId, setStoreId] = useState(user?.storeId ?? (isHQ ? '' : myStoreId ?? ''));
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(user?.active ?? true);
  const [customPerms, setCustomPerms] = useState(false);
  const [selectedPerms, setSelectedPerms] = useState<string[]>(user?.permissions ?? []);
  const [resetPw, setResetPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (user && user.permissions.length > 0) setCustomPerms(true); }, [user]);
  useEffect(() => {
    apiFetch<{ id: string; name: string; baseRole: string; permissions: string[]; roleId?: string }[]>('/roles').then(rs => {
      setRoles(rs);
      // Default selection: the user's assigned role, else the role matching their base enum
      const match = (user as unknown as { roleId?: string })?.roleId
        ? rs.find(r => r.id === (user as unknown as { roleId?: string }).roleId)
        : rs.find(r => r.baseRole === (user?.role ?? 'RECEPTION'));
      setRoleId(match?.id ?? rs[0]?.id ?? '');
    }).catch(() => {});
  }, [user]);

  const selectedRole = roles.find(r => r.id === roleId);
  // Effective perms preview = custom selection OR the selected role's permissions
  const shownPerms = customPerms ? selectedPerms : (selectedRole?.permissions ?? []);

  function togglePerm(key: string) {
    setSelectedPerms(p => p.includes(key) ? p.filter(x => x !== key) : [...p, key]);
  }

  async function save() {
    if (!fullName.trim()) { setError('Name required'); return; }
    if (mode === 'create' && (!email.trim() || password.length < 8)) { setError('Email + password (min 8 chars) required'); return; }
    if (!selectedRole) { setError('Select a role'); return; }
    setSaving(true); setError('');
    try {
      const permsToSave = customPerms ? selectedPerms : [];
      const role = selectedRole.baseRole;
      if (mode === 'create') {
        await apiFetch('/staff', { method: 'POST', body: JSON.stringify({
          email, fullName, role, roleId, storeId: storeId || null, password, permissions: permsToSave,
          phone: phone || null, jobTitle: jobTitle || null,
        })});
      } else if (user) {
        await apiFetch(`/staff/${user.id}`, { method: 'PATCH', body: JSON.stringify({
          fullName, role, roleId, storeId: storeId || null, active, permissions: permsToSave,
          phone: phone || null, jobTitle: jobTitle || null,
        })});
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function doResetPw() {
    if (!user || resetPw.length < 8) { setError('New password min 8 chars'); return; }
    await apiFetch(`/staff/${user.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: resetPw }) });
    setResetPw('');
    alert('Password reset.');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 h-full w-[520px] overflow-y-auto bg-white shadow-2xl flex flex-col">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg">{mode === 'create' ? 'Add staff member' : `Manage ${user?.fullName}`}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl">×</button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-4">
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Full name *</label>
            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Email {mode === 'create' && '*'}</label>
            <input className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-neutral-50" type="email"
              value={email} disabled={mode === 'edit'} onChange={e => setEmail(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Phone</label>
              <input className="w-full rounded-lg border px-3 py-2 text-sm" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Job title</label>
              <input className="w-full rounded-lg border px-3 py-2 text-sm" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Senior Groomer" />
            </div>
          </div>

          {mode === 'create' && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Temporary password * (min 8 chars)</label>
              <input className="w-full rounded-lg border px-3 py-2 text-sm" type="text"
                value={password} onChange={e => setPassword(e.target.value)} placeholder="They'll be asked to reset on first login" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Role</label>
              <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white" value={roleId} onChange={e => setRoleId(e.target.value)}>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Location</label>
              <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white disabled:bg-neutral-50"
                value={storeId} disabled={!isHQ} onChange={e => setStoreId(e.target.value)}>
                <option value="">{selectedRole?.baseRole === 'FRANCHISE_HQ_ADMIN' ? 'All locations' : 'Select…'}</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {mode === 'edit' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Active (can log in)
            </label>
          )}

          {/* Permissions */}
          <div className="rounded-xl border p-4">
            <label className="flex items-center gap-2 text-sm font-medium mb-3">
              <input type="checkbox" checked={customPerms} onChange={e => setCustomPerms(e.target.checked)} />
              Custom permissions (otherwise inherits {selectedRole?.name ?? 'role'} defaults)
            </label>
            <div className="space-y-3">
              {perms.catalog.map(g => (
                <div key={g.group}>
                  <p className="text-xs font-semibold text-neutral-400 uppercase mb-1">{g.group}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {g.perms.map(p => (
                      <label key={p.key} className={`flex items-center gap-2 text-xs ${!customPerms ? 'opacity-60' : ''}`}>
                        <input type="checkbox" disabled={!customPerms}
                          checked={shownPerms.includes(p.key)}
                          onChange={() => togglePerm(p.key)} />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reset password (edit only) */}
          {mode === 'edit' && (
            <div className="rounded-xl border p-4">
              <p className="text-sm font-medium mb-2">Reset password</p>
              <div className="flex gap-2">
                <input className="flex-1 rounded-lg border px-3 py-1.5 text-sm" type="text"
                  placeholder="New password (min 8)" value={resetPw} onChange={e => setResetPw(e.target.value)} />
                <button onClick={doResetPw} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50">Reset</button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4 flex gap-2">
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90">
            {saving ? 'Saving…' : mode === 'create' ? 'Create staff' : 'Save changes'}
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2.5 text-sm hover:bg-neutral-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
