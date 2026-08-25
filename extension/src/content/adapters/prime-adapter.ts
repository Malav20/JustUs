import { IPlayerAdapter, PlayerEventType } from "./base-adapter";

export class PrimeAdapter implements IPlayerAdapter {
  private videoEl: HTMLVideoElement | null = null;
  private listeners: Array<(event: PlayerEventType, time: number) => void> = [];
  private isDestroyed = false;

  async init(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkVideo = () => {
        const video = document.querySelector(
          ".webPlayerUIContainer video, .rendererContainer video, video[src*='blob:'], video"
        ) as HTMLVideoElement;

        if (video) {
          this.videoEl = video;
          this.attachEventListeners();
          resolve(true);
          return;
        }

        if (this.isDestroyed) {
          resolve(false);
          return;
        }

        setTimeout(checkVideo, 500);
      };

      checkVideo();
    });
  }

  private attachEventListeners() {
    if (!this.videoEl) return;

    this.videoEl.addEventListener("play", () => this.emit("play"));
    this.videoEl.addEventListener("pause", () => this.emit("pause"));
    this.videoEl.addEventListener("seeked", () => this.emit("seeked"));
    this.videoEl.addEventListener("timeupdate", () => this.emit("timeupdate"));
  }

  private emit(event: PlayerEventType) {
    if (!this.videoEl) return;
    const time = this.videoEl.currentTime;
    this.listeners.forEach((cb) => cb(event, time));
  }

  async play(): Promise<void> {
    if (this.videoEl) {
      await this.videoEl.play().catch(() => {
        // Fallback: trigger Prime play button in DOM
        const playBtn = document.querySelector("button.paused, button[aria-label*='Play']") as HTMLButtonElement;
        playBtn?.click();
      });
    }
  }

  async pause(): Promise<void> {
    if (this.videoEl) {
      this.videoEl.pause();
    }
  }

  async seek(timeInSeconds: number): Promise<void> {
    if (this.videoEl) {
      this.videoEl.currentTime = timeInSeconds;
    }
  }

  getCurrentTime(): number {
    return this.videoEl?.currentTime || 0;
  }

  getDuration(): number {
    return this.videoEl?.duration || 0;
  }

  isPlaying(): boolean {
    return Boolean(this.videoEl && !this.videoEl.paused && !this.videoEl.ended);
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoEl;
  }

  onStateChange(cb: (event: PlayerEventType, time: number) => void): void {
    this.listeners.push(cb);
  }

  destroy(): void {
    this.isDestroyed = true;
    this.listeners = [];
  }
}
