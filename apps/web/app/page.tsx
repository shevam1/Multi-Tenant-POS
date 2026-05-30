import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <p className="text-sm font-semibold text-brand">OmniPOS</p>
        <h1 className="mt-1 text-3xl font-bold">Franchise booking sites</h1>
        <p className="mt-2 text-neutral-500">
          Each tenant gets a branded booking site at{' '}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">/?tenant=slug</code>
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/book?tenant=pawsome"
          className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white hover:opacity-90">
          Pawsome Grooming — Book now
        </Link>
      </div>
    </main>
  );
}
