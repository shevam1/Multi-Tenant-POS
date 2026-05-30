'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';

interface VaccinationRecord {
  id: string;
  vaccineType: string;
  administeredAt: string | null;
  expiresAt: string | null;
  documentUrl: string | null;
  status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_DATE';
}

const STATUS_STYLES = {
  VALID: 'bg-green-100 text-green-700',
  EXPIRING_SOON: 'bg-amber-100 text-amber-700',
  EXPIRED: 'bg-red-100 text-red-700',
  NO_DATE: 'bg-neutral-100 text-neutral-500',
};
const STATUS_LABEL = {
  VALID: 'Valid',
  EXPIRING_SOON: 'Expiring soon',
  EXPIRED: '⚠ Expired',
  NO_DATE: 'No expiry date',
};

export default function VaccinationTab({ petId }: { petId: string }) {
  const [records, setRecords] = useState<VaccinationRecord[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ vaccineType: '', administeredAt: '', expiresAt: '', documentUrl: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) return;
    apiFetch<VaccinationRecord[]>(`/vaccinations/pet/${petId}`)
      .then(setRecords)
      .finally(() => setLoading(false));
  }, [petId]);

  async function addRecord() {
    const record = await apiFetch<VaccinationRecord>(`/vaccinations/pet/${petId}`, {
      method: 'POST',
      body: JSON.stringify({
        vaccineType: form.vaccineType,
        administeredAt: form.administeredAt || undefined,
        expiresAt: form.expiresAt || undefined,
        documentUrl: form.documentUrl || undefined,
      }),
    });
    setRecords(prev => [...prev, { ...record, status: statusFromExpiry(record.expiresAt) }]);
    setAdding(false);
    setForm({ vaccineType: '', administeredAt: '', expiresAt: '', documentUrl: '' });
  }

  async function remove(id: string) {
    await apiFetch(`/vaccinations/${id}`, { method: 'DELETE' });
    setRecords(prev => prev.filter(r => r.id !== id));
  }

  function statusFromExpiry(expiresAt: string | null): VaccinationRecord['status'] {
    if (!expiresAt) return 'NO_DATE';
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
    if (days < 0) return 'EXPIRED';
    if (days <= 30) return 'EXPIRING_SOON';
    return 'VALID';
  }

  if (loading) return <p className="text-sm text-neutral-400 py-4">Loading vaccination records…</p>;

  return (
    <div className="space-y-3">
      {records.length === 0 && !adding && (
        <p className="text-sm text-neutral-400">No vaccination records on file.</p>
      )}

      {records.map(r => (
        <div key={r.id} className="flex items-start justify-between rounded-lg border px-4 py-3 text-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.vaccineType}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            <div className="mt-0.5 text-neutral-500 space-x-3">
              {r.administeredAt && <span>Administered: {new Date(r.administeredAt).toLocaleDateString('en-CA')}</span>}
              {r.expiresAt && <span>Expires: {new Date(r.expiresAt).toLocaleDateString('en-CA')}</span>}
            </div>
            {r.documentUrl && (
              <a href={r.documentUrl} target="_blank" rel="noreferrer"
                className="mt-0.5 block text-xs text-brand hover:underline">
                View document →
              </a>
            )}
          </div>
          <button onClick={() => remove(r.id)}
            className="text-xs text-red-400 hover:text-red-600 ml-4 mt-0.5">Remove</button>
        </div>
      ))}

      {adding ? (
        <div className="rounded-lg border p-4 space-y-3 bg-neutral-50">
          <p className="text-sm font-medium">Add vaccination record</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Vaccine type *</label>
              <input className="w-full rounded border px-2.5 py-1.5 text-sm"
                placeholder="e.g. Rabies, DHPP, Bordetella"
                value={form.vaccineType}
                onChange={e => setForm(f => ({ ...f, vaccineType: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Document URL</label>
              <input className="w-full rounded border px-2.5 py-1.5 text-sm"
                placeholder="https://…"
                value={form.documentUrl}
                onChange={e => setForm(f => ({ ...f, documentUrl: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Date administered</label>
              <input type="date" className="w-full rounded border px-2.5 py-1.5 text-sm"
                value={form.administeredAt}
                onChange={e => setForm(f => ({ ...f, administeredAt: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Expiry date</label>
              <input type="date" className="w-full rounded border px-2.5 py-1.5 text-sm"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addRecord} disabled={!form.vaccineType}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              Save
            </button>
            <button onClick={() => setAdding(false)} className="rounded-md border px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50">
          + Add vaccination record
        </button>
      )}
    </div>
  );
}
