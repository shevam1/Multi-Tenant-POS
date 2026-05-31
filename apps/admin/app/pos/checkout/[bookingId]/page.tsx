'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface BookingInfo {
  id: string;
  status: string;
  storeId: string;
  customer: { id: string; fullName: string; statementCreditCents: number };
  pet: { name: string } | null;
  store: { province: string; name: string };
  lineItems: { description: string; unitPriceCents: number }[];
}

interface SellableProduct { id: string; name: string; priceCents: number; stockQty: number; sku: string | null }

interface MemberInfo {
  tier: string;
  planName: string;
  discountCents: number;
  pointsMultiplier: number;
  benefits: string[];
}

interface CheckoutPreview {
  subtotalCents: number;
  discountCents: number;
  taxableBaseCents: number;
  taxes: { component: string; rate: number; amount: number }[];
  totalTaxCents: number;
  tipCents: number;
  cashRoundingCents: number;
  totalCents: number;
}

type Tender = 'CASH' | 'CARD' | 'MOBILE_WALLET';

export default function CheckoutPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [tender, setTender] = useState<Tender>('CARD');
  const [useCredit, setUseCredit] = useState(true);
  const [tipCents, setTipCents] = useState(0);
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [earned, setEarned] = useState<number | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [sellable, setSellable] = useState<SellableProduct[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({}); // productId → qty

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<BookingInfo & { store: { province: string } }>(`/bookings/${bookingId}`)
      .then(async b => {
        setBooking(b);
        if (b.storeId) apiFetch<SellableProduct[]>(`/products/sellable?storeId=${b.storeId}`).then(setSellable).catch(() => {});
        const serviceSubtotal = b.lineItems.reduce((s, l) => s + l.unitPriceCents, 0);
        const m = await apiFetch<{ plan: MemberInfo } | null>(`/memberships/customer/${b.customer.id}`).catch(() => null);
        if (m && (m as unknown as { plan?: { tier: string; name: string; serviceDiscountPct: number; pointsMultiplier: number; benefits: string[] } }).plan) {
          const plan = (m as unknown as { plan: { tier: string; name: string; serviceDiscountPct: number; pointsMultiplier: number; benefits: string[] } }).plan;
          setMember({
            tier: plan.tier,
            planName: plan.name,
            discountCents: Math.round(serviceSubtotal * plan.serviceDiscountPct),
            pointsMultiplier: plan.pointsMultiplier,
            benefits: plan.benefits,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [bookingId, router]);

  const productLines = Object.entries(cart).filter(([, q]) => q > 0).map(([pid, qty]) => {
    const p = sellable.find(s => s.id === pid)!;
    return { description: `${p.name}${qty > 1 ? ` ×${qty}` : ''} (retail)`, amountCents: p.priceCents * qty };
  });

  useEffect(() => {
    if (!booking) return;
    const lines = [...booking.lineItems.map(l => ({ description: l.description, amountCents: l.unitPriceCents })), ...productLines];
    if (lines.length === 0) { setPreview(null); return; }
    const credit = useCredit ? booking.customer.statementCreditCents : 0;
    const discountCents = credit + (coupon?.discountCents ?? 0);
    apiFetch<CheckoutPreview>(`/pos/preview?province=${booking.store.province}`, {
      method: 'POST',
      body: JSON.stringify({ lines, tender, discountCents, tipCents }),
    }).then(setPreview).catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, tender, useCredit, tipCents, coupon, cart]);

  async function applyCoupon() {
    if (!booking || !couponInput.trim()) return;
    setCouponError('');
    const subtotal = booking.lineItems.reduce((s, l) => s + l.unitPriceCents, 0);
    const res = await apiFetch<{ valid: boolean; reason?: string; code?: string; discountCents?: number }>(
      `/coupons/validate?code=${encodeURIComponent(couponInput.trim())}&subtotalCents=${subtotal}`,
    ).catch(() => null);
    if (res?.valid) {
      setCoupon({ code: res.code!, discountCents: res.discountCents ?? 0 });
    } else {
      setCoupon(null);
      setCouponError(res?.reason ?? 'Invalid coupon');
    }
  }

  async function pay() {
    if (!booking) return;
    setPaying(true);
    try {
      const lines = booking.lineItems.map(l => ({ description: l.description, amountCents: l.unitPriceCents }));
      const productSales = Object.entries(cart).filter(([, q]) => q > 0).map(([productId, qty]) => ({ productId, qty }));
      const res = await apiFetch<{ loyalty?: { earned: number } }>(`/pos/bookings/${bookingId}/checkout`, {
        method: 'POST',
        body: JSON.stringify({
          lines, tender, tipCents,
          discountCents: useCredit ? booking.customer.statementCreditCents : 0,
          couponCode: coupon?.code,
          productSales,
        }),
      });
      setEarned(res.loyalty?.earned ?? null);
      setDone(true);
    } catch(e) {
      alert(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setPaying(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-neutral-500">Loading…</div>;
  if (!booking) return <div className="p-8 text-sm text-red-500">Booking not found</div>;

  if (done) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="text-4xl">✅</div>
      <h1 className="text-2xl font-bold">Payment complete</h1>
      <p className="text-neutral-500">Invoice created · Booking marked COMPLETED</p>
      {earned !== null && earned > 0 && (
        <p className="rounded-full bg-brand/10 px-4 py-1.5 text-sm font-medium text-brand">
          +{earned} loyalty points earned 🎉
        </p>
      )}
      <button onClick={() => router.push('/dashboard')} className="mt-4 rounded-md bg-brand px-6 py-2 text-sm font-medium text-white">
        Back to dashboard
      </button>
    </div>
  );

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-sm text-neutral-500">← Back</button>
        <h1 className="font-semibold">POS Checkout</h1>
        <span className="text-sm text-neutral-400">{booking.store.name}</span>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        {/* Member banner */}
        {member && (
          <div className="rounded-xl border-2 border-violet-200 bg-gradient-to-r from-violet-50 to-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="rounded-full bg-violet-200 px-2.5 py-0.5 text-xs font-bold text-violet-800">{member.tier} MEMBER</span>
                <p className="mt-1 text-sm font-medium">{member.planName}</p>
              </div>
              <div className="text-right text-sm">
                {member.discountCents > 0 && <p className="font-semibold text-green-600">−{fmt(member.discountCents)} member discount</p>}
                <p className="text-violet-600">earns {member.pointsMultiplier}× points</p>
              </div>
            </div>
          </div>
        )}

        {/* Customer + services */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="font-semibold">{booking.customer.fullName} {booking.pet && `· ${booking.pet.name}`}</p>
          <div className="mt-3 divide-y text-sm">
            {booking.lineItems.map(l => (
              <div key={l.description} className="flex justify-between py-2">
                <span>{l.description}</span>
                <span>{fmt(l.unitPriceCents)}</span>
              </div>
            ))}
            {booking.lineItems.length === 0 && <p className="py-2 text-neutral-400">No services on booking</p>}
            {productLines.map(pl => (
              <div key={pl.description} className="flex justify-between py-2 text-neutral-600">
                <span>🛍 {pl.description}</span>
                <span>{fmt(pl.amountCents)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Retail products */}
        {sellable.length > 0 && (
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="mb-3 font-semibold text-sm">Add retail products</p>
            <div className="space-y-2">
              {sellable.map(p => {
                const qty = cart[p.id] ?? 0;
                return (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.name} <span className="text-neutral-400">{fmt(p.priceCents)} · {p.stockQty} in stock</span></span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCart(c => ({ ...c, [p.id]: Math.max(0, (c[p.id] ?? 0) - 1) }))} className="rounded border h-6 w-6 text-neutral-500 hover:bg-neutral-50">−</button>
                      <span className="w-6 text-center">{qty}</span>
                      <button onClick={() => setCart(c => ({ ...c, [p.id]: Math.min(p.stockQty, (c[p.id] ?? 0) + 1) }))} className="rounded border h-6 w-6 text-neutral-500 hover:bg-neutral-50">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Statement credit */}
        {booking.customer.statementCreditCents > 0 && (
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input type="checkbox" checked={useCredit} onChange={e => setUseCredit(e.target.checked)} className="h-4 w-4" />
              <span>Apply statement credit: <span className="font-semibold text-green-600">{fmt(booking.customer.statementCreditCents)}</span></span>
            </label>
          </div>
        )}

        {/* Coupon / discount */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="mb-2 font-semibold text-sm">Coupon / discount</p>
          {coupon ? (
            <div className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm">
              <span><span className="font-mono font-bold">{coupon.code}</span> applied — <span className="text-green-700 font-semibold">−{fmt(coupon.discountCents)}</span></span>
              <button onClick={() => { setCoupon(null); setCouponInput(''); }} className="text-xs text-neutral-500 hover:text-red-500">Remove</button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input className="flex-1 rounded-lg border px-3 py-2 text-sm font-mono uppercase"
                  placeholder="Enter code" value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase())} />
                <button onClick={applyCoupon} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-50">Apply</button>
              </div>
              {couponError && <p className="mt-1 text-xs text-red-500">{couponError}</p>}
            </div>
          )}
        </div>

        {/* Tender */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="mb-3 font-semibold text-sm">Payment method</p>
          <div className="flex gap-2">
            {(['CARD','CASH','MOBILE_WALLET'] as Tender[]).map(t => (
              <button key={t} onClick={() => setTender(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition border ${tender === t ? 'bg-brand text-white border-brand' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                {t === 'MOBILE_WALLET' ? 'Mobile' : t}
              </button>
            ))}
          </div>
          {tender === 'CASH' && <p className="mt-2 text-xs text-amber-600">Cash: total will be rounded to nearest $0.05 (penny elimination)</p>}
        </div>

        {/* Tip */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="mb-3 font-semibold text-sm">Tip (CAD)</p>
          <div className="flex gap-2">
            {[0, 10, 15, 20].map(pct => (
              <button key={pct} onClick={() => {
                const base = booking.lineItems.reduce((s,l) => s + l.unitPriceCents, 0);
                setTipCents(Math.round(base * pct / 100));
              }}
                className="flex-1 rounded-lg border py-2 text-sm hover:bg-neutral-50">
                {pct === 0 ? 'No tip' : `${pct}%`}
              </button>
            ))}
          </div>
          {tipCents > 0 && <p className="mt-2 text-sm text-neutral-600">Tip: {fmt(tipCents)}</p>}
        </div>

        {/* Preview totals */}
        {preview && (
          <div className="rounded-xl border bg-white p-5 shadow-sm text-sm space-y-1.5">
            <div className="flex justify-between text-neutral-500"><span>Subtotal</span><span>{fmt(preview.subtotalCents)}</span></div>
            {preview.discountCents > 0 && <div className="flex justify-between text-green-600"><span>Statement credit</span><span>−{fmt(preview.discountCents)}</span></div>}
            {preview.taxes.map(t => (
              <div key={t.component} className="flex justify-between text-neutral-500">
                <span>{t.component} ({(t.rate * 100).toFixed(2)}%)</span>
                <span>{fmt(t.amount)}</span>
              </div>
            ))}
            {preview.tipCents > 0 && <div className="flex justify-between text-neutral-500"><span>Tip</span><span>{fmt(preview.tipCents)}</span></div>}
            {preview.cashRoundingCents !== 0 && (
              <div className="flex justify-between text-amber-600">
                <span>Cash rounding</span><span>{preview.cashRoundingCents > 0 ? '+' : ''}{fmt(preview.cashRoundingCents)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 font-bold text-base">
              <span>Total</span><span>{fmt(preview.totalCents)} CAD</span>
            </div>
          </div>
        )}

        {/* Pay */}
        <button onClick={pay} disabled={paying || booking.lineItems.length === 0}
          className="w-full rounded-xl bg-brand py-4 text-base font-bold text-white hover:opacity-90 disabled:opacity-50">
          {paying ? 'Processing…' : `Pay ${preview ? fmt(preview.totalCents) : '—'} CAD`}
        </button>
      </main>
    </div>
  );
}
