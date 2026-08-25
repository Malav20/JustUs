import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JustUS ❤️ • Strawberry & Lion's Private Cinema",
  description: "Private watch party & 1-on-1 face-to-face video calling crafted with love for Strawberry (Rutwa) & Lion (Malav). Forever our favorite movie dates.",
  applicationName: "JustUS • Malav & Rutwa",
  authors: [{ name: "Malav & Rutwa" }],
  keywords: ["JustUS", "Strawberry and Lion", "Rutwa and Malav", "Watch Party", "Private Cinema", "Movie Nights"],
  openGraph: {
    title: "JustUS ❤️ • Strawberry & Lion's Private Cinema",
    description: "Where Princess & her Mango watch movies together with perfect sync and live face-to-face video calling.",
    siteName: "JustUS • Malav & Rutwa",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "JustUS ❤️ • Strawberry & Lion's Private Cinema",
    description: "Where Princess & her Mango watch movies together with perfect sync and live face-to-face video calling.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090A12] text-slate-100 antialiased selection:bg-rose-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
