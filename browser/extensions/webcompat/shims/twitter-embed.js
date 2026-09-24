/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Bug 1901602 - Twitter/X embed placeholder
 *
 * When platform.twitter.com's widgets.js is blocked, embedded tweets and
 * timelines leave an empty gap in the page. This shim puts a SmartBlock
 * placeholder there instead, so that the user can choose to load the embed, at
 * which point the original script is unblocked and run.
 */

/* globals browser, embedHelperLib */

embedHelperLib.initEmbedShim({
  shimId: "TwitterEmbed",
  scriptURL: "https://platform.twitter.com/widgets.js",
  embedLogoURL: "https://smartblock.firefox.etp/x-logo.svg",
  embedSelector:
    '.twitter-tweet, .twitter-timeline, .twitter-video, .tweet-embed, iframe[src*="platform.twitter.com/embed/"], iframe[src*="platform.x.com/embed/"], embed-component[media-url*="twitter.com/"], embed-component[media-url*="x.com/"]',
  isTestShim: false,
});
