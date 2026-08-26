import { NextResponse } from "next/server";
import { corsHeaders, corsPreflight } from "@/lib/cors";

export const OPTIONS = corsPreflight;

export async function GET() {
  return NextResponse.json(
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      livekitUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL || "",
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://just-us-web.vercel.app",
    },
    { headers: corsHeaders }
  );
}
