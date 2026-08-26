  // Detect Video Player (YouTube, Netflix API, Prime, or HTML5 video)
  function findVideoElement() {
    return document.querySelector(".html5-main-video, .watch-video video, .sizing-wrapper video, .webPlayerUIContainer video, .rendererContainer video, video");
  }

  function getYouTubePlayer() {
    try {
      const ytp = document.getElementById("movie_player") || document.querySelector(".html5-video-player");
      if (ytp && typeof ytp.playVideo === "function") {
        return ytp;
      }
    } catch (e) {}
    return null;
  }

  function getNetflixPlayer() {
    try {
      const netflix = window.netflix;
      if (
        netflix &&
        netflix.appContext &&
        netflix.appContext.state &&
        netflix.appContext.state.playerApp &&
        netflix.appContext.state.playerApp.getAPI
      ) {
        const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
        if (videoPlayer) {
          const sessionIds = videoPlayer.getAllPlayerSessionIds();
          if (sessionIds && sessionIds.length > 0) {
            for (let i = sessionIds.length - 1; i >= 0; i--) {
              const player = videoPlayer.getVideoPlayerBySessionId(sessionIds[i]);
              if (player && typeof player.play === "function") return player;
            }
            return videoPlayer.getVideoPlayerBySessionId(sessionIds[0]);
          }
        }
      }
    } catch (e) {}
    return null;
  }

  // ─────────────────────────────────────────────────────────────────