'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Me {
  userId: string; email: string; fullName: string; role: string; roleName: string;
  storeName: string | null;
  phone: string | null; jobTitle: string | null; bio: string | null; avatarUrl: string | null;
  notifyEmail: boolean; notifySms: boolean;
}

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [saving, setSaving] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  // password fields
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwOk, setPwOk] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<Me>('/auth/me').then(setMe).catch(() => router.push('/login'));
  }, [router]);

  function set<K extends keyof Me>(k: K, v: Me[K]) { setMe(prev => prev ? { ...prev, [k]: v } : prev); }

  async function saveProfile() {
    if (!me) return;
    setSaving('profile');
    const updated = await apiFetch<Me>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: me.fullName, email: me.email, phone: me.phone,
        jobTitle: me.jobTitle, bio: me.bio, avatarUrl: me.avatarUrl,
        notifyEmail: me.notifyEmail, notifySms: me.notifySms,
      }),
    }).catch(e => { alert(e instanceof Error ? e.message : 'Save failed'); return null; });
    if (updated) setMe(updated);
    setSaving(''); setSavedMsg('profile'); setTimeout(() => setSavedMsg(''), 2000);
  }

  async function changePassword() {
    setPwError(''); setPwOk(false);
    if (pw.newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (pw.newPassword !== pw.confirm) { setPwError('Passwords do not match'); return; }
    setSaving('password');
    try {
      await apiFetch('/auth/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }) });
      setPw({ currentPassword: '', newPassword: '', confirm: '' }); setPwOk(true);
    } catch (e) { setPwError(e instanceof Error ? e.message : 'Change failed'); }
    finally { setSaving(''); }
  }

  if (!me) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;

  const Saved = ({ id }: { id: string }) => savedMsg === id ? <span className="ml-2 text-xs text-green-600">✓ Saved</span> : null;

  return (
    <div>
      <main className="mx-auto max-w-3xl px-8 py-8 space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">My Account</h1>
        {/* Identity summary */}
        <section className="rounded-xl border bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-xl font-bold text-brand">
            {me.fullName.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <p className="font-semibold">{me.fullName}</p>
            <p className="text-xs text-neutral-500">{me.roleName}{me.storeName ? ` · ${me.storeName}` : ''}</p>
          </div>
        </section>

        {/* Profile */}
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Profile <Saved id="profile" /></h2>
            <button onClick={saveProfile} disabled={saving === 'profile'} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Save</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name *" v={me.fullName} on={v => set('fullName', v)} />
            <Field label="Email *" v={me.email} on={v => set('email', v)} />
            <Field label="Phone" v={me.phone} on={v => set('phone', v)} />
            <Field label="Job title" v={me.jobTitle} on={v => set('jobTitle', v)} placeholder="e.g. Senior Groomer" />
            <div className="col-span-2">
              <label className="block text-xs text-neutral-500 mb-1">Bio</label>
              <textarea rows={2} className="w-full rounded-lg border px-3 py-2 text-sm resize-none" value={me.bio ?? ''} onChange={e => set('bio', e.target.value)} placeholder="Short bio shown on your profile" />
            </div>
            <div className="col-span-2"><Field label="Avatar URL" v={me.avatarUrl} on={v => set('avatarUrl', v)} placeholder="https://…" /></div>
          </div>
          <div className="mt-4 border-t pt-4">
            <p className="text-xs font-semibold uppercase text-neutral-400 mb-2">Notifications</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={me.notifyEmail} onChange={e => set('notifyEmail', e.target.checked)} /> Email notifications</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={me.notifySms} onChange={e => set('notifySms', e.target.checked)} /> SMS notifications</label>
            </div>
          </div>
        </section>

        {/* Password */}
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold mb-1">Change Password</h2>
          <p className="text-xs text-neutral-400 mb-4">Enter your current password, then a new one (min 8 characters).</p>
          {pwError && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{pwError}</p>}
          {pwOk && <p className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-600">✓ Password updated</p>}
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-neutral-500 mb-1">Current</label>
              <input type="password" className="w-full rounded-lg border px-3 py-2 text-sm" value={pw.currentPassword} onChange={e => setPw(p => ({ ...p, currentPassword: e.target.value }))} /></div>
            <div><label className="block text-xs text-neutral-500 mb-1">New</label>
              <input type="password" className="w-full rounded-lg border px-3 py-2 text-sm" value={pw.newPassword} onChange={e => setPw(p => ({ ...p, newPassword: e.target.value }))} /></div>
            <div><label className="block text-xs text-neutral-500 mb-1">Confirm new</label>
              <input type="password" className="w-full rounded-lg border px-3 py-2 text-sm" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} /></div>
          </div>
          <button onClick={changePassword} disabled={saving === 'password' || !pw.currentPassword || !pw.newPassword} className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving === 'password' ? 'Updating…' : 'Update password'}
          </button>
        </section>
      </main>
    </div>
  );
}

function Field({ label, v, on, placeholder }: { label: string; v: string | null; on: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-neutral-500 mb-1">{label}</label>
      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={v ?? ''} placeholder={placeholder} onChange={e => on(e.target.value)} />
    </div>
  );
}
