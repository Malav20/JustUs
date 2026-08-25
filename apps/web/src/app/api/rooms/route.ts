import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";

// GET /api/rooms?id=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("id");

  if (!roomId) {
    return NextResponse.json({ error: "Room ID is required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("rooms")
      .select("*, room_participants(*)")
      .eq("id", roomId)
      .single();

    if (data && !error) {
      return NextResponse.json({ room: data });
    }
  } catch (e) {}

  // Return default room data if not found
  return NextResponse.json({
    room: {
      id: roomId,
      host_id: "host_auto",
      service: roomId.startsWith("tp_") ? "netflix" : "netflix",
      video_url: "https://www.netflix.com/browse",
      title: "JustUS Watch Room",
      playback_time: 0,
      is_playing: false,
    },
    isFallback: true,
  });
}

// PATCH /api/rooms - Update active videoUrl or room title dynamically
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, videoUrl, title, playback_time, is_playing } = body;

    if (!id) {
      return NextResponse.json({ error: "Room ID is required" }, { status: 400 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (videoUrl !== undefined) updates.video_url = videoUrl;
    if (title !== undefined) updates.title = title;
    if (playback_time !== undefined) updates.playback_time = playback_time;
    if (is_playing !== undefined) updates.is_playing = is_playing;

    const { data, error } = await supabaseAdmin
      .from("rooms")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ room: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/rooms - Create or upsert room
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      service,
      videoUrl,
      title,
      hostId,
      customId,
    } = body;

    const roomId = customId || nanoid(10);
    const validService = ["netflix", "prime", "generic"].includes(service)
      ? service
      : "generic";

    const { data, error } = await supabaseAdmin
      .from("rooms")
      .upsert({
        id: roomId,
        host_id: hostId || "host_" + nanoid(6),
        service: validService,
        video_url: videoUrl || "",
        title: title || "Watch Party",
        playback_time: 0,
        is_playing: false,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn("Supabase rooms table insert warning:", error.message);
      return NextResponse.json({
        room: {
          id: roomId,
          host_id: hostId || "host_" + nanoid(6),
          service: validService,
          video_url: videoUrl || "https://www.netflix.com/watch/80057281",
          title: title || "Watch Party",
          playback_time: 0,
          is_playing: false,
        },
        fallback: true,
      });
    }

    return NextResponse.json({ room: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/rooms?id=xxx - Delete room and associated data from DB when host leaves
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("id");

    if (!roomId) {
      return NextResponse.json({ error: "Room ID is required" }, { status: 400 });
    }

    // Clean up chat messages, room participants, and the room itself
    try {
      await supabaseAdmin.from("chat_messages").delete().eq("room_id", roomId);
    } catch (e) {}

    try {
      await supabaseAdmin.from("room_participants").delete().eq("room_id", roomId);
    } catch (e) {}

    const { error } = await supabaseAdmin.from("rooms").delete().eq("id", roomId);

    if (error) {
      console.warn("Supabase room delete note:", error.message);
    }

    return NextResponse.json({ success: true, message: `Room ${roomId} data deleted` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
