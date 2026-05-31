'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface ReminderRow {
  bookingId: string; shortId: string; status: string; scheduledStart: string;
  client: string; customerId: string; reminderStatus: string; canResend: boolean;
}
interface AutomationRule {
  id: string | null; type: string; channel: string; enabled: boolean; offsetHours: number; template: string;
}
interface AuthMe { role: string; storeId: string | null; permissions: string[] }

const TABS = [
  ['APPOINTMENT_REMINDER', 'Appointment Reminder'],
  ['SECONDARY_REMINDER', 'Secondary Reminder'],
  ['SAME_DAY_REMINDER', 'Same-Day Reminder'],
  ['REBOOK_REMINDER', 'Rebook Reminder'],
  ['VACCINATION_REMINDER', 'Vaccination Reminder'],
  ['PET_BIRTHDAY_REMINDER', 'Pet Birthday Reminder'],
] as const;

const STATUS_CHIP: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-700 border-green-300',
  PENDING: 'bg-blue-50 text-blue-600 border-blue-300',
};

export default function RemindersPage() {
  const router = useRouter();
  const [tab, setTab] = useState<string>('APPOINTMENT_REMINDER');
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAutomation, setShowAutomation] = useState(false);
  const [busy, setBusy] = useState('');

  const load = useCallback(async (t: string) => {
    setLoading(true);
    const r = await apiFetch<ReminderRow[]>(`/reminders?type=${t}`).catch(() => []);
    setRows(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(() => {
      apiFetch<AutomationRule[]>('/reminders/automation').then(setRules).catch(() => {});
      load(tab);
    }).catch(() => router.push('/login'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function switchTab(t: string) { setTab(t); load(t); }

  async function resend(bookingId: string) {
    setBusy(bookingId);
    try {
      const res = await apiFetch<{ provider: string; body: string }>('/reminders/send', { method: 'POST', body: JSON.stringify({ bookingId, type: tab }) });
      alert(`Reminder sent via ${res.provider}:\n\n${res.body}`);
      load(tab);
    } catch (e) { alert(e instanceof Error ? e.message : 'Send failed'); }
    finally { setBusy(''); }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-neutral-500 hover:text-neutral-700">← Dashboard</button>
        <h1 className="font-semibold">Reminders</h1>
        <button onClick={() => setShowAutomation(true)} className="ml-auto rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          ⚙ Automation settings
        </button>
      </header>

      {/* Tabs */}
      <div className="border-b bg-white px-6 overflow-x-auto">
        <div className="flex gap-1">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => switchTab(key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${tab === key ? 'border-amber-400 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase text-neutral-500 tracking-wide">
              <tr>{['Appointment Id', 'Status', 'Time', 'Client', 'Reminder Status', 'Action'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Loading…</td></tr> :
                rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">No upcoming appointments.</td></tr> :
                rows.map(r => (
                  <tr key={r.bookingId} className="hover:bg-neutral-50">
                    <td className="px-4 py-3"><a href={`/bookings/${r.bookingId}`} className="text-brand hover:underline">#{r.shortId}</a></td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CHIP[r.status] ?? 'bg-neutral-100 text-neutral-500 border-neutral-200'}`}>
                        {r.status === 'CONFIRMED' ? 'Confirmed' : r.status === 'PENDING' ? 'Unconfirmed' : r.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(r.scheduledStart).toLocaleString('en-CA', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-3">{r.client}</td>
                    <td className="px-4 py-3 text-neutral-600">{r.reminderStatus}</td>
                    <td className="px-4 py-3">
                      {r.canResend
                        ? <button onClick={() => resend(r.bookingId)} disabled={busy === r.bookingId}
                            className="rounded-md bg-amber-400 px-3 py-1 text-xs font-bold text-neutral-900 hover:bg-amber-500 disabled:opacity-50">
                            {busy === r.bookingId ? '…' : r.reminderStatus === 'Sent' ? 'Resend' : 'Send'}
                          </button>
                        : <span className="text-neutral-300 text-xs">N/A</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-neutral-400">Automated reminders are dispatched per the rules in Automation settings. Use Resend to send manually.</p>
      </main>

      {showAutomation && (
        <AutomationModal rules={rules} onClose={() => setShowAutomation(false)} onSaved={() => apiFetch<AutomationRule[]>('/reminders/automation').then(setRules)} />
      )}
    </div>
  );
}

function AutomationModal({ rules, onClose, onSaved }: { rules: AutomationRule[]; onClose: () => void; onSaved: () => void }) {
  const [local, setLocal] = useState<AutomationRule[]>(rules);
  const [saving, setSaving] = useState('');

  function update(type: string, patch: Partial<AutomationRule>) {
    setLocal(ls => ls.map(r => r.type === type ? { ...r, ...patch } : r));
  }
  async function save(rule: AutomationRule) {
    setSaving(rule.type);
    await apiFetch('/reminders/automation', { method: 'POST', body: JSON.stringify({
      type: rule.type, channel: rule.channel, enabled: rule.enabled, offsetHours: rule.offsetHours, template: rule.template,
    })});
    setSaving('');
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">Automation — automated messages &amp; emails</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl">×</button>
        </div>
        <div className="space-y-4">
          {local.map(rule => (
            <div key={rule.type} className="rounded-xl border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{rule.type.replace(/_/g, ' ')}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={rule.enabled} onChange={e => update(rule.type, { enabled: e.target.checked })} />
                  Enabled
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Channel</label>
                  <select className="w-full rounded border px-2 py-1.5 text-sm bg-white" value={rule.channel} onChange={e => update(rule.type, { channel: e.target.value })}>
                    <option value="SMS">SMS</option>
                    <option value="EMAIL">Email</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Offset (hours {rule.type === 'REBOOK_REMINDER' ? 'after' : 'before'})</label>
                  <input type="number" className="w-full rounded border px-2 py-1.5 text-sm" value={rule.offsetHours} onChange={e => update(rule.type, { offsetHours: Number(e.target.value) })} />
                </div>
              </div>
              <label className="block text-xs text-neutral-500 mb-1">Template <span className="text-neutral-400">(tokens: {'{{customerName}} {{petName}} {{time}}'})</span></label>
              <textarea rows={2} className="w-full rounded border px-2 py-1.5 text-sm resize-none" value={rule.template} onChange={e => update(rule.type, { template: e.target.value })} />
              <button onClick={() => save(rule)} disabled={saving === rule.type} className="mt-2 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                {saving === rule.type ? 'Saving…' : 'Save rule'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
