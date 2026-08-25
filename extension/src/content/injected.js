// Injected script running in the MAIN page world (has direct access to window.netflix)
(function () {
  console.log("[JustUs Injected] Bridge script loaded into page world.");

  function getNetflixVideoPlayer() {
    try {
      var netflix = window.netflix;
      if (netflix && netflix.appContext && netflix.appContext.state && netflix.appContext.state.playerApp && netflix.appContext.state.playerApp.getAPI) {
        var videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
        if (videoPlayer) {
          var sessionIds = videoPlayer.getAllPlayerSessionIds();
          if (sessionIds && sessionIds.length > 0) {
            for (var i = sessionIds.length - 1; i >= 0; i--) {
              var player = videoPlayer.getVideoPlayerBySessionId(sessionIds[i]);
              if (player && typeof player.play === "function") {
                return player;
              }
            }
            return videoPlayer.getVideoPlayerBySessionId(sessionIds[0]);
          }
        }
      }
    } catch (e) {
      console.warn("[JustUs Injected] Error getting netflix player:", e);
    }
    return null;
  }

  // Listen for commands from Content Script
  window.addEventListener("message", function (event) {
    if (event.source !== window || !event.data || event.data.source !== "JUSTUS_CONTENT") {
      return;
    }

    var action = event.data.action;
    var payload = event.data.payload || {};
    var requestId = event.data.requestId;
    var player = getNetflixVideoPlayer();
    var video = document.querySelector("video");

    if (action === "NETFLIX_SEEK") {
      if (!payload || payload.time <= 1.0) {
        respond(requestId, { success: true });
        return;
      }
      var timeMs = payload.time * 1000;
      if (player && typeof player.seek === "function") {
        try {
          player.seek(timeMs);
        } catch (e) {}
      }
      respond(requestId, { success: true });
    } else if (action === "NETFLIX_PLAY") {
      var handled = false;
      if (player && typeof player.play === "function") {
        try {
          player.play();
          handled = true;
        } catch (e) {}
      }
      if (!handled) {
        var playBtn = document.querySelector("button[data-uia='control-play-pause'], .button-nfplayerPlay");
        if (playBtn) playBtn.click();
      }
      respond(requestId, { success: true });
    } else if (action === "NETFLIX_PAUSE") {
      var handled = false;
      if (player && typeof player.pause === "function") {
        try {
          player.pause();
          handled = true;
        } catch (e) {}
      }
      if (!handled) {
        var pauseBtn = document.querySelector("button[data-uia='control-play-pause'], .button-nfplayerPause");
        if (pauseBtn) pauseBtn.click();
      }
      respond(requestId, { success: true });
    } else if (action === "NETFLIX_GET_STATE") {
      if (player) {
        respond(requestId, {
          currentTime: (player.getCurrentTime ? player.getCurrentTime() : 0) / 1000,
          duration: (player.getDuration ? player.getDuration() : 0) / 1000,
          isPlaying: player.isPlaying ? player.isPlaying() : !player.isPaused(),
          isBuffering: player.isBuffering ? player.isBuffering() : false,
        });
      } else if (video) {
        respond(requestId, {
          currentTime: video.currentTime,
          duration: video.duration || 0,
          isPlaying: !video.paused && !video.ended,
          isBuffering: video.readyState < 3,
        });
      } else {
        respond(requestId, { error: "No player found" });
      }
    }
  });

  function respond(requestId, data) {
    if (!requestId) return;
    window.postMessage(
      {
        source: "JUSTUS_INJECTED",
        requestId: requestId,
        data: data,
      },
      "*"
    );
  }
})();
