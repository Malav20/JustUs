import { IPlayerAdapter, PlayerEventType } from "./base-adapter";

export class NetflixAdapter implements IPlayerAdapter {
  private videoEl: HTMLVideoElement | null = null;
  private listeners: Array<(event: PlayerEventType, time: number) => void> = [];
  private observer: MutationObserver | null = null;
  private isDestroyed = false;
  private reqCounter = 0;

  async init(): Promise<boolean> {
    // 1. Inject script into MAIN world to access window.netflix
    this.injectMainWorldBridge();

    return new Promise((resolve) => {
      const checkVideo = () => {
        const video = document.querySelector(".watch-video video, .sizing-wrapper video, video") as HTMLVideoElement;
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

  private injectMainWorldBridge() {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("src/content/injected.js");
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn("[JustUs] Could not inject main world script:", e);
    }
  }

  private callBridge(action: string, payload: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const requestId = `req_${++this.reqCounter}_${Date.now()}`;
      
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve({ timeout: true });
      }, 1000);

      const handler = (event: MessageEvent) => {
        if (
          event.source === window &&
          event.data &&
          event.data.source === "JUSTUS_INJECTED" &&
          event.data.requestId === requestId
        ) {
          clearTimeout(timeout);
          window.removeEventListener("message", handler);
          resolve(event.data.data);
        }
      };

      window.addEventListener("message", handler);

      window.postMessage(
        {
          source: "JUSTUS_CONTENT",
          action,
          payload,
          requestId,
        },
        "*"
      );
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
    await this.callBridge("NETFLIX_PLAY");
    if (this.videoEl && this.videoEl.paused) {
      await this.videoEl.play().catch(() => {});
    }
  }

  async pause(): Promise<void> {
    await this.callBridge("NETFLIX_PAUSE");
    if (this.videoEl && !this.videoEl.paused) {
      this.videoEl.pause();
    }
  }

  async seek(timeInSeconds: number): Promise<void> {
    await this.callBridge("NETFLIX_SEEK", { time: timeInSeconds });
    if (this.videoEl && Math.abs(this.videoEl.currentTime - timeInSeconds) > 0.3) {
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
    if (this.observer) {
      this.observer.disconnect();
    }
    this.listeners = [];
  }
}
