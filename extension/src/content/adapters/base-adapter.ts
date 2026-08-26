export type PlayerEventType = "play" | "pause" | "seeked" | "timeupdate";

export interface IPlayerAdapter {
  init(): Promise<boolean>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(timeInSeconds: number): Promise<void>;
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
  onStateChange(cb: (event: PlayerEventType, time: number) => void): void;
  setPlaybackRate(rate: number): void;
  destroy(): void;
}
