// Pure, DOM-free playback-sync math.
//
// This is the single source of truth for JustUs' watch-party synchronization
// decisions. The extension SyncEngine consumes it directly; the injected
// `apps/web/public/party-overlay.js` mirrors the same constants and logic by
// hand (it is a standalone vanilla script that cannot import from here — see
// the note at the top of that file). Keeping the math here makes it unit-testable
// and prevents the two implementations from drifting apart silently.

export const SYNC = {
  /** Cadence for broadcasting local playback state to peers. */
  HEARTBEAT_INTERVAL_MS: 2000,
  /** After a local play/pause/seek, ignore passive heartbeats for this long
   *  so peer/stream startup + buffering can settle. */
  USER_ACTION_GRACE_MS: 3500,
  /** Echo-prevention lock window after applying a remote action. */
  SYNC_ACTION_COOLDOWN_MS: 400,
  /** +/- deadband (seconds) within which playbackRate is never nudged. */
  RATE_DEADBAND_S: 0.15,
  /** Gentle catch-up / slow-down rates applied just outside the deadband. */
  RATE_FAST: 1.04,
  RATE_SLOW: 0.96,
  /** Drift (seconds) above which we hard-seek instead of nudging while playing. */
  HARD_SEEK_WHILE_PLAYING_S: 1.2,
  /** Drift (seconds) above which we correct position while paused. */
  HARD_SEEK_WHILE_PAUSED_S: 0.2,
  /** Max latency (seconds) credited to a heartbeat's timestamp. */
  HEARTBEAT_MAX_LATENCY_S: 0.4,
  /** Max latency (seconds) credited to a discrete PLAY event. */
  PLAY_MAX_LATENCY_S: 1.5,
  /** Seek dedupe threshold (seconds) for discrete play/seek events. */
  EVENT_SEEK_THRESHOLD_S: 0.35,
  /** Ignore any position at/below this (seconds) as stream-startup noise. */
  MIN_MEANINGFUL_TIME_S: 0.5,
} as const;

/** Latency in seconds between a payload's send time and now, clamped to [0, max]. */
export function clampLatencySeconds(sentAt: number, now: number, maxSeconds: number): number {
  return Math.max(0, Math.min(maxSeconds, (now - sentAt) / 1000));
}

/** The host's expected current position, crediting latency only while playing. */
export function expectedRemoteTime(payloadTime: number, isPlaying: boolean, latencySeconds: number): number {
  return isPlaying ? payloadTime + latencySeconds : payloadTime;
}

export interface HeartbeatInput {
  /** Viewer's current playback position (seconds). */
  currentTime: number;
  /** Host position reported in the heartbeat (seconds). */
  payloadTime: number;
  /** Whether the host is playing. */
  isPlaying: boolean;
  /** Heartbeat send timestamp (ms epoch). */
  sentAt: number;
  /** Now (ms epoch). */
  now: number;
}

/** Intended corrections for the viewer; the caller applies them to its player. */
export interface HeartbeatCorrection {
  /** Seek the local player to this position (seconds), if set. */
  seekTo?: number;
  /** Set the local playbackRate to this value, if set. */
  playbackRate?: number;
  /** Ensure the local player is playing (caller no-ops if already playing). */
  ensurePlaying?: boolean;
  /** Ensure the local player is paused (caller no-ops if already paused). */
  ensurePaused?: boolean;
}

/**
 * Decide how a viewer should correct toward the host's heartbeat.
 * Pure and side-effect free: the returned actions are applied by the caller,
 * which lets the same decision logic run in the extension, the overlay, and tests.
 */
export function computeHeartbeatCorrection(input: HeartbeatInput): HeartbeatCorrection {
  const latency = clampLatencySeconds(input.sentAt, input.now, SYNC.HEARTBEAT_MAX_LATENCY_S);
  const expected = expectedRemoteTime(input.payloadTime, input.isPlaying, latency);
  const delta = expected - input.currentTime;
  const drift = Math.abs(delta);
  const correction: HeartbeatCorrection = {};

  if (input.isPlaying) {
    correction.ensurePlaying = true;
    if (drift > SYNC.HARD_SEEK_WHILE_PLAYING_S && expected > SYNC.MIN_MEANINGFUL_TIME_S) {
      correction.seekTo = expected;
      correction.playbackRate = 1.0;
    } else if (delta > SYNC.RATE_DEADBAND_S) {
      correction.playbackRate = SYNC.RATE_FAST;
    } else if (delta < -SYNC.RATE_DEADBAND_S) {
      correction.playbackRate = SYNC.RATE_SLOW;
    } else {
      correction.playbackRate = 1.0;
    }
  } else {
    correction.playbackRate = 1.0;
    correction.ensurePaused = true;
    if (drift > SYNC.HARD_SEEK_WHILE_PAUSED_S && expected > SYNC.MIN_MEANINGFUL_TIME_S) {
      correction.seekTo = expected;
    }
  }
  return correction;
}

/** Target position for a discrete remote PLAY, crediting small latency. */
export function playTargetTime(payloadTime: number, sentAt: number, now: number): number {
  const latency = Math.max(0, (now - sentAt) / 1000);
  return payloadTime + (latency > 0 && latency < SYNC.PLAY_MAX_LATENCY_S ? latency : 0);
}

/** Whether a discrete seek to `targetTime` is worth applying from `currentTime`. */
export function shouldSeek(
  currentTime: number,
  targetTime: number,
  threshold: number = SYNC.EVENT_SEEK_THRESHOLD_S
): boolean {
  return targetTime > 1.0 && Math.abs(currentTime - targetTime) > threshold;
}
