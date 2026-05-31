'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

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
  const router = useRouter();
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

  const loadThreads = useCallback(async (f: string) => {
    const t = await apiFetch<Thread[]>(`/messages/threads?filter=${f}`).catch(() => []);
    setThreads(t);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    loadThreads(filter).finally(() => setLoading(false));
  }, [router, filter, loadThreads]);

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
      await apiFetch(`/messages/threads/${active.id}/send`, {
        method: 'POST',
        body: JSON.stringify({ channel, body: draft || '(photo)', attachments, scheduledFor: scheduleFor || null }),
      });
      setDraft(''); setAttachments([]); setScheduleFor('');
      openThread(active.id); loadThreads(filter);
    } catch (e) { alert(e instanceof Error ? e.message : 'Send failed'); }
    finally { setSending(false); }
  }

  async function shareLink(kind: 'agreement' | 'book' | 'receipt') {
    if (!active) return;
    const webBase = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';
    // Find the customer's latest booking for agreement/receipt links
    const appts = await apiFetch<{ id: string }[]>(`/customers/${active.customer.id}/appointments?filter=all`).catch(() => []);
    let body = '';
    if (kind === 'book') body = `Book your next appointment: ${webBase}/book?tenant=pawsome`;
    else if (kind === 'agreement') body = appts[0] ? `Please sign your service agreement: ${webBase}/sign/${appts[0].id}` : 'No booking to sign for.';
    else body = appts[0] ? `Your receipt: ${webBase}/sign/${appts[0].id}` : 'No receipt available yet.';
    setDraft(body);
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
    <div className="h-screen flex flex-col bg-neutral-50">
      <header className="border-b bg-white px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">Messages</h1>
        <span className="text-xs text-neutral-400">2-way SMS &amp; Email</span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── Thread list ── */}
        <aside className="w-80 shrink-0 border-r bg-white flex flex-col">
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <button onClick={() => setShowPicker(s => !s)} className="w-full rounded-lg border px-3 py-2 text-sm text-left text-neutral-500 hover:bg-neutral-50">
                Click to start new chat ▾
              </button>
              {showPicker && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-xl p-2">
                  <input autoFocus className="w-full rounded border px-2 py-1.5 text-sm mb-2" placeholder="Search client or pet…"
                    value={pickerQ} onChange={e => searchPicker(e.target.value)} />
                  <div className="max-h-56 overflow-y-auto">
                    {picker.map(c => (
                      <button key={c.id} onClick={() => startChat(c.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-50">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-white text-xs ${color(c.id)}`}>{initials(c.fullName)}</span>
                        <span>{c.fullName}<span className="block text-xs text-neutral-400">{c.phone}</span></span>
                      </button>
                    ))}
                    {pickerQ.length >= 2 && picker.length === 0 && <p className="text-xs text-neutral-400 px-2 py-1">No matches.</p>}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-1">
              {FILTERS.map(([f, label]) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium ${filter === f ? 'bg-amber-400 text-neutral-900' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <p className="p-4 text-sm text-neutral-400">Loading…</p> :
              threads.length === 0 ? <p className="p-4 text-sm text-neutral-400">No conversations.</p> :
              threads.map(t => (
                <button key={t.id} onClick={() => openThread(t.id)}
                  className={`flex w-full items-start gap-3 border-b px-3 py-3 text-left hover:bg-neutral-50 ${active?.id === t.id ? 'bg-amber-50' : ''}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-sm ${color(t.customer.id)}`}>{initials(t.customer.fullName)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium text-sm truncate">{t.customer.fullName}</span>
                      {t.unread && <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />}
                    </div>
                    <p className="text-xs text-neutral-500 truncate">{t.lastMessagePreview ?? 'No messages yet'}</p>
                    {t.lastMessageAt && <p className="text-xs text-neutral-300">{new Date(t.lastMessageAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                  </div>
                </button>
              ))}
          </div>
        </aside>

        {/* ── Conversation ── */}
        <main className="flex-1 flex flex-col min-w-0">
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">Select a conversation or start a new chat.</div>
          ) : (
            <>
              <div className="border-b bg-white px-5 py-3 flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-white text-sm ${color(active.customer.id)}`}>{initials(active.customer.fullName)}</span>
                <div className="flex-1">
                  <p className="font-semibold">{active.customer.fullName}</p>
                  <p className="text-xs text-neutral-400">{active.customer.phone ?? 'no phone'} · {active.customer.email ?? 'no email'}</p>
                </div>
                {active.customer.phone && (
                  <a href={`tel:${active.customer.phone}`} className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200">📞 Call</a>
                )}
                <button onClick={() => apiFetch(`/messages/threads/${active.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: active.status === 'OPEN' ? 'CLOSED' : 'OPEN' }) }).then(() => { openThread(active.id); loadThreads(filter); })}
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-neutral-50">{active.status === 'OPEN' ? 'Close' : 'Reopen'}</button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-neutral-50">
                {active.messages.map(m => {
                  const out = m.direction === 'OUTBOUND';
                  const sys = m.channel === 'SYSTEM';
                  if (sys) return <div key={m.id} className="text-center"><span className="rounded-full bg-neutral-200 px-3 py-1 text-xs text-neutral-600">{m.body}</span></div>;
                  return (
                    <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${out ? 'bg-brand text-white' : 'bg-white border'}`}>
                        {m.attachments.filter(a => a.startsWith('data:')).map((a, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={a} alt="attachment" className="mb-1 max-h-40 rounded-lg" />
                        ))}
                        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                        <p className={`mt-0.5 text-xs ${out ? 'text-white/70' : 'text-neutral-400'}`}>
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
              <div className="border-t bg-white p-4 space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <button onClick={() => shareLink('agreement')} className="rounded border px-2 py-1 hover:bg-neutral-50">Intake / Agreement</button>
                  <button onClick={() => shareLink('book')} className="rounded border px-2 py-1 hover:bg-neutral-50">Book Online</button>
                  <button onClick={() => shareLink('receipt')} className="rounded border px-2 py-1 hover:bg-neutral-50">Receipt</button>
                  <label className="rounded border px-2 py-1 hover:bg-neutral-50 cursor-pointer">📷 Photo
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); }} />
                  </label>
                  <button onClick={simulateReply} className="rounded border px-2 py-1 text-neutral-400 hover:bg-neutral-50" title="Demo: simulate a customer reply">↩ Simulate reply</button>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => setChannel('SMS')} className={`rounded px-2 py-1 ${channel === 'SMS' ? 'bg-brand text-white' : 'border'}`}>SMS</button>
                    <button onClick={() => setChannel('EMAIL')} className={`rounded px-2 py-1 ${channel === 'EMAIL' ? 'bg-brand text-white' : 'border'}`}>Email</button>
                  </div>
                </div>
                {attachments.length > 0 && (
                  <div className="flex gap-2">
                    {attachments.map((a, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a} alt="" className="h-14 w-14 rounded object-cover border" />
                        <button onClick={() => setAttachments(at => at.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 rounded-full bg-red-500 text-white text-xs h-4 w-4">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <textarea rows={2} className="flex-1 rounded-lg border px-3 py-2 text-sm resize-none" placeholder={`Send ${channel} to ${active.customer.fullName}…`}
                    value={draft} onChange={e => setDraft(e.target.value)} />
                  <div className="flex flex-col gap-1">
                    <button onClick={send} disabled={sending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{sending ? '…' : scheduleFor ? 'Schedule' : 'Send'}</button>
                    <input type="datetime-local" className="rounded border px-1 py-0.5 text-xs" value={scheduleFor} onChange={e => setScheduleFor(e.target.value)} title="Schedule send" />
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
