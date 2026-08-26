import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// In-memory fallback cache in case DB table columns vary
const memoryChatCache = new Map<string, Array<{ id: string; sender: string; text: string; time: string }>>();

// GET /api/chat?roomId=xxx - Fetch chat history
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json({ error: "roomId is required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("chat_messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (data && !error && data.length > 0) {
      const formatted = data.map((item: any) => ({
        id: item.id || String(Math.random()),
        sender: item.sender || item.user_name || item.username || "Friend",
        text: item.message || item.text || item.content || "",
        time: item.created_at
          ? new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }));
      return NextResponse.json({ messages: formatted });
    }
  } catch (err) {
    console.warn("Supabase chat fetch notice:", err);
  }

  // Fallback to memory cache if DB table is unpopulated
  const cached = memoryChatCache.get(roomId) || [];
  return NextResponse.json({ messages: cached });
}

// POST /api/chat - Save chat message
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId, sender, text, time } = body;

    if (!roomId || !text) {
      return NextResponse.json({ error: "roomId and text are required" }, { status: 400 });
    }

    const newMsg = {
      id: "msg_" + Math.random().toString(36).substring(2, 9),
      sender: sender || "Viewer",
      text: text.trim(),
      time: time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    // Store in memory cache
    const roomList = memoryChatCache.get(roomId) || [];
    roomList.push(newMsg);
    if (roomList.length > 200) roomList.shift();
    memoryChatCache.set(roomId, roomList);

    // Persist to Supabase chat_messages
    try {
      await supabaseAdmin.from("chat_messages").insert({
        room_id: roomId,
        sender: sender || "Viewer",
        message: text.trim(),
        created_at: new Date().toISOString(),
      });
    } catch (e) {}

    return NextResponse.json({ success: true, message: newMsg });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
