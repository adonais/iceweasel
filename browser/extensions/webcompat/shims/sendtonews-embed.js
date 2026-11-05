/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bug 1945659 - SendToNews/STN Video embed placeholder
 *
 * When SendToNews' embedcode.js is blocked, embedded videos leave an empty gap
 * in the page. This shim puts a SmartBlock placeholder there instead, so that
 * the user can choose to load the embed, at which point the original script is
 * unblocked and run.
 */

/* globals browser, embedHelperLib */

if (!window.smartblockSendToNewsShimInitialized) {
  // Guard against this script running multiple times
  window.smartblockSendToNewsShimInitialized = true;

  /**
   * Finds a SendToNews player script URL in the document. Validates that the
   * URL matches https://*.sendtonews.com/player3/embedcode.js format.
   *
   * @returns {string|undefined} The script URL if found, undefined otherwise.
   */
  function getSendToNewsEmbedScriptURL() {
    for (const script of document.querySelectorAll("script[src]")) {
      try {
        const url = new URL(script.src);
        if (
          url.protocol === "https:" &&
          url.hostname.endsWith(".sendtonews.com") &&
          url.pathname === "/player3/embedcode.js"
        ) {
          return url.href;
        }
      } catch {
        // Invalid URL, skip
      }
    }
    return undefined;
  }

  // Get the script URL from the page. We can't hardcode it because its query
  // string identifies the player and the publisher.
  const scriptURL = getSendToNewsEmbedScriptURL();
  if (scriptURL) {
    embedHelperLib.initEmbedShim({
      shimId: "SendToNewsEmbed",
      scriptURL,
      embedLogoURL: "https://smartblock.firefox.etp/video-embed.svg",
      embedSelector: ".s2nPlayer",
      isTestShim: false,
      fillContainer: true,
    });
  }
}
