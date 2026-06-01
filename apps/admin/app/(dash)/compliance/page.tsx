'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getToken } from '@/lib/api';

interface VaccRecord {
  vaccineType: string;
  expiresAt: string | null;
  status: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_DATE';
}

interface PetCompliance {
  petId: string;
  customerId: string;
  petName: string;
  breed: string | null;
  ownerName: string;
  ownerPhone: string | null;
  overallStatus: 'COMPLIANT' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_RECORDS';
  vaccinations: VaccRecord[];
}

const ROW_STATUS: Record<PetCompliance['overallStatus'], string> = {
  COMPLIANT: 'bg-green-50',
  EXPIRING_SOON: 'bg-amber-50',
  EXPIRED: 'bg-red-50',
  NO_RECORDS: 'bg-neutral-50',
};
const BADGE: Record<PetCompliance['overallStatus'], string> = {
  COMPLIANT: 'bg-green-100 text-green-700',
  EXPIRING_SOON: 'bg-amber-100 text-amber-700',
  EXPIRED: 'bg-red-100 text-red-700',
  NO_RECORDS: 'bg-neutral-100 text-neutral-500',
};
const BADGE_LABEL: Record<PetCompliance['overallStatus'], string> = {
  COMPLIANT: '✓ Compliant',
  EXPIRING_SOON: '⚠ Expiring soon',
  EXPIRED: '✗ Expired',
  NO_RECORDS: 'No records',
};

export default function CompliancePage() {
  const router = useRouter();
  const [data, setData] = useState<PetCompliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | PetCompliance['overallStatus']>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!getToken()) { router.push('/login'); return; }
    apiFetch<PetCompliance[]>('/vaccinations/compliance')
      .then(setData)
      .finally(() => setLoading(false));
  }, [router]);

  const q = search.trim().toLowerCase();
  const filtered = data
    .filter(p => filter === 'ALL' || p.overallStatus === filter)
    .filter(p => !q || p.petName.toLowerCase().includes(q) || p.ownerName.toLowerCase().includes(q));

  const counts = {
    total: data.length,
    compliant: data.filter(p => p.overallStatus === 'COMPLIANT').length,
    expiringSoon: data.filter(p => p.overallStatus === 'EXPIRING_SOON').length,
    expired: data.filter(p => p.overallStatus === 'EXPIRED').length,
    noRecords: data.filter(p => p.overallStatus === 'NO_RECORDS').length,
  };

  return (
    <div>
      <main className="mx-auto max-w-5xl px-8 py-8 space-y-6">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Vaccination Compliance Report</h1>
          <input
            className="w-64 rounded-md border px-3 py-1.5 text-sm placeholder:text-muted-foreground"
            placeholder="Search by owner or pet name…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {/* Summary chips */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Compliant', count: counts.compliant, style: 'border-green-200 bg-green-50', text: 'text-green-700' },
            { label: 'Expiring ≤30 days', count: counts.expiringSoon, style: 'border-amber-200 bg-amber-50', text: 'text-amber-700' },
            { label: 'Expired', count: counts.expired, style: 'border-red-200 bg-red-50', text: 'text-red-700' },
            { label: 'No records', count: counts.noRecords, style: 'border-neutral-200 bg-neutral-50', text: 'text-neutral-500' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-4 shadow-sm ${s.style}`}>
              <p className={`text-2xl font-bold ${s.text}`}>{s.count}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {(['ALL', 'EXPIRED', 'EXPIRING_SOON', 'NO_RECORDS', 'COMPLIANT'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition border ${filter === f ? 'bg-brand text-white border-brand' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
              {f === 'ALL' ? `All (${data.length})` : f.replace(/_/g, ' ').toLowerCase()}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 tracking-wide">
                <tr>
                  {['Pet', 'Owner', 'Status', 'Vaccinations', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(pet => (
                  <tr key={pet.petId} className={`${ROW_STATUS[pet.overallStatus]} hover:opacity-90`}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{pet.petName}</p>
                      {pet.breed && <p className="text-neutral-500 text-xs">{pet.breed}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p>{pet.ownerName}</p>
                      {pet.ownerPhone && <p className="text-neutral-500 text-xs">{pet.ownerPhone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[pet.overallStatus]}`}>
                        {BADGE_LABEL[pet.overallStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {pet.vaccinations.length === 0 ? (
                        <span className="text-neutral-400 text-xs">None on file</span>
                      ) : (
                        <div className="space-y-0.5">
                          {pet.vaccinations.map((v, i) => (
                            <p key={i} className="text-xs">
                              {v.vaccineType}
                              {v.expiresAt && (
                                <span className={`ml-1 ${v.status === 'EXPIRED' ? 'text-red-600 font-medium' : v.status === 'EXPIRING_SOON' ? 'text-amber-600' : 'text-neutral-400'}`}>
                                  — {new Date(v.expiresAt).toLocaleDateString('en-CA')}
                                </span>
                              )}
                            </p>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/clients/${pet.customerId}`}
                        className="text-xs text-brand hover:underline">
                        View pet →
                      </a>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-400">No pets match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
