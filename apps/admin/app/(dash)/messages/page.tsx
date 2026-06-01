'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface ThreadCustomer { id: string; fullName: string; phone: string | null; email: string | null; tags: string[]; statementCreditCents?: number }
interface Thread {
  id: string; status: string; unread: boolean; lastMessageAt: string | null; lastMessagePreview: string | null;
  customer: ThreadCustomer;
}
interface Message {
  id: string; channel: string; direction: string; body: string; attachments: string[];
  status: string; scheduledFor: string | null; createdAt: string;
}
interface FullThread extends Thread { messages: Message[] }
interface CustomerOpt { id: string; fullName: string; phone: string | null }

const FILTERS = [['open', 'Open'], ['closed', 'Closed'], ['unread', 'Unread'], ['scheduled', 'Scheduled']] as const;

function initials(n: string) { return n.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase() || '?'; }
const COLORS = ['bg-emerald-400', 'bg-amber-400', 'bg-sky-400', 'bg-violet-400', 'bg-pink-400', 'bg-teal-400'];
const color = (id: string) => COLORS[id.charCodeAt(0) % COLORS.length];

export default function MessagesPage() {
  const [filter, setFilter] = useState('open');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<FullThread | null>(null);
  const [channel, setChannel] = useState<'SMS' | 'EMAIL'>('SMS');
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [scheduleFor, setScheduleFor] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [picker, setPicker] = useState<CustomerOpt[]>([]);
  const [pickerQ, setPickerQ] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [signature, setSignature] = useState('');
  const [templates, setTemplates] = useState<{ id: string; name: string; channel: string; subject: string | null; body: string }[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [manageTemplates, setManageTemplates] = useState(false);
  const [agreementModal, setAgreementModal] = useState(false);
  const [receiptModal, setReceiptModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const loadThreads = useCallback(async (f: string) => {
    const t = await apiFetch<Thread[]>(`/messages/threads?filter=${f}`).catch(() => []);
    setThreads(t);
  }, []);

  useEffect(() => { loadThreads(filter).finally(() => setLoading(false)); }, [filter, loadThreads]);

  const loadTemplates = useCallback(() => {
    apiFetch<typeof templates>('/messages/templates').then(setTemplates).catch(() => {});
  }, []);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  function applyTemplate(t: { channel: string; subject: string | null; body: string }) {
    if (t.channel === 'EMAIL') { setChannel('EMAIL'); if (t.subject) setSubject(t.subject); }
    else setChannel('SMS');
    setDraft(t.body);
    setShowTemplates(false);
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [active?.messages.length]);

  async function openThread(id: string) {
    const t = await apiFetch<FullThread>(`/messages/threads/${id}`);
    setActive(t);
    if (t.unread) { apiFetch(`/messages/threads/${id}/read`, { method: 'PATCH' }); loadThreads(filter); }
  }

  async function send() {
    if (!active || (!draft.trim() && attachments.length === 0)) return;
    setSending(true);
    try {
      const body = channel === 'EMAIL' && signature ? `${draft}\n\n${signature}` : draft;
      await apiFetch(`/messages/threads/${active.id}/send`, {
        method: 'POST',
        body: JSON.stringify({
          channel, body: body || '(photo)', attachments, scheduledFor: scheduleFor || null,
          ...(channel === 'EMAIL' ? { subject: subject || 'Message from your groomer', cc, bcc } : {}),
        }),
      });
      setDraft(''); setAttachments([]); setScheduleFor(''); setSubject(''); setCc(''); setBcc('');
      openThread(active.id); loadThreads(filter);
    } catch (e) { alert(e instanceof Error ? e.message : 'Send failed'); }
    finally { setSending(false); }
  }

  function shareBookOnline() {
    const webBase = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';
    setDraft(d => `${d ? d + '\n' : ''}Book your next appointment: ${webBase}/book?tenant=pawsome`);
  }

  async function addCardLink() {
    if (!active) return;
    const res = await apiFetch<{ url: string | null }>(`/pos/customers/${active.customer.id}/add-card-link`, { method: 'POST' }).catch(() => null);
    if (res?.url) setDraft(d => `${d ? d + '\n' : ''}Add your payment card securely: ${res.url}`);
    else alert('Stripe not configured — set STRIPE_SECRET_KEY.');
  }

  function onPhoto(file: File) {
    if (file.size > 1_500_000) { alert('Image too large (max 1.5 MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => setAttachments(a => [...a, reader.result as string]);
    reader.readAsDataURL(file);
  }

  async function searchPicker(q: string) {
    setPickerQ(q);
    if (q.length < 2) { setPicker([]); return; }
    const res = await apiFetch<CustomerOpt[]>(`/customers?q=${encodeURIComponent(q)}`).catch(() => []);
    setPicker(Array.isArray(res) ? res : []);
  }
  async function startChat(customerId: string) {
    const t = await apiFetch<{ id: string }>('/messages/threads', { method: 'POST', body: JSON.stringify({ customerId }) });
    setShowPicker(false); setPickerQ(''); setPicker([]);
    await loadThreads(filter);
    openThread(t.id);
  }

  async function simulateReply() {
    if (!active) return;
    await apiFetch(`/messages/threads/${active.id}/simulate-inbound`, { method: 'POST', body: JSON.stringify({ body: 'Sounds good, thank you!' }) });
    openThread(active.id);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-background">
      {/* ── Thread list ── */}
      <aside className="flex w-80 shrink-0 flex-col border-r bg-white">
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <button onClick={() => setShowPicker(s => !s)} className="w-full rounded-lg border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-secondary">
              Click to start new chat ▾
            </button>
            {showPicker && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white p-2 shadow-xl">
                <input autoFocus className="mb-2 w-full rounded border px-2 py-1.5 text-sm" placeholder="Search client or pet…"
                  value={pickerQ} onChange={e => searchPicker(e.target.value)} />
                <div className="max-h-56 overflow-y-auto">
                  {picker.map(c => (
                    <button key={c.id} onClick={() => startChat(c.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-secondary">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs text-white ${color(c.id)}`}>{initials(c.fullName)}</span>
                      <span>{c.fullName}<span className="block text-xs text-muted-foreground">{c.phone}</span></span>
                    </button>
                  ))}
                  {pickerQ.length >= 2 && picker.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No matches.</p>}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-1">
            {FILTERS.map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium ${filter === f ? 'bg-amber-accent text-neutral-900' : 'bg-secondary text-muted-foreground hover:bg-neutral-200'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> :
            threads.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No conversations.</p> :
            threads.map(t => (
              <button key={t.id} onClick={() => openThread(t.id)}
                className={`flex w-full items-start gap-3 border-b px-3 py-3 text-left hover:bg-secondary ${active?.id === t.id ? 'bg-amber-accent/10' : ''}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm text-white ${color(t.customer.id)}`}>{initials(t.customer.fullName)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-medium">{t.customer.fullName}</span>
                    {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{t.lastMessagePreview ?? 'No messages yet'}</p>
                  {t.lastMessageAt && <p className="text-xs text-neutral-300">{new Date(t.lastMessageAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
              </button>
            ))}
        </div>
      </aside>

      {/* ── Conversation ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a conversation or start a new chat.</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b bg-white px-5 py-3">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm text-white ${color(active.customer.id)}`}>{initials(active.customer.fullName)}</span>
              <div className="flex-1">
                <p className="font-semibold">{active.customer.fullName}</p>
                <p className="text-xs text-muted-foreground">{active.customer.phone ?? 'no phone'} · {active.customer.email ?? 'no email'}</p>
              </div>
              <button onClick={() => setShowProfile(p => !p)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary">View profile</button>
              {active.customer.phone && (
                <a href={`tel:${active.customer.phone}`} className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200">📞 Call</a>
              )}
              <button onClick={() => apiFetch(`/messages/threads/${active.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: active.status === 'OPEN' ? 'CLOSED' : 'OPEN' }) }).then(() => { openThread(active.id); loadThreads(filter); })}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-secondary">{active.status === 'OPEN' ? 'Close' : 'Reopen'}</button>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-background px-5 py-4">
              {active.messages.map(m => {
                const out = m.direction === 'OUTBOUND';
                const sys = m.channel === 'SYSTEM';
                if (sys) return <div key={m.id} className="text-center"><span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{m.body}</span></div>;
                return (
                  <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${out ? 'bg-primary text-primary-foreground' : 'border bg-white'}`}>
                      {m.attachments.filter(a => a.startsWith('data:')).map((a, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={a} alt="attachment" className="mb-1 max-h-40 rounded-lg" />
                      ))}
                      <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                      <p className={`mt-0.5 text-xs ${out ? 'text-white/70' : 'text-muted-foreground'}`}>
                        <span className="uppercase">{m.channel}</span> · {m.status === 'SCHEDULED' ? `Scheduled ${new Date(m.scheduledFor!).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : new Date(m.createdAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {m.status === 'FAILED' && ' · ⚠ failed'}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div className="space-y-2 border-t bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="relative">
                  <button onClick={() => setShowTemplates(s => !s)} className="rounded border px-2 py-1 hover:bg-secondary">📄 Templates</button>
                  {showTemplates && (
                    <div className="absolute bottom-8 left-0 z-20 w-60 rounded-xl border bg-white p-2 shadow-xl">
                      <div className="max-h-48 overflow-y-auto">
                        {templates.filter(t => t.channel === channel || t.channel === 'SMS').map(t => (
                          <button key={t.id} onClick={() => applyTemplate(t)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-secondary">
                            <span className="font-medium">{t.name}</span><span className="ml-1 text-muted-foreground">{t.channel}</span>
                          </button>
                        ))}
                        {templates.length === 0 && <p className="px-2 py-1 text-muted-foreground">No templates yet.</p>}
                      </div>
                      <button onClick={() => { setShowTemplates(false); setManageTemplates(true); }} className="mt-1 w-full rounded bg-secondary py-1 text-muted-foreground hover:bg-neutral-200">Manage templates</button>
                    </div>
                  )}
                </div>
                <button onClick={() => setAgreementModal(true)} className="rounded border px-2 py-1 hover:bg-secondary">Intake / Agreement</button>
                <button onClick={() => setReceiptModal(true)} className="rounded border px-2 py-1 hover:bg-secondary">Receipt</button>
                <button onClick={shareBookOnline} className="rounded border px-2 py-1 hover:bg-secondary">Book Online</button>
                <button onClick={addCardLink} className="rounded border px-2 py-1 hover:bg-secondary">Add Card</button>
                <label className="cursor-pointer rounded border px-2 py-1 hover:bg-secondary">📷 Photo
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); }} />
                </label>
                <button onClick={simulateReply} className="rounded border px-2 py-1 text-muted-foreground hover:bg-secondary" title="Demo: simulate a customer reply">↩ Simulate reply</button>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => setChannel('SMS')} className={`rounded px-2 py-1 ${channel === 'SMS' ? 'bg-primary text-primary-foreground' : 'border'}`}>SMS</button>
                  <button onClick={() => setChannel('EMAIL')} className={`rounded px-2 py-1 ${channel === 'EMAIL' ? 'bg-primary text-primary-foreground' : 'border'}`}>Email</button>
                </div>
              </div>

              {channel === 'EMAIL' && (
                <div className="space-y-1.5 rounded-lg border bg-secondary p-2">
                  <input className="w-full rounded border px-2 py-1 text-sm" placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input className="rounded border px-2 py-1 text-xs" placeholder="Cc (comma-separated)" value={cc} onChange={e => setCc(e.target.value)} />
                    <input className="rounded border px-2 py-1 text-xs" placeholder="Bcc" value={bcc} onChange={e => setBcc(e.target.value)} />
                  </div>
                  <input className="w-full rounded border px-2 py-1 text-xs" placeholder="Signature (appended to email)" value={signature} onChange={e => setSignature(e.target.value)} />
                </div>
              )}

              {attachments.length > 0 && (
                <div className="flex gap-2">
                  {attachments.map((a, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a} alt="" className="h-14 w-14 rounded border object-cover" />
                      <button onClick={() => setAttachments(at => at.filter((_, idx) => idx !== i))} className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-red-500 text-xs text-white">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <textarea rows={2} className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm" placeholder={`Send ${channel} to ${active.customer.fullName}…`}
                  value={draft} onChange={e => setDraft(e.target.value)} />
                <div className="flex flex-col gap-1">
                  <button onClick={send} disabled={sending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{sending ? '…' : scheduleFor ? 'Schedule' : 'Send'}</button>
                  <input type="datetime-local" className="rounded border px-1 py-0.5 text-xs" value={scheduleFor} onChange={e => setScheduleFor(e.target.value)} title="Schedule send" />
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Right profile pane */}
      {active && showProfile && <ProfilePane customerId={active.customer.id} onClose={() => setShowProfile(false)} />}

      {manageTemplates && <TemplateManager templates={templates} onClose={() => setManageTemplates(false)} onChanged={loadTemplates} />}
      {active && agreementModal && <AgreementModal customerId={active.customer.id} onClose={() => setAgreementModal(false)} onShare={link => { setDraft(d => `${d ? d + '\n' : ''}${link}`); setAgreementModal(false); }} />}
      {active && receiptModal && <ReceiptModal customerId={active.customer.id} onClose={() => setReceiptModal(false)} onShare={link => { setDraft(d => `${d ? d + '\n' : ''}${link}`); setReceiptModal(false); }} />}
    </div>
  );
}

// ── Profile pane ──────────────────────────────────────────────────────────────
function ProfilePane({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const [c, setC] = useState<{ fullName: string; phone: string | null; email: string | null; addressLine: string | null; city: string | null; tags: string[]; loyaltyPoints: number; statementCreditCents: number; membershipTier: string | null; pets: { id: string; name: string; breed: string | null }[] } | null>(null);
  useEffect(() => { apiFetch<typeof c>(`/customers/${customerId}`).then(setC).catch(() => {}); }, [customerId]);
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Profile</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">×</button>
      </div>
      {!c ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : (
        <div className="space-y-3 p-4 text-sm">
          <p className="font-semibold">{c.fullName}</p>
          {c.membershipTier && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">{c.membershipTier}</span>}
          <div className="space-y-1 text-muted-foreground">
            {c.phone && <p>📞 {c.phone}</p>}
            {c.email && <p>✉ {c.email}</p>}
            {(c.addressLine || c.city) && <p>🏠 {[c.addressLine, c.city].filter(Boolean).join(', ')}</p>}
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded bg-secondary px-2 py-1">{c.loyaltyPoints} pts</span>
            <span className="rounded bg-secondary px-2 py-1">Credit ${(c.statementCreditCents / 100).toFixed(2)}</span>
          </div>
          {c.tags.length > 0 && <div className="flex flex-wrap gap-1">{c.tags.map(t => <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{t}</span>)}</div>}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Pets</p>
            {c.pets.map(p => <p key={p.id} className="text-sm">{p.name} <span className="text-muted-foreground">{p.breed}</span></p>)}
          </div>
          <a href={`/clients/${customerId}`} className="block rounded-md border py-1.5 text-center text-xs hover:bg-secondary">Open full profile →</a>
        </div>
      )}
    </aside>
  );
}

// ── Template manager ────────────────────────────────────────────────────────
function TemplateManager({ templates, onClose, onChanged }: { templates: { id: string; name: string; channel: string; subject: string | null; body: string }[]; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState({ name: '', channel: 'SMS', subject: '', body: '' });
  async function add() {
    if (!form.name.trim() || !form.body.trim()) return;
    await apiFetch('/messages/templates', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', channel: 'SMS', subject: '', body: '' }); onChanged();
  }
  async function del(id: string) { await apiFetch(`/messages/templates/${id}`, { method: 'DELETE' }); onChanged(); }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Message templates</h2><button onClick={onClose} className="text-xl text-muted-foreground">×</button></div>
        <div className="space-y-2 rounded-xl border p-4">
          <div className="flex gap-2">
            <input className="flex-1 rounded border px-2 py-1.5 text-sm" placeholder="Template name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <select className="rounded border bg-white px-2 py-1.5 text-sm" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}><option value="SMS">SMS</option><option value="EMAIL">Email</option></select>
          </div>
          {form.channel === 'EMAIL' && <input className="w-full rounded border px-2 py-1.5 text-sm" placeholder="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />}
          <textarea rows={3} className="w-full resize-none rounded border px-2 py-1.5 text-sm" placeholder="Template body — supports {{customerName}} {{petName}}" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
          <button onClick={add} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Add template</button>
        </div>
        <div className="divide-y">
          {templates.map(t => (
            <div key={t.id} className="flex items-start justify-between py-2">
              <div><p className="text-sm font-medium">{t.name} <span className="text-xs text-muted-foreground">{t.channel}</span></p><p className="text-xs text-muted-foreground">{t.body.slice(0, 60)}</p></div>
              <button onClick={() => del(t.id)} className="text-xs text-red-400 hover:underline">delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Agreement form selector ───────────────────────────────────────────────────
function AgreementModal({ customerId, onClose, onShare }: { customerId: string; onClose: () => void; onShare: (link: string) => void }) {
  const [bookings, setBookings] = useState<{ id: string; scheduledStart: string }[]>([]);
  const [forms, setForms] = useState<{ formType: string; title: string }[]>([]);
  const [bookingId, setBookingId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    apiFetch<{ id: string; scheduledStart: string }[]>(`/customers/${customerId}/appointments?filter=all`).then(b => { setBookings(b); if (b[0]) setBookingId(b[0].id); }).catch(() => {});
    apiFetch<{ formType: string; title: string }[]>('/forms/effective').then(setForms).catch(() => {});
  }, [customerId]);
  function toggle(ft: string) { setSelected(s => s.includes(ft) ? s.filter(x => x !== ft) : [...s, ft]); }
  function share() {
    const webBase = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';
    const q = selected.length ? `?forms=${selected.join(',')}` : '';
    onShare(`Please sign your agreement: ${webBase}/sign/${bookingId}${q}`);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] space-y-3 rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold">Share agreements for signature</h2>
        <div><label className="mb-1 block text-xs text-muted-foreground">For appointment</label>
          <select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" value={bookingId} onChange={e => setBookingId(e.target.value)}>
            {bookings.map(b => <option key={b.id} value={b.id}>{new Date(b.scheduledStart).toLocaleDateString('en-CA')} · #{b.id.slice(-6)}</option>)}
            {bookings.length === 0 && <option value="">No bookings</option>}
          </select>
        </div>
        <div><p className="mb-1 text-xs text-muted-foreground">Choose agreements (none = all)</p>
          <div className="space-y-1">
            {forms.map(f => <label key={f.formType} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(f.formType)} onChange={() => toggle(f.formType)} />{f.title}</label>)}
          </div>
        </div>
        <div className="flex gap-2"><button onClick={share} disabled={!bookingId} className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add link to message</button><button onClick={onClose} className="flex-1 rounded-lg border py-2 text-sm">Cancel</button></div>
      </div>
    </div>
  );
}

// ── Receipt selector ──────────────────────────────────────────────────────────
function ReceiptModal({ customerId, onClose, onShare }: { customerId: string; onClose: () => void; onShare: (link: string) => void }) {
  const [bookings, setBookings] = useState<{ id: string; scheduledStart: string; invoice: { totalCents: number } | null; lineItems: { description: string }[] }[]>([]);
  useEffect(() => { apiFetch<typeof bookings>(`/customers/${customerId}/appointments?filter=completed`).then(setBookings).catch(() => {}); }, [customerId]);
  function share(id: string) {
    const webBase = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';
    onShare(`Your receipt: ${webBase}/receipt/${id}`);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] space-y-3 rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold">Send a receipt</h2>
        <p className="text-xs text-muted-foreground">Choose which order&apos;s receipt to send.</p>
        <div className="max-h-72 divide-y overflow-y-auto">
          {bookings.map(b => (
            <button key={b.id} onClick={() => share(b.id)} className="flex w-full items-center justify-between px-1 py-2 text-left text-sm hover:bg-secondary">
              <span>{new Date(b.scheduledStart).toLocaleDateString('en-CA')}<span className="block text-xs text-muted-foreground">{b.lineItems.map(l => l.description).join(', ').slice(0, 40)}</span></span>
              <span className="font-medium">{b.invoice ? `$${(b.invoice.totalCents / 100).toFixed(2)}` : '—'}</span>
            </button>
          ))}
          {bookings.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No completed orders.</p>}
        </div>
        <button onClick={onClose} className="w-full rounded-lg border py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}
