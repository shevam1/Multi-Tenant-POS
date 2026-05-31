'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Receipt {
  totalCents: number; subtotalCents: number; taxCents: number; discountCents: number; tipCents: number;
  couponCode: string | null; status: string; createdAt: string;
  lines: { description: string; amountCents: number }[];
  taxLines: { component: string; rate: number; amountCents: number }[];
  payments: { tender: string; amountCents: number }[];
  store: { name: string; addressLine: string | null; city: string | null; province: string };
  booking: { scheduledStart: string; customer: { fullName: string }; pet: { name: string } | null } | null;
}

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function ReceiptPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [r, setR] = useState<Receipt | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Receipt>(`/public/receipt/${bookingId}`).then(setR).catch(() => setError('Receipt not found.'));
  }, [bookingId]);

  if (error) return <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">{error}</div>;
  if (!r) return <div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-neutral-50 py-10">
      <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-center border-b pb-4 mb-4">
          <h1 className="text-lg font-bold">{r.store.name}</h1>
          <p className="text-xs text-neutral-500">{[r.store.addressLine, r.store.city, r.store.province].filter(Boolean).join(', ')}</p>
          <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
        </div>
        {r.booking && (
          <div className="mb-4 text-sm">
            <p className="font-medium">{r.booking.customer.fullName}{r.booking.pet && ` · ${r.booking.pet.name}`}</p>
            <p className="text-neutral-400 text-xs">{new Date(r.createdAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        )}
        <div className="divide-y text-sm">
          {r.lines.map((l, i) => (
            <div key={i} className="flex justify-between py-1.5"><span>{l.description}</span><span>{fmt(l.amountCents)}</span></div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between text-neutral-500"><span>Subtotal</span><span>{fmt(r.subtotalCents)}</span></div>
          {r.discountCents > 0 && <div className="flex justify-between text-green-600"><span>Discount{r.couponCode ? ` (${r.couponCode})` : ''}</span><span>−{fmt(r.discountCents)}</span></div>}
          {r.taxLines.map(t => <div key={t.component} className="flex justify-between text-neutral-500"><span>{t.component} ({(t.rate * 100).toFixed(2)}%)</span><span>{fmt(t.amountCents)}</span></div>)}
          {r.tipCents > 0 && <div className="flex justify-between text-neutral-500"><span>Tip</span><span>{fmt(r.tipCents)}</span></div>}
          <div className="flex justify-between font-bold pt-1 border-t"><span>Total</span><span>{fmt(r.totalCents)} CAD</span></div>
        </div>
        {r.payments.length > 0 && (
          <p className="mt-3 text-xs text-neutral-400">Paid by {r.payments.map(p => p.tender.replace(/_/g, ' ')).join(', ')}</p>
        )}
        <p className="mt-4 text-center text-xs text-neutral-400">Thank you for your business! 🐾</p>
      </div>
    </div>
  );
}
