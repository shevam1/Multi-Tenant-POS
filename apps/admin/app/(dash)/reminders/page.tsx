'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface ReminderRow {
  bookingId: string; shortId: string; status: string; scheduledStart: string;
  client: string; customerId: string; reminderStatus: string; canResend: boolean;
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
  const [loading, setLoading] = useState(true);
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
    <div>
      <main className="mx-auto max-w-5xl px-8 py-8">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Reminders</h1>
          <button onClick={() => router.push('/reminders/automation')} className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">⚙ Automation settings</button>
        </div>

        <div className="mb-4 overflow-x-auto border-b">
          <div className="flex gap-1">
            {TABS.map(([key, label]) => (
              <button key={key} onClick={() => switchTab(key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${tab === key ? 'border-amber-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

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
    </div>
  );
}
