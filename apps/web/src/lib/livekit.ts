import { AccessToken } from "livekit-server-sdk";

export const LIVEKIT_CONFIG = {
  apiKey: process.env.LIVEKIT_API_KEY || "APIukxmynV6MQkR",
  apiSecret: process.env.LIVEKIT_API_SECRET || "OiAeIxN1foN0UQTbvdWW4veSRC4rtTNZua64vC9Qzl3A",
  wsUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL || "wss://justus-0q7zbww8.livekit.cloud",
};

export async function createLiveKitToken({
  roomName,
  participantIdentity,
  participantName,
  isHost = false,
}: {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  isHost?: boolean;
}) {
  const at = new AccessToken(LIVEKIT_CONFIG.apiKey, LIVEKIT_CONFIG.apiSecret, {
    identity: participantIdentity,
    name: participantName,
    ttl: "6h",
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost,
  });

  return await at.toJwt();
}
