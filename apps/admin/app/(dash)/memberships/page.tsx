'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface Plan {
  id: string;
  tier: string;
  name: string;
  monthlyFeeCents: number;
  serviceDiscountPct: number;
  pointsMultiplier: number;
  benefits: string[];
}

interface Customer {
  id: string;
  fullName: string;
  membershipTier: string | null;
  loyaltyPoints: number;
}

const TIER_STYLE: Record<string, string> = {
  SILVER: 'border-neutral-300 bg-gradient-to-b from-neutral-50 to-white',
  GOLD: 'border-amber-300 bg-gradient-to-b from-amber-50 to-white',
  PLATINUM: 'border-violet-300 bg-gradient-to-b from-violet-50 to-white',
};
const TIER_BADGE: Record<string, string> = {
  SILVER: 'bg-neutral-200 text-neutral-700',
  GOLD: 'bg-amber-200 text-amber-800',
  PLATINUM: 'bg-violet-200 text-violet-800',
};

export default function MembershipsPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [p, c] = await Promise.all([
      apiFetch<Plan[]>('/memberships/plans'),
      // /customers now returns a paginated { data, total, page, limit } object
      apiFetch<{ data: Customer[] }>('/customers?page=1&limit=200&status=ALL'),
    ]);
    setPlans(p);
    setCustomers(c.data);
    return c.data;
  }

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    refresh().finally(() => setLoading(false));
  }, [router]);

  async function enroll(planId: string) {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/memberships/customer/${selected.id}/enroll`, { method: 'POST', body: JSON.stringify({ planId }) });
      const c = await refresh();
      setSelected(c.find(x => x.id === selected.id) ?? null);
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/memberships/customer/${selected.id}/cancel`, { method: 'POST' });
      const c = await refresh();
      setSelected(c.find(x => x.id === selected.id) ?? null);
    } finally { setBusy(false); }
  }

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

  if (loading) return <div className="p-8 text-sm text-neutral-400">Loading…</div>;

  return (
    <div>
      <main className="mx-auto max-w-5xl px-8 py-8 space-y-8">
        <h1 className="text-2xl font-bold tracking-tight">Membership &amp; Loyalty</h1>
        {/* Plans */}
        <section>
          <h2 className="mb-3 font-semibold text-lg">Subscription tiers</h2>
          <div className="grid grid-cols-3 gap-4">
            {plans.map(p => (
              <div key={p.id} className={`rounded-2xl border-2 p-5 shadow-sm ${TIER_STYLE[p.tier] ?? ''}`}>
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TIER_BADGE[p.tier] ?? 'bg-neutral-200'}`}>{p.tier}</span>
                  <span className="text-2xl font-bold">{fmt(p.monthlyFeeCents)}<span className="text-sm font-normal text-neutral-400">/mo</span></span>
                </div>
                <p className="mt-2 font-semibold">{p.name}</p>
                <div className="mt-2 flex gap-2 text-xs text-neutral-500">
                  {p.serviceDiscountPct > 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">{Math.round(p.serviceDiscountPct * 100)}% off</span>}
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">{p.pointsMultiplier}× points</span>
                </div>
                <ul className="mt-3 space-y-1">
                  {p.benefits.map((b, i) => <li key={i} className="text-xs text-neutral-600 flex gap-1.5"><span className="text-green-500">✓</span>{b}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Customer enrollment */}
        <section className="grid grid-cols-3 gap-6">
          <div>
            <h2 className="mb-3 font-semibold">Customers</h2>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {customers.map(c => (
                <button key={c.id} onClick={() => setSelected(c)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${selected?.id === c.id ? 'border-brand bg-brand/5' : 'bg-white hover:bg-neutral-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.fullName}</span>
                    {c.membershipTier && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_BADGE[c.membershipTier] ?? ''}`}>{c.membershipTier}</span>}
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">{c.loyaltyPoints} pts</p>
                </button>
              ))}
            </div>
          </div>

          <div className="col-span-2">
            {selected ? (
              <div className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">{selected.fullName}</h3>
                    <p className="text-sm text-neutral-500">
                      {selected.membershipTier
                        ? <>Current: <span className="font-medium">{selected.membershipTier}</span></>
                        : 'No active membership'}
                      {' · '}<span className="font-medium text-brand">{selected.loyaltyPoints} loyalty points</span>
                    </p>
                  </div>
                  {selected.membershipTier && (
                    <button onClick={cancel} disabled={busy}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                      Cancel membership
                    </button>
                  )}
                </div>
                <p className="text-sm font-medium mb-2">Enroll / change tier:</p>
                <div className="grid grid-cols-3 gap-2">
                  {plans.map(p => (
                    <button key={p.id} onClick={() => enroll(p.id)} disabled={busy || selected.membershipTier === p.tier}
                      className={`rounded-lg border-2 p-3 text-center transition disabled:opacity-40 ${TIER_STYLE[p.tier]} hover:shadow-md`}>
                      <p className="text-xs font-bold">{p.tier}</p>
                      <p className="text-sm font-semibold mt-1">{fmt(p.monthlyFeeCents)}/mo</p>
                      {selected.membershipTier === p.tier && <p className="text-xs text-green-600 mt-1">Current</p>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed p-12 text-center text-sm text-neutral-400">
                Select a customer to manage their membership & loyalty
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
