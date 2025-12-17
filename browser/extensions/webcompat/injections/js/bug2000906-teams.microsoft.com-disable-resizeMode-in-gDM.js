/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Bug 2000906 - Microsoft Teams, for getDisplayMedia requests resizeMode: "none" but expects downscaling and frameRate decimation
 *
 * If a constraint for width, height or frameRate is present together with resizeMode: "none", we clear resizeMode.
 * Chrome seems to incorrectly ignore the resizeMode constraint for getDisplayMedia.
 */

/* globals exportFunction */

console.info(
  'getDisplayMedia has been modified to drop resizeMode: "none" for compatibility reasons. See https://bugzilla.mozilla.org/show_bug.cgi?id=2000906 for details.'
);

function maybeDeleteResizeMode(video) {
  const { resizeMode, width, height, frameRate } = video;
  if (resizeMode == "none" && (width || height || frameRate)) {
    delete video.resizeMode;
  }
}

if (navigator.mediaDevices?.getDisplayMedia) {
  {
    const { prototype } = MediaDevices.wrappedJSObject;
    const { getDisplayMedia: gDM } = prototype;
    prototype.getDisplayMedia = exportFunction(function getDisplayMedia(
      options
    ) {
      const { video } = options || {};
      if (video) {
        maybeDeleteResizeMode(video);
      }
      return gDM.call(this, options);
    }, window);
  }

  {
    const { prototype } = MediaStreamTrack.wrappedJSObject;
    const { applyConstraints: aC } = prototype;
    prototype.applyConstraints = exportFunction(function applyConstraints(
      constraints
    ) {
      // Don't allow adding resizeMode if it wasn't there from the start.
      // Ideally we'd check for a gDM-sourced track instead but there's no
      // spec-compliant way to do that.
      if (!this.getConstraints().resizeMode) {
        maybeDeleteResizeMode(constraints || {});
      }
      return aC.call(this, constraints);
    }, window);
  }
}
