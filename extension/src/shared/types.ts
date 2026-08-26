export type StreamingService = "netflix" | "prime" | "generic";

export interface SyncPayload {
  time: number;
  isPlaying?: boolean;
  videoUrl?: string;
  title?: string;
  sentAt: number;
  sender: string;
}

export interface ChatMessage {
  id?: string;
  sender: string;
  text: string;
  time: string;
}

export interface RoomSession {
  roomId: string;
  userName: string;
  isHost: boolean;
  service: StreamingService;
  videoUrl?: string;
  status: "idle" | "connecting" | "connected" | "disconnected";
  createdAt: number;
}

export type ExtensionMessage =
  | { type: "JOIN_ROOM"; payload: { roomId: string; userName: string; isHost?: boolean } }
  | { type: "LEAVE_ROOM" }
  | { type: "GET_STATUS" }
  | { type: "SET_STATUS"; payload: Partial<RoomSession> }
  | { type: "GET_LIVEKIT_TOKEN"; payload: { roomName: string; identity: string; isHost?: boolean } }
  | { type: "TOGGLE_AV"; payload: { mic?: boolean; camera?: boolean } };
