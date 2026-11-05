/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class PictureInPictureVideoWrapper {
  constructor(video) {
    // Use shorts player only if video is from YouTube Shorts.
    let shortsPlayer = video.closest("#shorts-player")?.wrappedJSObject;
    let isYTShorts = !!(video.baseURI.includes("shorts") && shortsPlayer);

    this.player = isYTShorts
      ? shortsPlayer
      : video.closest("#movie_player")?.wrappedJSObject;
  }

  isLive() {
    return !!document.querySelector(".ytp-live");
  }

  setMuted(video, shouldMute) {
    if (this.player) {
      if (shouldMute) {
        this.player.mute();
      } else {
        this.player.unMute();
      }
    } else {
      video.muted = shouldMute;
    }
  }

  getDuration(video) {
    if (this.isLive(video)) {
      return Infinity;
    }
    return video.duration;
  }

  setCaptionContainerObserver(video, updateCaptionsFunction) {
    this.removeCaptionContainerObserver();

    let player =
      video.closest("#movie_player, #shorts-player") || video.parentElement;
    if (!player) {
      updateCaptionsFunction("");
      return;
    }

    let container = null;
    const updateCaptions = () => {
      let textNodeList = container
        ?.querySelector(".captions-text")
        ?.querySelectorAll(".caption-visual-line");
      let text = textNodeList
        ? Array.from(textNodeList, line => line.textContent).join("\n")
        : "";
      updateCaptionsFunction(text);
    };

    const bindContainer = () => {
      let nextContainer = player.querySelector("#ytp-caption-window-container");
      if (nextContainer === container) {
        return;
      }

      this.captionsObserver?.disconnect();
      this.captionsObserver = null;
      container = nextContainer;
      if (container) {
        this.captionsObserver = new MutationObserver(updateCaptions);
        this.captionsObserver.observe(container, {
          childList: true,
          subtree: true,
        });
      }
      updateCaptions();
    };

    // YouTube replaces the caption container during playlist navigation.
    // Observe its player so unrelated page changes do not trigger lookups.
    this.containerObserver = new MutationObserver(bindContainer);
    this.containerObserver.observe(player, {
      childList: true,
      subtree: true,
    });
    bindContainer();
  }

  removeCaptionContainerObserver() {
    this.captionsObserver?.disconnect();
    this.containerObserver?.disconnect();
    this.captionsObserver = null;
    this.containerObserver = null;
  }

  shouldHideToggle(video) {
    return !!video.closest(".ytd-video-preview");
  }

  isUrlbarToggleEligible(video) {
    return !!video.closest("#movie_player");
  }

  setVolume(video, volume) {
    if (this.player) {
      this.player.setVolume(volume * 100);
    } else {
      video.volume = volume;
    }
  }

  getVolume(video) {
    if (this.player) {
      return this.player.getVolume() / 100;
    }
    return video.volume;
  }

  setPlaybackRate(video, playbackRate) {
    if (this.player) {
      this.player.setPlaybackRate(playbackRate);
    } else {
      video.playbackRate = playbackRate;
    }
  }

  getPlaybackRate(video) {
    if (this.player) {
      return this.player.getPlaybackRate();
    }
    return video.playbackRate;
  }
}

this.PictureInPictureVideoWrapper = PictureInPictureVideoWrapper;
