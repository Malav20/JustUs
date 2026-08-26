export type StreamingService = "netflix" | "prime" | "youtube" | "generic";

export interface SyncPayload {
  time: number;
  isPlaying?: boolean;
  videoUrl?: string;
  title?: string;
  sentAt: number;
  sender: string;
  isHost?: boolean;
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
  | {
      type: "JOIN_ROOM";
      payload: {
        roomId: string;
        userName: string;
        isHost?: boolean;
        videoUrl?: string;
        service?: StreamingService;
      };
    }
  | { type: "LEAVE_ROOM"; payload?: { roomId?: string; isHost?: boolean } }
  | { type: "GET_STATUS" }
  | { type: "SET_STATUS"; payload: Partial<RoomSession> }
  | { type: "GET_LIVEKIT_TOKEN"; payload: { roomName: string; identity: string; isHost?: boolean } };
