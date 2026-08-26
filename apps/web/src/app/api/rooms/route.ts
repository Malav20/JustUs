import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase.server";
import { corsHeaders, corsPreflight } from "@/lib/cors";

export const OPTIONS = corsPreflight;

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// GET /api/rooms?id=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("id")?.trim().toUpperCase();

  if (!roomId) {
    return NextResponse.json({ error: "Room ID is required" }, { status: 400, headers: corsHeaders });
  }

  try {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (data && !error) {
      return NextResponse.json({ room: data }, { headers: corsHeaders });
    }
  } catch (e) {}

  // Return default room data if not found
  return NextResponse.json(
    {
      room: {
        id: roomId,
        host_id: "host_auto",
        service: "netflix",
        video_url: "https://www.netflix.com/browse",
        title: "JustUS Watch Room",
        playback_time: 0,
        is_playing: false,
      },
      isFallback: true,
    },
    { headers: corsHeaders }
  );
}

// PATCH /api/rooms - Update active videoUrl or room title dynamically
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, videoUrl, title, playback_time, is_playing } = body;

    if (!id) {
      return NextResponse.json({ error: "Room ID is required" }, { status: 400, headers: corsHeaders });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (videoUrl !== undefined) updates.video_url = videoUrl;
    if (title !== undefined) updates.title = title;
    if (playback_time !== undefined) updates.playback_time = playback_time;
    if (is_playing !== undefined) updates.is_playing = is_playing;

    const { data, error } = await supabaseAdmin
      .from("rooms")
      .update(updates)
      .eq("id", id.trim().toUpperCase())
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json({ room: data }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
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

    const roomId = (customId || generateRoomCode()).trim().toUpperCase();
    const validService = ["netflix", "prime", "generic"].includes(service)
      ? service
      : "generic";

    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("rooms")
      .upsert(
        {
          id: roomId,
          host_id: hostId || "host_" + generateRoomCode(),
          service: validService,
          video_url: videoUrl || "",
          title: title || "Watch Party",
          playback_time: 0,
          is_playing: false,
          created_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (error) {
      console.warn("Supabase rooms table insert warning:", error.message);
      // Fallback insert attempt
      const insertRes = await supabaseAdmin.from("rooms").insert({
        id: roomId,
        host_id: hostId || "host_" + generateRoomCode(),
        service: validService,
        video_url: videoUrl || "",
        title: title || "Watch Party",
        playback_time: 0,
        is_playing: false,
        created_at: nowIso,
        updated_at: nowIso,
      }).select().single();

      if (insertRes.data) {
        return NextResponse.json({ room: insertRes.data }, { headers: corsHeaders });
      }

      return NextResponse.json(
        {
          room: {
            id: roomId,
            host_id: hostId || "host_" + generateRoomCode(),
            service: validService,
            video_url: videoUrl || "",
            title: title || "Watch Party",
            playback_time: 0,
            is_playing: false,
          },
          fallback: true,
        },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json({ room: data }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}

// DELETE /api/rooms?id=xxx - Delete room and its chat messages from DB when host leaves
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawId = searchParams.get("id");
    const roomId = rawId?.trim().toUpperCase();

    if (!roomId) {
      return NextResponse.json({ error: "Room ID is required" }, { status: 400, headers: corsHeaders });
    }

    // Clean up chat messages and the room itself
    try {
      await supabaseAdmin.from("chat_messages").delete().eq("room_id", roomId);
    } catch (e) {}

    const { error } = await supabaseAdmin.from("rooms").delete().eq("id", roomId);

    if (error) {
      console.warn("Supabase room delete note:", error.message);
    }

    return NextResponse.json({ success: true, message: `Room ${roomId} data purged from DB` }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}
