import { Button } from '@omnipos/ui';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div>
        <p className="text-sm font-medium text-brand">OmniPOS</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Admin Console</h1>
        <p className="mt-2 text-neutral-600">
          Multi-tenant commerce platform. HQ portal, store manager, reception POS, call center, and
          the groomer PWA live here.
        </p>
      </div>
      <div className="flex gap-3">
        <Button>Open dashboard</Button>
        <Button variant="secondary">View bookings</Button>
      </div>
      <p className="text-xs text-neutral-400">Scaffold (M0) — real screens land in M2/M3.</p>
    </main>
  );
}
