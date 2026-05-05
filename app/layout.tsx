import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BetaBanner from '@/src/components/BetaBanner'

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: 'Fides',
  description: 'Vendor Risk Assessment Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col"><BetaBanner />{children}</body>
    </html>
  );
}
