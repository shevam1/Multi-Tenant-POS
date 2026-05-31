'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Option {
  id: string; category: string; label: string; sortOrder: number;
  parentId: string | null; minValue: number | null; maxValue: number | null; required: boolean;
}
type Grouped = Record<string, Option[]>;
interface AuthMe { permissions: string[] }

const TABS: [string, string][] = [
  ['PET_TYPE', 'Pet Type'], ['BEHAVIOR', 'Behavior'], ['HAIR', 'Pet Hair'], ['WEIGHT', 'Weight Range'],
  ['FIXED', 'Fixed'], ['VACCINE', 'Vaccine'], ['COAT_COLOR', 'Coat Color'], ['PET_TAG', 'Pet Tags'],
];

export default function PetOptionsPage() {
  const router = useRouter();
  const [data, setData] = useState<Grouped>({});
  const [tab, setTab] = useState('PET_TYPE');
  const [unit, setUnit] = useState('KG');
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [breedsFor, setBreedsFor] = useState<Option | null>(null);

  const load = useCallback(async () => {
    const d = await apiFetch<Grouped>('/pet-options');
    setData(d);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(async me => {
      setCanEdit(me.permissions.includes('settings.manage'));
      await Promise.all([
        load(),
        apiFetch<{ weightUnit: string }>('/settings').then(s => setUnit(s.weightUnit)).catch(() => {}),
      ]);
      setLoading(false);
    }).catch(() => router.push('/login'));
  }, [router, load]);

  const rows = (data[tab] ?? []).filter(o => !o.parentId || tab !== 'PET_TYPE');

  async function add(payload: Record<string, unknown>) {
    await apiFetch('/pet-options', { method: 'POST', body: JSON.stringify({ category: tab, ...payload }) });
    load();
  }
  async function patch(id: string, body: Record<string, unknown>) {
    await apiFetch(`/pet-options/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    load();
  }
  async function del(o: Option) {
    if (!confirm(`Delete "${o.label}"?`)) return;
    try { await apiFetch(`/pet-options/${o.id}`, { method: 'DELETE' }); load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Delete failed'); }
  }
  async function move(list: Option[], index: number, dir: -1 | 1) {
    const next = [...list]; const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setData(d => ({ ...d, [tab]: next.concat((data[tab] ?? []).filter(o => o.parentId)) }));
    await apiFetch('/pet-options/reorder', { method: 'PUT', body: JSON.stringify({ category: tab, orderedIds: next.map(o => o.id) }) }).catch(load);
  }

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/settings')} className="text-sm text-neutral-500 hover:text-neutral-700">← Settings</button>
        <h1 className="font-semibold">Pet Options</h1>
        {!canEdit && <span className="text-xs text-neutral-400">Read-only</span>}
      </header>

      {/* Tabs */}
      <div className="border-b bg-white px-6 overflow-x-auto">
        <div className="flex gap-1">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${tab === key ? 'border-amber-400 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>
              {label} <span className="text-xs text-neutral-400">{(data[key] ?? []).filter(o => !o.parentId).length}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-6 py-6 space-y-4">
        {tab === 'VACCINE' && <VaccineAlertBanner data={data} />}

        <div className="rounded-xl border bg-white shadow-sm divide-y">
          {rows.map((o, i) => (
            <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex flex-col">
                <button disabled={!canEdit || i === 0} onClick={() => move(rows, i, -1)} className="text-neutral-300 hover:text-neutral-600 disabled:opacity-30 text-xs leading-none">▲</button>
                <button disabled={!canEdit || i === rows.length - 1} onClick={() => move(rows, i, 1)} className="text-neutral-300 hover:text-neutral-600 disabled:opacity-30 text-xs leading-none">▼</button>
              </div>
              <span className="flex-1 text-sm">{o.label}</span>

              {tab === 'WEIGHT' && (
                <span className="text-xs text-neutral-500">{o.minValue ?? 0} – {o.maxValue ?? '∞'} {unit === 'KG' ? 'Kg' : 'Lb'}</span>
              )}
              {tab === 'VACCINE' && (
                <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <input type="checkbox" disabled={!canEdit} checked={o.required} onChange={e => patch(o.id, { required: e.target.checked })} /> Required
                </label>
              )}
              {tab === 'PET_TYPE' && (
                <button onClick={() => setBreedsFor(o)} className="rounded-md border px-2.5 py-1 text-xs hover:bg-neutral-50">
                  Breeds <span className="text-neutral-400">{(data.BREED ?? []).filter(b => b.parentId === o.id).length}</span>
                </button>
              )}
              {canEdit && <button onClick={() => del(o)} className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50">✕</button>}
            </div>
          ))}
          {rows.length === 0 && <p className="px-4 py-3 text-sm text-neutral-400">None yet.</p>}
        </div>

        {canEdit && (tab === 'WEIGHT' ? <AddWeight unit={unit} onAdd={add} /> : <AddSimple key={tab} onAdd={label => add({ label })} />)}
      </main>

      {breedsFor && (
        <BreedsModal type={breedsFor} breeds={(data.BREED ?? []).filter(b => b.parentId === breedsFor.id)}
          canEdit={canEdit} onClose={() => setBreedsFor(null)} onChange={load} />
      )}
    </div>
  );
}

function AddSimple({ onAdd }: { onAdd: (label: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV(''); } }}>
      <input className="flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="Add new option…" value={v} onChange={e => setV(e.target.value)} />
      <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!v.trim()}>+ Add</button>
    </form>
  );
}

function AddWeight({ unit, onAdd }: { unit: string; onAdd: (p: Record<string, unknown>) => void }) {
  const [label, setLabel] = useState(''); const [min, setMin] = useState(''); const [max, setMax] = useState('');
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3" onSubmit={e => {
      e.preventDefault();
      if (!label.trim()) return;
      onAdd({ label: label.trim(), minValue: min ? Number(min) : null, maxValue: max ? Number(max) : null });
      setLabel(''); setMin(''); setMax('');
    }}>
      <div className="flex-1 min-w-[140px]"><label className="block text-xs text-neutral-500 mb-1">Name</label>
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="e.g. Toy" value={label} onChange={e => setLabel(e.target.value)} /></div>
      <div><label className="block text-xs text-neutral-500 mb-1">Min ({unit === 'KG' ? 'Kg' : 'Lb'})</label>
        <input type="number" step="0.1" className="w-24 rounded-lg border px-3 py-2 text-sm" value={min} onChange={e => setMin(e.target.value)} /></div>
      <div><label className="block text-xs text-neutral-500 mb-1">Max ({unit === 'KG' ? 'Kg' : 'Lb'})</label>
        <input type="number" step="0.1" className="w-24 rounded-lg border px-3 py-2 text-sm" value={max} onChange={e => setMax(e.target.value)} /></div>
      <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!label.trim()}>+ Add</button>
    </form>
  );
}

function VaccineAlertBanner({ data }: { data: Grouped }) {
  const required = (data.VACCINE ?? []).filter(v => v.required).map(v => v.label);
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${required.length ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-neutral-50 border-neutral-200 text-neutral-500'}`}>
      {required.length
        ? <>Vaccine alert <b>active</b>: booking a pet with missing/expired {required.join(', ')} flags a validation alert on the calendar.</>
        : <>Required Vaccinations: <b>Not set</b>. Toggle “Required” on one or more vaccines to enable the booking alert engine.</>}
    </div>
  );
}

function BreedsModal({ type, breeds, canEdit, onClose, onChange }: {
  type: Option; breeds: Option[]; canEdit: boolean; onClose: () => void; onChange: () => void;
}) {
  const [v, setV] = useState('');
  async function add() {
    if (!v.trim()) return;
    await apiFetch('/pet-options', { method: 'POST', body: JSON.stringify({ category: 'BREED', label: v.trim(), parentId: type.id }) });
    setV(''); onChange();
  }
  async function del(b: Option) {
    try { await apiFetch(`/pet-options/${b.id}`, { method: 'DELETE' }); onChange(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Delete failed'); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{type.label} breeds</h2>
          <button onClick={onClose} className="text-neutral-400 text-xl">×</button>
        </div>
        <div className="rounded-xl border divide-y">
          {breeds.map(b => (
            <div key={b.id} className="flex items-center px-3 py-2 text-sm">
              <span className="flex-1">{b.label}</span>
              {canEdit && <button onClick={() => del(b)} className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-500 hover:bg-red-50">✕</button>}
            </div>
          ))}
          {breeds.length === 0 && <p className="px-3 py-2 text-sm text-neutral-400">No breeds yet.</p>}
        </div>
        {canEdit && (
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); add(); }}>
            <input className="flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="Add breed…" value={v} onChange={e => setV(e.target.value)} />
            <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!v.trim()}>+ Add</button>
          </form>
        )}
      </div>
    </div>
  );
}
