export type PlayerEventType = "play" | "pause" | "seeked" | "timeupdate";

export interface IPlayerAdapter {
  init(): Promise<boolean>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(timeInSeconds: number): Promise<void>;
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
  getVideoElement(): HTMLVideoElement | null;
  onStateChange(cb: (event: PlayerEventType, time: number) => void): void;
  destroy(): void;
}
