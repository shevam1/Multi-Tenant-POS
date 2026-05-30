import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Book your appointment | OmniPOS',
  description: 'Franchise-branded online booking powered by OmniPOS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
