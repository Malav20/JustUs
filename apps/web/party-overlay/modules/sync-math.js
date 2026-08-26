// Mirrors extension/src/shared/sync-core.ts — keep in lock-step with that file.
const SYNC = {
  HEARTBEAT_INTERVAL_MS: 2000,
  USER_ACTION_GRACE_MS: 3500,
  SYNC_ACTION_COOLDOWN_MS: 400,
  RATE_DEADBAND_S: 0.15,
  RATE_FAST: 1.04,
  RATE_SLOW: 0.96,
  HARD_SEEK_WHILE_PLAYING_S: 1.2,
  HARD_SEEK_WHILE_PAUSED_S: 0.2,
  HEARTBEAT_MAX_LATENCY_S: 0.4,
  PLAY_MAX_LATENCY_S: 1.5,
  EVENT_SEEK_THRESHOLD_S: 0.35,
  MIN_MEANINGFUL_TIME_S: 0.5,
};

function clampLatencySeconds(sentAt, now, maxSeconds) {
  return Math.max(0, Math.min(maxSeconds, (now - sentAt) / 1000));
}

function expectedRemoteTime(payloadTime, isPlaying, latencySeconds) {
  return isPlaying ? payloadTime + latencySeconds : payloadTime;
}

function playTargetTime(payloadTime, sentAt, now) {
  const latency = Math.max(0, (now - sentAt) / 1000);
  return payloadTime + (latency > 0 && latency < SYNC.PLAY_MAX_LATENCY_S ? latency : 0);
}

function shouldSeek(currentTime, targetTime, threshold = SYNC.EVENT_SEEK_THRESHOLD_S) {
  return targetTime > 1.0 && Math.abs(currentTime - targetTime) > threshold;
}

function computeHeartbeatCorrection(input) {
  const latency = clampLatencySeconds(input.sentAt, input.now, SYNC.HEARTBEAT_MAX_LATENCY_S);
  const expected = expectedRemoteTime(input.payloadTime, input.isPlaying, latency);
  const delta = expected - input.currentTime;
  const drift = Math.abs(delta);
  const correction = {};

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
