'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

type DeliveryMode = 'BOTH' | 'SMS' | 'EMAIL';

interface Rule {
  id: string | null; type: string; label: string; group: string; timing: 'none' | 'before' | 'after';
  deliveryMode: DeliveryMode; enabled: boolean; offsetHours: number;
  template: string; subject: string; brandColor: string | null; ccEmails: string[];
}
interface MergeTagGroup { group: string; tags: { token: string; label: string }[] }
interface AuthMe { permissions: string[] }

const MODE_LABEL: Record<DeliveryMode, string> = {
  BOTH: 'Both Text Message and Email', SMS: 'Text Message Only', EMAIL: 'Email Only',
};
const BRAND_PRESETS = ['#db2777', '#e11d48', '#f59e0b', '#16a34a', '#0ea5e9', '#6366f1', '#8b5cf6', '#111827'];

/** SMS segment estimate: Unicode (emoji/non-GSM) caps at 70/67, else 160/153. */
function smsInfo(body: string) {
  const len = body.length;
  const unicode = /[^\u0000-\u007f]/.test(body); // non-ASCII (emoji, CJK, accents)
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi);
  return { len, unicode, segments };
}

export default function AutomationSettingsPage() {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>([]);
  const [tags, setTags] = useState<MergeTagGroup[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [draft, setDraft] = useState<Rule | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [ccInput, setCcInput] = useState('');

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const activeField = useRef<'body' | 'subject'>('body');

  const loadRules = useCallback(async () => {
    const r = await apiFetch<Rule[]>('/reminders/automation');
    setRules(r);
    return r;
  }, []);

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<AuthMe>('/auth/me').then(async me => {
      setCanEdit(me.permissions.includes('reminders.manage') || me.permissions.includes('settings.manage'));
      const [r] = await Promise.all([
        loadRules(),
        apiFetch<{ mergeTags: MergeTagGroup[] }>('/reminders/automation/meta').then(m => setTags(m.mergeTags)).catch(() => {}),
      ]);
      if (r.length) { setSelected(r[0].type); setDraft(r[0]); }
    }).catch(() => router.push('/login'));
  }, [router, loadRules]);

  function selectType(type: string) {
    if (type === selected) return;
    if (dirty && !confirm('You have unsaved changes. Discard them and switch?')) return;
    const r = rules.find(x => x.type === type);
    if (r) { setSelected(type); setDraft({ ...r }); setDirty(false); setSavedMsg(false); setCcInput(''); }
  }

  function patch(p: Partial<Rule>) { setDraft(d => d ? { ...d, ...p } : d); setDirty(true); setSavedMsg(false); }

  function insertTag(token: string) {
    if (!draft) return;
    if (activeField.current === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const s = el.selectionStart ?? draft.subject.length;
      const next = draft.subject.slice(0, s) + token + draft.subject.slice(el.selectionEnd ?? s);
      patch({ subject: next });
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
    } else if (bodyRef.current) {
      const el = bodyRef.current;
      const s = el.selectionStart ?? draft.template.length;
      const next = draft.template.slice(0, s) + token + draft.template.slice(el.selectionEnd ?? s);
      patch({ template: next });
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
    }
  }

  function addCc() {
    const email = ccInput.trim();
    if (!email || !draft) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('Enter a valid email'); return; }
    if (draft.ccEmails.includes(email)) { setCcInput(''); return; }
    patch({ ccEmails: [...draft.ccEmails, email] }); setCcInput('');
  }
  function removeCc(email: string) { if (draft) patch({ ccEmails: draft.ccEmails.filter(e => e !== email) }); }

  async function save() {
    if (!draft) return;
    setSaving(true);
    await apiFetch('/reminders/automation', { method: 'POST', body: JSON.stringify({
      type: draft.type, deliveryMode: draft.deliveryMode, enabled: draft.enabled, offsetHours: draft.offsetHours,
      template: draft.template, subject: draft.subject, brandColor: draft.brandColor, ccEmails: draft.ccEmails,
    })});
    setSaving(false); setDirty(false); setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2500);
    await loadRules();
  }

  const groups = Array.from(new Set(rules.map(r => r.group)));
  const showEmail = draft?.deliveryMode === 'BOTH' || draft?.deliveryMode === 'EMAIL';
  const showSms = draft?.deliveryMode === 'BOTH' || draft?.deliveryMode === 'SMS';
  const sms = draft ? smsInfo(draft.template) : { len: 0, unicode: false, segments: 0 };

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/reminders')} className="text-sm text-neutral-500 hover:text-neutral-700">← Reminders</button>
        <h1 className="font-semibold">Automation Settings</h1>
        {dirty && <span className="text-xs text-amber-600">● Unsaved changes</span>}
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-6">
        {/* Left: notification type list */}
        <aside className="w-64 shrink-0">
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            {groups.map(g => (
              <div key={g}>
                <p className="bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{g}</p>
                {rules.filter(r => r.group === g).map(r => (
                  <button key={r.type} onClick={() => selectType(r.type)}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm border-l-2 transition ${selected === r.type ? 'border-amber-400 bg-amber-50/60 font-medium' : 'border-transparent hover:bg-neutral-50'}`}>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${r.enabled ? 'bg-amber-400' : 'bg-neutral-300'}`} />
                    <span className="flex-1">{r.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* Right: config panel */}
        <main className="flex-1">
          {!draft ? <p className="text-sm text-neutral-400">Loading…</p> : (
            <div className="rounded-xl border bg-white shadow-sm">
              {/* Workspace header: title + master toggle */}
              <div className="flex items-center justify-between border-b px-5 py-4">
                <div>
                  <h2 className="font-semibold">{draft.label}</h2>
                  <p className="text-xs text-neutral-400">{draft.group}</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span className={draft.enabled ? 'text-amber-600 font-medium' : 'text-neutral-400'}>{draft.enabled ? 'Enabled' : 'Disabled'}</span>
                  <button type="button" onClick={() => patch({ enabled: !draft.enabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${draft.enabled ? 'bg-amber-400' : 'bg-neutral-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${draft.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </label>
              </div>

              <div className="space-y-5 px-5 py-5">
                {/* Delivery channel + timing */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">Send auto message by</label>
                    <select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" value={draft.deliveryMode}
                      onChange={e => patch({ deliveryMode: e.target.value as DeliveryMode })}>
                      {(['BOTH', 'SMS', 'EMAIL'] as DeliveryMode[]).map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                    </select>
                  </div>
                  {draft.timing !== 'none' && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Send {draft.timing} appointment</label>
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} className="w-24 rounded-lg border px-3 py-2 text-sm" value={draft.offsetHours}
                          onChange={e => patch({ offsetHours: Number(e.target.value) })} />
                        <span className="text-sm text-neutral-500">hours {draft.timing}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Merge tag palette */}
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1.5">Insert placeholder</label>
                  <div className="space-y-1.5">
                    {tags.map(g => (
                      <div key={g.group} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-neutral-400 w-20">{g.group}</span>
                        {g.tags.map(t => (
                          <button key={t.token} type="button" onClick={() => insertTag(t.token)}
                            className="rounded-full border bg-neutral-50 px-2.5 py-1 text-xs text-neutral-600 hover:border-brand/50 hover:bg-white">
                            {t.label}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* SMS guardrail + body */}
                {showSms && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    Please note that longer message content will cost more SMS texts. Typically, a single SMS supports up to 160 characters,
                    or up to 70 if the message contains Unicode characters (such as emoji or Chinese characters).
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-neutral-500">{showEmail && !showSms ? 'Email body' : 'Message body'}</label>
                    <span className="text-xs text-neutral-400">{sms.len} chars{showSms ? ` · ~${sms.segments} SMS${sms.unicode ? ' (Unicode)' : ''}` : ''}</span>
                  </div>
                  <textarea ref={bodyRef} rows={5} onFocus={() => { activeField.current = 'body'; }}
                    className="w-full rounded-lg border px-3 py-2 text-sm resize-y font-mono"
                    value={draft.template} onChange={e => patch({ template: e.target.value })} />
                </div>

                {/* Email-specific */}
                {showEmail && (
                  <div className="space-y-4 rounded-xl border border-dashed p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Email options</p>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Subject line</label>
                      <input ref={subjectRef} onFocus={() => { activeField.current = 'subject'; }}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        value={draft.subject} onChange={e => patch({ subject: e.target.value })}
                        placeholder="e.g. Your %business_name% appointment confirmation for %pets%" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5">Branding color</label>
                      <div className="flex flex-wrap gap-2">
                        {BRAND_PRESETS.map(c => (
                          <button key={c} type="button" onClick={() => patch({ brandColor: c })}
                            className="flex h-7 w-7 items-center justify-center rounded-full ring-offset-1 transition"
                            style={{ backgroundColor: c, boxShadow: draft.brandColor === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none' }}
                            title={c}>
                            {draft.brandColor === c && <span className="text-xs text-white">✓</span>}
                          </button>
                        ))}
                        {draft.brandColor && <button type="button" onClick={() => patch({ brandColor: null })} className="text-xs text-neutral-400 hover:text-neutral-600 self-center">Clear</button>}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1.5">Copy to (CC)</label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {draft.ccEmails.map(e => (
                          <span key={e} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs">
                            {e}<button type="button" onClick={() => removeCc(e)} className="text-neutral-400 hover:text-red-500">×</button>
                          </span>
                        ))}
                        <span className="inline-flex items-center gap-1">
                          <input value={ccInput} onChange={e => setCcInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCc(); } }}
                            placeholder="ops@pawz.ca" className="w-40 rounded-lg border px-2.5 py-1 text-xs" />
                          <button type="button" onClick={addCc} className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50">+ Add</button>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer: save */}
              <div className="flex items-center justify-end gap-3 border-t px-5 py-3">
                {savedMsg && <span className="text-sm text-green-600">✓ Saved</span>}
                {!canEdit && <span className="text-xs text-neutral-400">Read-only (no manage permission)</span>}
                <button onClick={save} disabled={!canEdit || saving || !dirty}
                  className="rounded-lg bg-brand px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
