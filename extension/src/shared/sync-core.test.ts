import { describe, it, expect } from "vitest";
import {
  SYNC,
  clampLatencySeconds,
  expectedRemoteTime,
  computeHeartbeatCorrection,
  playTargetTime,
  shouldSeek,
} from "./sync-core";

describe("clampLatencySeconds", () => {
  it("returns elapsed seconds within bounds", () => {
    expect(clampLatencySeconds(1000, 1300, 0.4)).toBeCloseTo(0.3);
  });
  it("clamps to the max", () => {
    expect(clampLatencySeconds(0, 5000, 0.4)).toBe(0.4);
  });
  it("never returns negative (clock skew / future timestamps)", () => {
    expect(clampLatencySeconds(2000, 1000, 0.4)).toBe(0);
  });
});

describe("expectedRemoteTime", () => {
  it("credits latency only while playing", () => {
    expect(expectedRemoteTime(100, true, 0.3)).toBeCloseTo(100.3);
    expect(expectedRemoteTime(100, false, 0.3)).toBe(100);
  });
});

describe("computeHeartbeatCorrection — playing", () => {
  const base = { payloadTime: 100, isPlaying: true, sentAt: 1000, now: 1000 };

  it("hard-seeks when drift exceeds the play threshold", () => {
    const c = computeHeartbeatCorrection({ ...base, currentTime: 50 });
    expect(c.seekTo).toBeCloseTo(100);
    expect(c.playbackRate).toBe(1.0);
    expect(c.ensurePlaying).toBe(true);
  });

  it("nudges faster when the viewer is behind the host", () => {
    const c = computeHeartbeatCorrection({ ...base, currentTime: 99.5 }); // delta +0.5
    expect(c.seekTo).toBeUndefined();
    expect(c.playbackRate).toBe(SYNC.RATE_FAST);
  });

  it("nudges slower when the viewer is ahead of the host", () => {
    const c = computeHeartbeatCorrection({ ...base, currentTime: 100.5 }); // delta -0.5
    expect(c.playbackRate).toBe(SYNC.RATE_SLOW);
  });

  it("holds normal rate inside the deadband", () => {
    const c = computeHeartbeatCorrection({ ...base, currentTime: 100.05 }); // delta +0.05
    expect(c.playbackRate).toBe(1.0);
    expect(c.seekTo).toBeUndefined();
  });
});

describe("computeHeartbeatCorrection — paused", () => {
  const base = { payloadTime: 100, isPlaying: false, sentAt: 1000, now: 1000 };

  it("always requests pause and normal rate", () => {
    const c = computeHeartbeatCorrection({ ...base, currentTime: 100 });
    expect(c.ensurePaused).toBe(true);
    expect(c.playbackRate).toBe(1.0);
    expect(c.ensurePlaying).toBeUndefined();
  });

  it("seeks to the host position when paused drift is significant", () => {
    const c = computeHeartbeatCorrection({ ...base, currentTime: 105 });
    expect(c.seekTo).toBe(100);
    expect(c.ensurePaused).toBe(true);
  });

  it("does not seek for tiny paused drift", () => {
    const c = computeHeartbeatCorrection({ ...base, currentTime: 100.1 });
    expect(c.seekTo).toBeUndefined();
  });
});

describe("playTargetTime", () => {
  it("adds small latency to the reported time", () => {
    expect(playTargetTime(100, 1000, 1300)).toBeCloseTo(100.3);
  });
  it("ignores absurd latency (stale event)", () => {
    expect(playTargetTime(100, 0, 10_000)).toBe(100);
  });
});

describe("shouldSeek", () => {
  it("seeks when far enough from target", () => {
    expect(shouldSeek(100, 105)).toBe(true);
  });
  it("does not seek within threshold", () => {
    expect(shouldSeek(100, 100.2)).toBe(false);
  });
  it("never seeks toward the 0-1s startup window", () => {
    expect(shouldSeek(0, 0.9)).toBe(false);
  });
});
