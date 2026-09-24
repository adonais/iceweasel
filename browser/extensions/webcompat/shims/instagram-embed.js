/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bug 1892173 - Instagram embed placeholder
 *
 * When Instagram's embed.js is blocked, embedded posts leave an empty gap in
 * the page. This shim puts a SmartBlock placeholder there instead, so that the
 * user can choose to load the embed, at which point the original script is
 * unblocked and run.
 */

/* globals browser, embedHelperLib */

if (!window.smartblockInstagramShimInitialized) {
  // Guard against this script running multiple times
  window.smartblockInstagramShimInitialized = true;

  embedHelperLib.initEmbedShim({
    shimId: "InstagramEmbed",
    scriptURL: "https://www.instagram.com/embed.js",
    embedLogoURL: "https://smartblock.firefox.etp/instagram.svg",
    embedSelector: ".instagram-media",
    isTestShim: false,
  });
}
