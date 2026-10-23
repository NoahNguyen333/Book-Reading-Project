import type { Metadata } from 'next';
import { Lora, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { LocaleProvider } from '@/lib/locale';

const lora = Lora({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Family Reading Room',
  description: 'Shared reading experiences across distances for families',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${lora.variable} ${plusJakarta.variable}`}>
      <body className="antialiased min-h-screen font-sans selection:bg-[#F3E2B4] selection:text-[#23211E]">
        <LocaleProvider>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
