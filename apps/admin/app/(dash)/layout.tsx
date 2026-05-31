import { AppShell } from '@/components/app-shell';

/**
 * Shared layout for all authenticated admin screens: wraps children in the
 * sidebar + topbar app shell. Route groups don't affect URLs, so pages moved
 * under (dash) keep their original paths (e.g. /dashboard).
 */
export default function DashLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
