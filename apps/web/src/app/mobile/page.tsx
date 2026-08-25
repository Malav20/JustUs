"use client";

import { Suspense } from "react";
import { MobileWatchParty } from "@/components/MobileWatchParty";

export default function MobilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#090A0F] text-white flex items-center justify-center text-sm font-bold">Loading JustUS Mobile...</div>}>
      <MobileWatchParty />
    </Suspense>
  );
}
