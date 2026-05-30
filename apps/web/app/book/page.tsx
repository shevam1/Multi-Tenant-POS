import { Suspense } from 'react';
import BookFlow from './book-flow';

export const dynamic = 'force-dynamic';

export default function BookPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-neutral-400">Loading…</div>}>
      <BookFlow />
    </Suspense>
  );
}
