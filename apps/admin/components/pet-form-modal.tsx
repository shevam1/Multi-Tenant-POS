'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  weightKg: number | null;
  hairLength: string | null;
  isFixed: boolean;
  tags: string[];
  allergies: string | null;
  medicalNotes: string | null;
  groomNotes: string | null;
}

interface Props {
  customerId: string;
  pet: Pet | null;
  onClose: () => void;
  onSaved: () => void;
}

const SPECIES = ['DOG', 'CAT', 'RABBIT', 'BIRD', 'OTHER'];

export default function PetFormModal({ customerId, pet, onClose, onSaved }: Props) {
  const editing = !!pet;
  const [form, setForm] = useState({
    name: pet?.name ?? '',
    species: pet?.species ?? 'DOG',
    breed: pet?.breed ?? '',
    dateOfBirth: pet?.dateOfBirth ? pet.dateOfBirth.slice(0, 10) : '',
    gender: pet?.gender ?? '',
    weightKg: pet?.weightKg ? String(pet.weightKg) : '',
    hairLength: pet?.hairLength ?? '',
    isFixed: pet?.isFixed ?? false,
    allergies: pet?.allergies ?? '',
    medicalNotes: pet?.medicalNotes ?? '',
    groomNotes: pet?.groomNotes ?? '',
    tags: pet?.tags ?? [],
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  function addTag() {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }));
    setTagInput('');
  }

  async function save() {
    if (!form.name.trim()) { setError('Pet name is required'); return; }
    setSaving(true); setError('');
    try {
      const body = JSON.stringify({
        name: form.name.trim(),
        species: form.species,
        breed: form.breed || null,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        weightKg: form.weightKg ? parseFloat(form.weightKg) : null,
        hairLength: form.hairLength || null,
        isFixed: form.isFixed,
        allergies: form.allergies || null,
        medicalNotes: form.medicalNotes || null,
        groomNotes: form.groomNotes || null,
        tags: form.tags,
      });
      if (editing) {
        await apiFetch(`/customers/${customerId}/pets/${pet.id}`, { method: 'PATCH', body });
      } else {
        await apiFetch(`/customers/${customerId}/pets`, { method: 'POST', body });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 h-full w-[480px] overflow-y-auto bg-white shadow-2xl flex flex-col">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg">{editing ? `Edit ${pet.name}` : 'Add Pet'}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl">×</button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-4">
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Pet name *</label>
            <input className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Buddy" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Species</label>
              <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                value={form.species} onChange={e => set('species', e.target.value)}>
                {SPECIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Breed</label>
              <input className="w-full rounded-lg border px-3 py-2 text-sm"
                value={form.breed} onChange={e => set('breed', e.target.value)} placeholder="e.g. Golden Retriever" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Date of birth</label>
              <input type="date" className="w-full rounded-lg border px-3 py-2 text-sm"
                value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Gender</label>
              <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">Unknown</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Weight (kg)</label>
              <input type="number" step="0.1" min="0" className="w-full rounded-lg border px-3 py-2 text-sm"
                value={form.weightKg} onChange={e => set('weightKg', e.target.value)} placeholder="e.g. 12.5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Hair length</label>
              <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                value={form.hairLength} onChange={e => set('hairLength', e.target.value)}>
                <option value="">N/A</option>
                <option value="SHORT">Short</option>
                <option value="MEDIUM">Medium</option>
                <option value="LONG">Long</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <label className="text-xs font-medium text-neutral-500">Fixed (spayed/neutered)</label>
              <input type="checkbox" className="h-4 w-4 rounded"
                checked={form.isFixed} onChange={e => set('isFixed', e.target.checked)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Behavior tags</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {form.tags.map(t => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                  {t}
                  <button onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))} className="hover:text-red-900">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
                placeholder="e.g. Aggressive, Anxious" value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} />
              <button onClick={addTag} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50">+ Add</button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Allergies</label>
            <input className="w-full rounded-lg border px-3 py-2 text-sm"
              value={form.allergies} onChange={e => set('allergies', e.target.value)} placeholder="e.g. Lavender shampoo" />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Medical notes</label>
            <textarea rows={2} className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
              value={form.medicalNotes} onChange={e => set('medicalNotes', e.target.value)}
              placeholder="e.g. Senior pet — extra care required" />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Groom notes (style, blade, products)</label>
            <textarea rows={3} className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
              value={form.groomNotes} onChange={e => set('groomNotes', e.target.value)}
              placeholder="e.g. #7 blade, teddy bear cut, Bio-Groom shampoo" />
          </div>
        </div>

        <div className="border-t px-6 py-4 flex gap-2">
          <button onClick={save} disabled={saving}
            className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add pet'}
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg border py-2.5 text-sm hover:bg-neutral-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}
