import { StreamingService } from "./types";

export function inferServiceFromUrl(url: string): StreamingService {
  if (url.includes("netflix.com")) return "netflix";
  if (url.includes("primevideo.com") || url.includes("amazon.")) return "prime";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  return "generic";
}

export function isStreamingUrl(url: string): boolean {
  return (
    url.includes("netflix.com") ||
    url.includes("primevideo.com") ||
    url.includes("amazon.") ||
    url.includes("youtube.com") ||
    url.includes("youtu.be")
  );
}

export function buildPartyNavigateUrl(
  videoUrl: string,
  roomId: string,
  userName: string
): string {
  const base = (videoUrl || "").trim() || "https://www.netflix.com/browse";
  const cleanUrl = base.split("#")[0];
  return `${cleanUrl}#tp=${encodeURIComponent(roomId)}&user=${encodeURIComponent(userName)}`;
}

export async function fetchRoomById(
  roomId: string,
  apiBase: string
): Promise<{ video_url?: string; service?: string; title?: string } | null> {
  try {
    const res = await fetch(`${apiBase}/api/rooms?id=${encodeURIComponent(roomId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.room ?? null;
  } catch {
    return null;
  }
}
