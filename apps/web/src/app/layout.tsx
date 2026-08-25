import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JustUs - Synchronized Watch Party with 1-on-1 Video Calling",
  description: "Watch Netflix & Amazon Prime Video together with ultra low-latency WebRTC video and real-time playback sync.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090A0F] text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
