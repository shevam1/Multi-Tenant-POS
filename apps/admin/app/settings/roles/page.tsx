'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface PermCatalog { catalog: { group: string; perms: { key: string; label: string }[] }[]; all: string[] }
interface Role {
  id: string; key: string; name: string; baseRole: string; permissions: string[];
  loginEnabled: boolean; isSystem: boolean; _count: { users: number };
}
interface AuthMe { permissions: string[] }

const BASE_ROLES = ['FRANCHISE_HQ_ADMIN', 'STORE_MANAGER', 'RECEPTION', 'GROOMER', 'CALL_CENTER_AGENT'];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-teal-500' : 'bg-neutral-300'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

export default function RolesPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<PermCatalog | null>(null);
  const [editing, setEditing] = useState<Role | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setRoles(await apiFetch<Role[]>('/roles'));
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(u => {
      if (!u.permissions.includes('staff.manage')) { router.push('/dashboard'); return; }
      apiFetch<PermCatalog>('/staff/permissions').then(setPerms);
      load();
    }).catch(() => router.push('/login'));
  }, [router, load]);

  async function del(r: Role) {
    if (!confirm(`Delete role "${r.name}"?`)) return;
    try { await apiFetch(`/roles/${r.id}`, { method: 'DELETE' }); load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Delete failed'); }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-sm text-neutral-500 hover:text-neutral-700">← Settings</button>
        <h1 className="font-semibold">Roles &amp; Permissions</h1>
        <button onClick={() => setShowAdd(true)} className="ml-auto rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Add role</button>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase text-neutral-500 tracking-wide">
              <tr>{['Role', 'Based on', 'Permissions', 'Staff', 'Login', ''].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {roles.map(r => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <span className="font-medium">{r.name}</span>
                    {r.isSystem && <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">system</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{r.baseRole.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-neutral-500">{r.permissions.length} granted</td>
                  <td className="px-4 py-3 text-neutral-500">{r._count.users}</td>
                  <td className="px-4 py-3"><Toggle on={r.loginEnabled} onChange={v => apiFetch(`/roles/${r.id}`, { method: 'PATCH', body: JSON.stringify({ loginEnabled: v }) }).then(load)} /></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setEditing(r)} className="text-brand text-xs hover:underline mr-2">Permissions</button>
                    {!r.isSystem && <button onClick={() => del(r)} className="text-red-500 text-xs hover:underline">✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-neutral-400">System roles back the access guards; custom roles inherit a base role for security checks. Disabling login blocks all users in that role.</p>
      </main>

      {(showAdd || editing) && perms && (
        <RoleModal role={editing} perms={perms} onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); load(); }} />
      )}
    </div>
  );
}

function RoleModal({ role, perms, onClose, onSaved }: { role: Role | null; perms: PermCatalog; onClose: () => void; onSaved: () => void }) {
  const editing = !!role;
  const [name, setName] = useState(role?.name ?? '');
  const [baseRole, setBaseRole] = useState(role?.baseRole ?? 'GROOMER');
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const [loginEnabled, setLoginEnabled] = useState(role?.loginEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggle(key: string) { setSelected(s => s.includes(key) ? s.filter(x => x !== key) : [...s, key]); }

  async function save() {
    if (!name.trim()) { setError('Name required'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await apiFetch(`/roles/${role.id}`, { method: 'PATCH', body: JSON.stringify({ name, permissions: selected, loginEnabled }) });
      } else {
        await apiFetch('/roles', { method: 'POST', body: JSON.stringify({ name, baseRole, permissions: selected, loginEnabled }) });
      }
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between"><h2 className="font-bold text-lg">{editing ? `Edit ${role.name}` : 'New role'}</h2><button onClick={onClose} className="text-neutral-400 text-xl">×</button></div>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-neutral-500 mb-1">Role name *</label>
            <input className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-neutral-50" value={name} disabled={role?.isSystem} onChange={e => setName(e.target.value)} placeholder="e.g. Senior Groomer" /></div>
          <div><label className="block text-xs text-neutral-500 mb-1">Based on (security tier)</label>
            <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white disabled:bg-neutral-50" value={baseRole} disabled={editing} onChange={e => setBaseRole(e.target.value)}>
              {BASE_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={loginEnabled} onChange={e => setLoginEnabled(e.target.checked)} /> Login enabled for this role</label>
        <div className="rounded-xl border p-3 space-y-3">
          <p className="text-xs font-semibold text-neutral-400 uppercase">Permissions</p>
          {perms.catalog.map(g => (
            <div key={g.group}>
              <p className="text-xs font-medium text-neutral-500 mb-1">{g.group}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.perms.map(p => (
                  <label key={p.key} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={selected.includes(p.key)} onChange={() => toggle(p.key)} />{p.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : editing ? 'Save' : 'Create role'}</button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
