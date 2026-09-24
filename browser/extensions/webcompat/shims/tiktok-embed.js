/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bug 1892172 - TikTok embed placeholder
 *
 * When TikTok's embed.js is blocked, embedded videos leave an empty gap in the
 * page. This shim puts a SmartBlock placeholder there instead, so that the user
 * can choose to load the embed, at which point the original script is
 * unblocked and run.
 */

/* globals browser, embedHelperLib */

embedHelperLib.initEmbedShim({
  shimId: "TikTokEmbed",
  scriptURL: "https://www.tiktok.com/embed.js",
  embedLogoURL: "https://smartblock.firefox.etp/tiktok.svg",
  embedSelector: ".tiktok-embed",
  isTestShim: false,
});
