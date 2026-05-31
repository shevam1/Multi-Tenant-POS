'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Store { id: string; name: string }
interface Settings {
  businessName: string | null; logoUrl: string | null; phone: string | null; website: string | null;
  addressLine: string | null; businessType: string;
  currency: string; dateFormat: string; weightUnit: string; multiCouponMode: string; upcomingApptCount: number;
  serviceFrequencyValue: number; serviceFrequencyUnit: string;
  socialEmail: string | null; socialFacebook: string | null; socialGoogle: string | null; socialYelp: string | null;
}
interface HourRow { weekday: number; isOpen: boolean; openMin: number; closeMin: number }
interface AuthMe { role: string; storeId: string | null; permissions: string[] }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export default function BusinessSettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthMe | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [hoursStore, setHoursStore] = useState('');
  const [hours, setHours] = useState<HourRow[]>([]);
  const [saving, setSaving] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const loadHours = useCallback(async (storeId: string) => {
    if (!storeId) return;
    setHours(await apiFetch<HourRow[]>(`/settings/hours?storeId=${storeId}`));
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(async u => {
      setMe(u);
      if (!u.permissions.includes('settings.manage')) { router.push('/dashboard'); return; }
      const [settings, st] = await Promise.all([
        apiFetch<Settings>('/settings'),
        apiFetch<Store[]>('/customers/stores').catch(() => []),
      ]);
      setS(settings); setStores(st);
      const sid = u.role === 'FRANCHISE_HQ_ADMIN' ? (st[0]?.id ?? '') : (u.storeId ?? '');
      setHoursStore(sid);
      loadHours(sid);
    }).catch(() => router.push('/login'));
  }, [router, loadHours]);

  function set<K extends keyof Settings>(k: K, v: Settings[K]) { setS(prev => prev ? { ...prev, [k]: v } : prev); }

  async function saveSection(section: string, keys: (keyof Settings)[]) {
    if (!s) return;
    setSaving(section);
    const patch: Record<string, unknown> = {};
    keys.forEach(k => { patch[k] = s[k]; });
    await apiFetch('/settings', { method: 'PATCH', body: JSON.stringify(patch) });
    setSaving(''); setSavedMsg(section); setTimeout(() => setSavedMsg(''), 2000);
  }

  async function saveHours() {
    setSaving('hours');
    await apiFetch(`/settings/hours/${hoursStore}`, { method: 'PUT', body: JSON.stringify({ hours }) });
    setSaving(''); setSavedMsg('hours'); setTimeout(() => setSavedMsg(''), 2000);
  }

  if (!s) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;

  const Saved = ({ id }: { id: string }) => savedMsg === id ? <span className="ml-2 text-xs text-green-600">✓ Saved</span> : null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-sm text-neutral-500 hover:text-neutral-700">← Settings</button>
        <h1 className="font-semibold">Business Settings</h1>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        {/* Business Info */}
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">Business Info <Saved id="info" /></h2>
            <button onClick={() => saveSection('info', ['businessName', 'phone', 'website', 'addressLine', 'businessType'])} disabled={saving === 'info'} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Save</button></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Business name *" v={s.businessName} on={v => set('businessName', v)} />
            <Field label="Phone" v={s.phone} on={v => set('phone', v)} />
            <Field label="Website" v={s.website} on={v => set('website', v)} placeholder="www.pawz.ca" />
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Business type</label>
              <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white" value={s.businessType} onChange={e => set('businessType', e.target.value)}>
                {['SALON', 'MOBILE', 'HOME_BASED'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="col-span-2"><Field label="Address" v={s.addressLine} on={v => set('addressLine', v)} /></div>
          </div>
        </section>

        {/* Localization */}
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">Localization &amp; Preferences <Saved id="loc" /></h2>
            <button onClick={() => saveSection('loc', ['currency', 'dateFormat', 'weightUnit', 'multiCouponMode', 'upcomingApptCount', 'serviceFrequencyValue', 'serviceFrequencyUnit'])} disabled={saving === 'loc'} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Save</button></div>
          <div className="grid grid-cols-3 gap-3">
            <Select label="Currency" v={s.currency} on={v => set('currency', v)} opts={[['CAD', 'CAD ($)'], ['USD', 'USD ($)'], ['EUR', 'EUR (€)']]} />
            <Select label="Date format" v={s.dateFormat} on={v => set('dateFormat', v)} opts={[['MM/DD/YYYY', 'MM/DD/YYYY'], ['DD/MM/YYYY', 'DD/MM/YYYY'], ['YYYY-MM-DD', 'YYYY-MM-DD']]} />
            <Select label="Weight unit" v={s.weightUnit} on={v => set('weightUnit', v)} opts={[['KG', 'Kg'], ['LB', 'Lb']]} />
            <Select label="Multiple coupons" v={s.multiCouponMode} on={v => set('multiCouponMode', v)} opts={[['SINGLE', 'One per order'], ['STACK', 'Allow stacking']]} />
            <div><label className="block text-xs text-neutral-500 mb-1">Upcoming appt count</label><input type="number" className="w-full rounded-lg border px-3 py-2 text-sm" value={s.upcomingApptCount} onChange={e => set('upcomingApptCount', Number(e.target.value))} /></div>
            <div><label className="block text-xs text-neutral-500 mb-1">Service frequency</label>
              <div className="flex gap-1">
                <input type="number" className="w-16 rounded-lg border px-2 py-2 text-sm" value={s.serviceFrequencyValue} onChange={e => set('serviceFrequencyValue', Number(e.target.value))} />
                <select className="flex-1 rounded-lg border px-2 py-2 text-sm bg-white" value={s.serviceFrequencyUnit} onChange={e => set('serviceFrequencyUnit', e.target.value)}>
                  <option value="WEEKS">Weeks</option><option value="MONTHS">Months</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Social */}
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">Social Links <Saved id="social" /></h2>
            <button onClick={() => saveSection('social', ['socialEmail', 'socialFacebook', 'socialGoogle', 'socialYelp'])} disabled={saving === 'social'} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Save</button></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" v={s.socialEmail} on={v => set('socialEmail', v)} />
            <Field label="Facebook" v={s.socialFacebook} on={v => set('socialFacebook', v)} />
            <Field label="Google" v={s.socialGoogle} on={v => set('socialGoogle', v)} />
            <Field label="Yelp" v={s.socialYelp} on={v => set('socialYelp', v)} />
          </div>
        </section>

        {/* Business Hours */}
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Business Hours <Saved id="hours" /></h2>
            <div className="flex items-center gap-2">
              {me?.role === 'FRANCHISE_HQ_ADMIN' && stores.length > 1 && (
                <select className="rounded border px-2 py-1.5 text-xs bg-white" value={hoursStore} onChange={e => { setHoursStore(e.target.value); loadHours(e.target.value); }}>
                  {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              )}
              <button onClick={saveHours} disabled={saving === 'hours'} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Save hours</button>
            </div>
          </div>
          <p className="text-xs text-neutral-400 mb-3">Drives which time slots customers can book online and the calendar window.</p>
          <div className="space-y-2">
            {hours.map(h => (
              <div key={h.weekday} className="flex items-center gap-3">
                <span className="w-24 text-sm">{DAYS[h.weekday]}</span>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={h.isOpen} onChange={e => setHours(hs => hs.map(x => x.weekday === h.weekday ? { ...x, isOpen: e.target.checked } : x))} />
                  {h.isOpen ? 'Open' : 'Closed'}
                </label>
                {h.isOpen ? (
                  <div className="flex items-center gap-1 text-sm">
                    <input type="time" className="rounded border px-2 py-1" value={minToTime(h.openMin)} onChange={e => setHours(hs => hs.map(x => x.weekday === h.weekday ? { ...x, openMin: timeToMin(e.target.value) } : x))} />
                    <span className="text-neutral-400">–</span>
                    <input type="time" className="rounded border px-2 py-1" value={minToTime(h.closeMin)} onChange={e => setHours(hs => hs.map(x => x.weekday === h.weekday ? { ...x, closeMin: timeToMin(e.target.value) } : x))} />
                  </div>
                ) : <span className="text-sm text-neutral-300">Closed all day</span>}
              </div>
            ))}
          </div>
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
function Select({ label, v, on, opts }: { label: string; v: string; on: (v: string) => void; opts: [string, string][] }) {
  return (
    <div>
      <label className="block text-xs text-neutral-500 mb-1">{label}</label>
      <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white" value={v} onChange={e => on(e.target.value)}>
        {opts.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </select>
    </div>
  );
}
