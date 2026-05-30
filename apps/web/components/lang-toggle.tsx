'use client';

import { usePathname, useSearchParams, useRouter } from 'next/navigation';

/** Simple en/fr toggle stored in ?lang= search param. */
export function LangToggle() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const lang = params.get('lang') ?? 'en';

  function toggle() {
    const next = lang === 'en' ? 'fr' : 'en';
    const sp = new URLSearchParams(params.toString());
    sp.set('lang', next);
    router.replace(`${pathname}?${sp.toString()}`);
  }

  return (
    <button
      onClick={toggle}
      className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-neutral-50"
      aria-label="Toggle language"
    >
      {lang === 'en' ? 'FR' : 'EN'}
    </button>
  );
}
