'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Config { enabled: boolean; message: string; businessName?: string }
interface AuthMe { permissions: string[] }

const GSM_LIMIT = 160;

export default function SmsAutoReplyPage() {
  const router = useRouter();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [focused, setFocused] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState('');

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(async me => {
      setCanEdit(me.permissions.includes('settings.manage'));
      setCfg(await apiFetch<Config>('/messaging/auto-reply'));
    }).catch(() => router.push('/login'));
  }, [router]);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    const r = await apiFetch<Config>('/messaging/auto-reply', { method: 'PUT', body: JSON.stringify({ enabled: cfg.enabled, message: cfg.message }) });
    setCfg(c => c ? { ...c, ...r } : c);
    setSaving(false); setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2500);
  }

  async function simulate() {
    if (!testPhone.trim()) return;
    setTestResult('…');
    const r = await apiFetch<{ replied: boolean; reason: string; body?: string }>('/messaging/auto-reply/simulate', { method: 'POST', body: JSON.stringify({ phone: testPhone.trim() }) });
    setTestResult(r.replied ? `✓ Sent: “${r.body}”` : `Not sent — ${r.reason}`);
  }

  if (!cfg) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;

  const len = cfg.message.length;
  const over = len > GSM_LIMIT;
  const segments = len === 0 ? 0 : Math.ceil(len / GSM_LIMIT);

  return (
    <div>
      <main className="mx-auto max-w-2xl px-8 py-8 space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">SMS Auto-Reply</h1>
        <section className="rounded-xl border bg-white p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Auto-reply to inbound texts</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Sends an instant reply to messages arriving on your business line.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className={cfg.enabled ? 'text-amber-600 font-medium' : 'text-neutral-400'}>{cfg.enabled ? 'On' : 'Off'}</span>
              <button type="button" disabled={!canEdit} onClick={() => setCfg(c => c ? { ...c, enabled: !c.enabled } : c)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${cfg.enabled ? 'bg-amber-400' : 'bg-neutral-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-neutral-500">Auto-reply message</label>
              <span className={`text-xs ${over ? 'text-red-500 font-medium' : 'text-neutral-400'}`}>{len}/{GSM_LIMIT} · {segments} SMS</span>
            </div>
            <textarea rows={4} disabled={!canEdit}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              className={`w-full rounded-lg border px-3 py-2 text-sm resize-y transition ${focused ? 'border-blue-400 ring-2 ring-blue-100' : ''}`}
              value={cfg.message} onChange={e => setCfg(c => c ? { ...c, message: e.target.value } : c)}
              placeholder={`Thank you for messaging ${cfg.businessName || '[Business Name]'}. We will review your message shortly.`} />
            {over && (
              <p className="mt-1 text-xs text-red-500">
                Over the single-SMS limit — this message will send as {segments} texts. A single SMS supports up to 160 GSM characters; longer content costs more.
              </p>
            )}
            <p className="mt-1 text-xs text-neutral-400">If left blank while enabled, a default is used: “Thank you for messaging {cfg.businessName || '[Business Name]'}. We will review your message shortly.”</p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={save} disabled={!canEdit || saving}
              className="rounded-lg bg-amber-400 px-6 py-2 text-sm font-semibold text-neutral-900 hover:bg-amber-500 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save message'}
            </button>
            {savedMsg && <span className="text-sm text-green-600">✓ Saved</span>}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold mb-1">Test it</h2>
          <p className="text-xs text-neutral-400 mb-3">Simulate an inbound text to preview the reply. The anti-loop guard allows at most one auto-reply per number per hour.</p>
          <div className="flex gap-2">
            <input className="flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="+1 647 555 0199" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
            <button onClick={simulate} disabled={!testPhone.trim()} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50">Simulate inbound</button>
          </div>
          {testResult && <p className="mt-3 rounded bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{testResult}</p>}
        </section>
      </main>
    </div>
  );
}
