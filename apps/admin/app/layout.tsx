import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OmniPOS Admin',
  description: 'Multi-tenant commerce platform — admin console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
