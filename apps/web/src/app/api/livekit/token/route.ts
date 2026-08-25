import { NextRequest, NextResponse } from "next/server";
import { createLiveKitToken } from "@/lib/livekit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomName, identity, name, isHost } = body;

    if (!roomName || !identity) {
      return NextResponse.json(
        { error: "roomName and identity are required" },
        { status: 400 }
      );
    }

    const token = await createLiveKitToken({
      roomName,
      participantIdentity: identity,
      participantName: name || identity,
      isHost: Boolean(isHost),
    });

    return NextResponse.json({
      token,
      wsUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://justus-0q7zbww8.livekit.cloud",
    });
  } catch (error: any) {
    console.error("Failed to generate LiveKit token:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create token" },
      { status: 500 }
    );
  }
}
