import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
