import { Button } from '@omnipos/ui';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div>
        <p className="text-sm font-medium text-brand">Pawsome Grooming Co.</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Book your pet&rsquo;s spa day</h1>
        <p className="mt-2 text-neutral-600">
          Franchise-branded booking site. Resolves the tenant by hostname and feeds bookings
          straight into the admin console.
        </p>
      </div>
      <div>
        <Button>Book now</Button>
      </div>
      <p className="text-xs text-neutral-400">Scaffold (M0) — real booking flow lands in M3.</p>
    </main>
  );
}
