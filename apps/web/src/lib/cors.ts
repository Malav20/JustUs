import { NextResponse } from "next/server";

// Shared CORS headers for all public API routes (extension, overlay, and
// native webviews call these cross-origin).
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

// Standard CORS preflight handler — re-export as a route's `OPTIONS`.
export function corsPreflight() {
  return NextResponse.json({}, { headers: corsHeaders });
}
