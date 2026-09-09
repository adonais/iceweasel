/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 2060611 - Fix background audio playback
 *
 * YouTube pauses playback when the page is backgrounded, by reacting to the
 * Page Visibility API. To let audio keep playing when Firefox is sent to the
 * background, we make the page believe it is always visible. Gecko still marks
 * the tab as hidden internally, so it suspends the video decoder on its own
 * (media.suspend-background-video) while audio keeps playing.
 *
 * Exception: if the user explicitly closes the Picture-in-Picture window, that
 * is an intentional stop, so we pause playback rather than keep going.
 *
 * This runs as an isolated content script so, as the webcompat addon, it can
 * read the real visibility with `document.hidden` and the Android PiP state
 * via `document.inAndroidPipMode`, while altering the page's own view through
 * `document.wrappedJSObject`.
 */

const pageDocument = document.wrappedJSObject;

if (!pageDocument.__firefoxBackgroundVideoPlayback) {
  Object.defineProperty(pageDocument, "__firefoxBackgroundVideoPlayback", {
    value: true,
  });

  console.info(
    "document.hidden/visibilityState and the visibilitychange event have been overridden for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=2060611 for details."
  );

  // Always report the page as visible so the site does not pause itself when
  // the browser is backgrounded.
  Object.defineProperties(pageDocument, {
    hidden: { value: false },
    visibilityState: { value: "visible" },
  });

  // Overriding the getters is not enough on its own: the visibilitychange event
  // still fires. Stop it before the site's own listeners can react. But if the
  // page goes hidden while still in Android PiP, the user closed the PiP window
  // (an explicit stop), so pause the video instead of playing on.
  window.addEventListener(
    "visibilitychange",
    event => {
      event.stopImmediatePropagation();
      if (document.hidden && document.inAndroidPipMode) {
        for (const video of document.querySelectorAll("video")) {
          video.pause();
        }
      }
    },
    true
  );

  // During long background playback YouTube shows an idle "Video paused.
  // Continue watching?" prompt. While actually backgrounded, dispatch a keypress
  // (the Alt key, which does nothing on its own) once a minute to keep it from
  // triggering. Gated on the real visibility so foreground behavior is unchanged.
  window.setInterval(() => {
    if (!document.hidden) {
      return;
    }
    for (const type of ["keydown", "keyup"]) {
      document.dispatchEvent(
        new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          keyCode: 18, // Alt
          which: 18,
        })
      );
    }
  }, 60 * 1000);
}
