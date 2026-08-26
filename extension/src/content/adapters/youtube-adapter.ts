import { IPlayerAdapter, PlayerEventType } from "./base-adapter";

export class YouTubeAdapter implements IPlayerAdapter {
  private videoEl: HTMLVideoElement | null = null;
  private listeners: Array<(event: PlayerEventType, time: number) => void> = [];
  private isDestroyed = false;

  async init(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkVideo = () => {
        const video = (document.querySelector(".html5-main-video") ||
          document.querySelector("video")) as HTMLVideoElement;
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

  private getMoviePlayer(): any {
    try {
      return (
        document.getElementById("movie_player") ||
        document.querySelector(".html5-video-player")
      );
    } catch (e) {
      return null;
    }
  }

  async play(): Promise<void> {
    const moviePlayer = this.getMoviePlayer();
    if (moviePlayer && typeof moviePlayer.playVideo === "function") {
      try {
        moviePlayer.playVideo();
      } catch (e) {}
    }

    const largePlayBtn = document.querySelector(".ytp-large-play-button, .ytp-cued-thumbnail-overlay-image") as HTMLElement;
    if (largePlayBtn && largePlayBtn.offsetParent !== null) {
      try {
        largePlayBtn.click();
      } catch (e) {}
    }

    const playBtn = document.querySelector(".ytp-play-button, button.player-control-play-pause-icon, .player-controls-middle button") as HTMLElement;
    if (playBtn && this.videoEl?.paused) {
      try {
        playBtn.click();
      } catch (e) {}
    }

    if (this.videoEl && this.videoEl.paused) {
      await this.videoEl.play().catch(() => {});
    }
  }

  async pause(): Promise<void> {
    const moviePlayer = this.getMoviePlayer();
    if (moviePlayer && typeof moviePlayer.pauseVideo === "function") {
      try {
        moviePlayer.pauseVideo();
      } catch (e) {}
    }

    const playBtn = document.querySelector(".ytp-play-button") as HTMLElement;
    if (playBtn && this.videoEl && !this.videoEl.paused) {
      try {
        playBtn.click();
      } catch (e) {}
    }

    if (this.videoEl && !this.videoEl.paused) {
      this.videoEl.pause();
    }
  }

  async seek(timeInSeconds: number): Promise<void> {
    const moviePlayer = this.getMoviePlayer();
    if (moviePlayer && typeof moviePlayer.seekTo === "function") {
      try {
        moviePlayer.seekTo(timeInSeconds, true);
      } catch (e) {}
    }

    if (this.videoEl) {
      this.videoEl.currentTime = timeInSeconds;
    }
  }

  getCurrentTime(): number {
    const moviePlayer = this.getMoviePlayer();
    if (moviePlayer && typeof moviePlayer.getCurrentTime === "function") {
      const t = moviePlayer.getCurrentTime();
      if (typeof t === "number" && !isNaN(t) && t > 0) return t;
    }
    return this.videoEl?.currentTime || 0;
  }

  getDuration(): number {
    const moviePlayer = this.getMoviePlayer();
    if (moviePlayer && typeof moviePlayer.getDuration === "function") {
      const d = moviePlayer.getDuration();
      if (typeof d === "number" && !isNaN(d) && d > 0) return d;
    }
    return this.videoEl?.duration || 0;
  }

  isPlaying(): boolean {
    const moviePlayer = this.getMoviePlayer();
    if (moviePlayer && typeof moviePlayer.getPlayerState === "function") {
      const s = moviePlayer.getPlayerState();
      // 1 = PLAYING, 3 = BUFFERING
      if (s === 1 || s === 3) return true;
      if (s === 2 || s === 0 || s === -1) return false;
    }
    return Boolean(this.videoEl && !this.videoEl.paused && !this.videoEl.ended);
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoEl;
  }

  onStateChange(cb: (event: PlayerEventType, time: number) => void): void {
    this.listeners.push(cb);
  }

  setPlaybackRate(rate: number): void {
    const moviePlayer = this.getMoviePlayer();
    if (moviePlayer && typeof moviePlayer.setPlaybackRate === "function") {
      try {
        moviePlayer.setPlaybackRate(rate);
      } catch (e) {}
    }
    if (this.videoEl) {
      try {
        this.videoEl.playbackRate = rate;
      } catch (e) {}
    }
  }

  getPlaybackRate(): number {
    return this.videoEl?.playbackRate || 1.0;
  }

  destroy(): void {
    this.isDestroyed = true;
    this.listeners = [];
  }
}
