# JustUs — Synchronized Watch Party & 1-on-1 WebRTC Video Calling

A production-ready watch party platform for **Netflix** and **Amazon Prime Video** featuring ultra low-latency WebRTC face-to-face video calling and sub-500ms playback synchronization.

Built with **Next.js (Vercel)**, **Chrome Manifest V3 Extension**, **Supabase Realtime**, and **LiveKit Cloud**.

---

## Features

- **Drift-Free Playback Sync**: Real-time bi-directional play/pause/seek synchronization via Supabase Realtime WebSocket broadcast channels with latency compensation and loop feedback locks (<500ms drift).
- **1-on-1 WebRTC Video & Audio**: Crystal clear face-to-face calling powered by LiveKit Cloud SFU, featuring draggable PIP, microphone mute, camera toggling, and ping/drift monitoring.
- **Isolated Shadow DOM Overlay**: Injected UI runs entirely inside an isolated `shadowRoot` so Netflix/Prime Video stylesheets cannot break the video call interface.
- **Netflix & Amazon Prime Adapters**: Resilient player hooks using mutation observers and HTML5/Fiber player controls.
- **Instant Room Generation & Deep Links**: One-click party creation with shareable `/join/[roomId]` invite links.

---

## Architecture

```text
                                  +----------------------------------------------+
                                  |          Next.js App (Vercel Free)           |
                                  |   - Room Management & Auth                   |
                                  |   - LiveKit WebRTC Token API                 |
                                  |   - Supabase Schema & Realtime Server        |
                                  +-----------------------+----------------------+
                                                          |
                                     +--------------------+--------------------+
                                     |                                         |
                              +------v------+                           +------v------+
                              |  LiveKit    |                           |  Supabase   |
                              |  Cloud SFU  |                           |  Realtime   |
                              | (Audio/Vid) |                           | (Broadcast) |
                              +------+------+                           +------+------+
                                     |                                         |
                +--------------------+-----------------------------------------+--------------------+
                |                                                                                   |
      +---------v---------------+                                                         +---------v---------------+
      |   User A (Host/Peer)    |                                                         |   User B (Client/Peer)  |
      |  +-------------------+  |                                                         |  +-------------------+  |
      |  |  Chrome Extension |  |                                                         |  |  Chrome Extension |  |
      |  | +---------------+ |  |                                                         |  | +---------------+ |  |
      |  | | Video Call UI | |  |                                                         |  | | Video Call UI | |  |
      |  | +---------------+ |  |                                                         |  | +---------------+ |  |
      |  | | Content Script| |  |                                                         |  | | Content Script| |  |
      |  | +-------+-------+ |  |                                                         |  | +-------+-------+ |  |
      |  +---------+---------+  |                                                         |  +---------+---------+  |
      |            |            |                                                         |            |            |
      |            v            |                                                         |            v            |
      |   Netflix / Prime Tab   | <====== Bi-directional Playback Sync (Drift < 500ms) ==> |   Netflix / Prime Tab   |
      +-------------------------+                                                         +-------------------------+
```

---

## Quickstart & Setup

### 1. Database Setup (Supabase)
Run the SQL script located in [`supabase/schema.sql`](file:///c:/Vedora%20Labs/JustUs/supabase/schema.sql) in your Supabase SQL Editor to create the `rooms` and `chat_messages` tables with Realtime broadcast publications enabled.

### 2. Run the Next.js Web App
```bash
cd apps/web
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the web dashboard and room creation interface.

### 3. Load the Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `extension/dist` directory (after running `npm run build:ext` or `npm run build`).

---

## Environment Variables & Configuration

Create a `.env.local` file inside `apps/web/` (refer to [`apps/web/.env.example`](file:///c:/Vedora%20Labs/JustUs/apps/web/.env.example)):

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# LiveKit WebRTC Configuration
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### GitHub Actions & CI/CD Deployment Secrets
Configure the following secrets in **GitHub Repository -> Settings -> Secrets and variables -> Actions**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `NEXT_PUBLIC_LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `NEXT_PUBLIC_APP_URL`

