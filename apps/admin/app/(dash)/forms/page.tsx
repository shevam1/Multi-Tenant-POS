'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

type FieldType = 'text' | 'checkbox' | 'date' | 'signature';

interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

interface EffectiveForm {
  formType: string;
  title: string;
  mandatory: boolean;
  fields: FormField[];
  source: 'MODULE' | 'CUSTOM';
}

const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text input', icon: '✎' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑' },
  { type: 'date', label: 'Date picker', icon: '📅' },
  { type: 'signature', label: 'Signature', icon: '✍' },
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${Date.now()}`;
}

export default function FormBuilderPage() {
  const router = useRouter();
  const [forms, setForms] = useState<EffectiveForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ formType: string; title: string; mandatory: boolean; fields: FormField[] } | null>(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const data = await apiFetch<EffectiveForm[]>('/forms/effective');
    setForms(data);
  }

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    refresh().finally(() => setLoading(false));
  }, [router]);

  function newForm() {
    setEditing({ formType: '', title: '', mandatory: false, fields: [] });
  }

  function editForm(f: EffectiveForm) {
    setEditing({ formType: f.formType, title: f.title, mandatory: f.mandatory, fields: [...f.fields] });
  }

  function addField(type: FieldType) {
    if (!editing) return;
    const label = type === 'signature' ? 'Signature' : type === 'checkbox' ? 'I agree to…' : 'New field';
    setEditing({ ...editing, fields: [...editing.fields, { key: slugify(label + editing.fields.length), label, type, required: type === 'signature' }] });
  }

  function updateField(i: number, patch: Partial<FormField>) {
    if (!editing) return;
    const fields = [...editing.fields];
    fields[i] = { ...fields[i], ...patch };
    if (patch.label) fields[i].key = slugify(patch.label);
    setEditing({ ...editing, fields });
  }

  function removeField(i: number) {
    if (!editing) return;
    setEditing({ ...editing, fields: editing.fields.filter((_, idx) => idx !== i) });
  }

  function moveField(i: number, dir: -1 | 1) {
    if (!editing) return;
    const j = i + dir;
    if (j < 0 || j >= editing.fields.length) return;
    const fields = [...editing.fields];
    [fields[i], fields[j]] = [fields[j], fields[i]];
    setEditing({ ...editing, fields });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await apiFetch('/forms/templates', {
        method: 'POST',
        body: JSON.stringify({
          formType: editing.formType || slugify(editing.title).toUpperCase(),
          title: editing.title,
          mandatory: editing.mandatory,
          fields: editing.fields,
        }),
      });
      await refresh();
      setEditing(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;

  return (
    <div>
      <main className="mx-auto max-w-3xl px-8 py-8">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Intake &amp; Consent Form Builder</h1>
          {!editing && (
            <button onClick={newForm} className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">+ New form</button>
          )}
        </div>
        {editing ? (
          /* ── Builder ── */
          <div className="space-y-5">
            <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Form title *</label>
                <input className="w-full rounded border px-3 py-2 text-sm" placeholder="e.g. Senior Pet Liability Waiver"
                  value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.mandatory}
                  onChange={e => setEditing({ ...editing, mandatory: e.target.checked })} />
                Mandatory — booking cannot be confirmed until this is signed
              </label>
            </div>

            {/* Field palette */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-neutral-500 uppercase mb-2">Add field</p>
              <div className="flex gap-2">
                {FIELD_TYPES.map(ft => (
                  <button key={ft.type} onClick={() => addField(ft.type)}
                    className="flex-1 rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50 hover:border-brand/40 transition">
                    <span className="mr-1">{ft.icon}</span>{ft.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Field list */}
            <div className="space-y-2">
              {editing.fields.length === 0 && (
                <p className="text-center text-sm text-neutral-400 py-6 border-2 border-dashed rounded-xl">
                  Add fields from the palette above
                </p>
              )}
              {editing.fields.map((f, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl border bg-white p-3 shadow-sm">
                  <div className="flex flex-col pt-1">
                    <button onClick={() => moveField(i, -1)} className="text-xs text-neutral-300 hover:text-neutral-600">▲</button>
                    <button onClick={() => moveField(i, 1)} className="text-xs text-neutral-300 hover:text-neutral-600">▼</button>
                  </div>
                  <span className="mt-1.5 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{f.type}</span>
                  <div className="flex-1">
                    <input className="w-full rounded border px-2.5 py-1.5 text-sm"
                      value={f.label} onChange={e => updateField(i, { label: e.target.value })} />
                    {f.type !== 'signature' && (
                      <label className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
                        <input type="checkbox" checked={!!f.required} onChange={e => updateField(i, { required: e.target.checked })} />
                        Required
                      </label>
                    )}
                  </div>
                  <button onClick={() => removeField(i)} className="text-xs text-red-400 hover:text-red-600 mt-1.5">✕</button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={save} disabled={!editing.title || editing.fields.length === 0 || saving}
                className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save form'}
              </button>
              <button onClick={() => setEditing(null)} className="rounded-md border px-5 py-2 text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          /* ── List ── */
          <div className="space-y-3">
            {forms.map(f => (
              <div key={f.formType} className="flex items-start justify-between rounded-xl border bg-white p-5 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{f.title}</span>
                    {f.mandatory && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Mandatory</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs ${f.source === 'MODULE' ? 'bg-neutral-100 text-neutral-500' : 'bg-brand/10 text-brand'}`}>
                      {f.source === 'MODULE' ? 'Default' : 'Custom'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {f.fields.length} field{f.fields.length !== 1 ? 's' : ''}: {f.fields.map(fl => fl.label).join(', ')}
                  </p>
                </div>
                <button onClick={() => editForm(f)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50">
                  {f.source === 'MODULE' ? 'Customize' : 'Edit'}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
