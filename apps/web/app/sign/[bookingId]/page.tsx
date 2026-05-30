'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type FieldType = 'text' | 'checkbox' | 'date' | 'signature';
interface FormField { key: string; label: string; type: FieldType; required?: boolean }
interface SignForm { formType: string; title: string; mandatory: boolean; fields: FormField[]; signed: boolean }
interface Session {
  booking: { id: string; petName: string | null; petBreed: string | null; storeName: string; customerName: string; scheduledStart: string };
  forms: SignForm[];
}

/** Canvas-based touch/mouse signature pad. */
function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => { drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { if (drawing.current) { drawing.current = false; onChange(canvas.toDataURL('image/png')); } };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [onChange]);

  function clear() {
    const canvas = ref.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  }

  return (
    <div>
      <canvas ref={ref} width={500} height={150}
        className="w-full rounded-lg border-2 border-dashed bg-white touch-none" style={{ touchAction: 'none' }} />
      <button type="button" onClick={clear} className="mt-1 text-xs text-neutral-400 hover:text-neutral-600">Clear signature</button>
    </div>
  );
}

export default function SignPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [active, setActive] = useState<SignForm | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const s = await apiFetch<Session>(`/public/sign/${bookingId}`).catch(() => null);
    if (s) setSession(s);
    else setError('Booking not found.');
  }

  useEffect(() => { load(); }, [bookingId]);

  function openForm(f: SignForm) {
    setActive(f);
    setValues({});
    setSignature('');
    setError('');
  }

  async function submit() {
    if (!active) return;
    // Validate required fields
    for (const field of active.fields) {
      if (field.required && field.type !== 'signature' && !values[field.key]) {
        setError(`Please complete: ${field.label}`); return;
      }
      if (field.type === 'signature' && field.required && !signature) {
        setError('Please sign before submitting.'); return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`/public/sign/${bookingId}/${active.formType}`, {
        method: 'POST',
        body: JSON.stringify({ signature, payload: values }),
      });
      await load();
      setActive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !session) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!session) return <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">Loading…</div>;

  const allMandatorySigned = session.forms.filter(f => f.mandatory).every(f => f.signed);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4">
        <p className="text-sm font-semibold text-brand">{session.booking.storeName}</p>
        <h1 className="text-lg font-bold">Pre-visit forms</h1>
      </header>

      <main className="mx-auto max-w-lg px-6 py-8">
        {active ? (
          /* ── Single form ── */
          <div className="space-y-5">
            <button onClick={() => setActive(null)} className="text-sm text-neutral-500">← All forms</button>
            <h2 className="text-xl font-bold">{active.title}</h2>
            <div className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
              {active.fields.map(f => (
                <div key={f.key}>
                  {f.type === 'checkbox' ? (
                    <label className="flex items-start gap-3 text-sm">
                      <input type="checkbox" className="mt-0.5 h-4 w-4"
                        checked={!!values[f.key]} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.checked }))} />
                      <span>{f.label}{f.required && ' *'}</span>
                    </label>
                  ) : f.type === 'signature' ? (
                    <div>
                      <label className="block text-sm font-medium mb-1">{f.label}{f.required && ' *'}</label>
                      <SignaturePad onChange={setSignature} />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium mb-1">{f.label}{f.required && ' *'}</label>
                      <input type={f.type === 'date' ? 'date' : 'text'}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        value={(values[f.key] as string) ?? ''}
                        onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <button onClick={submit} disabled={submitting}
              className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Sign & submit'}
            </button>
          </div>
        ) : (
          /* ── Form list ── */
          <div className="space-y-4">
            <div className="rounded-xl border bg-white p-5 shadow-sm text-sm">
              <p className="font-medium">{session.booking.customerName}</p>
              {session.booking.petName && <p className="text-neutral-500">{session.booking.petName} ({session.booking.petBreed ?? 'mixed'})</p>}
              <p className="text-neutral-500 mt-1">
                {new Date(session.booking.scheduledStart).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>

            {allMandatorySigned && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                ✓ All required forms are signed. You&apos;re all set for your appointment!
              </div>
            )}

            {session.forms.map(f => (
              <button key={f.formType} onClick={() => openForm(f)}
                className="flex w-full items-center justify-between rounded-xl border bg-white p-4 text-left shadow-sm hover:shadow-md transition">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{f.title}</span>
                    {f.mandatory && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Required</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">{f.fields.length} field{f.fields.length !== 1 ? 's' : ''}</p>
                </div>
                {f.signed
                  ? <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">✓ Signed</span>
                  : <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-500">Sign →</span>}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
