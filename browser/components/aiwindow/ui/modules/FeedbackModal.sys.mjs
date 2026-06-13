/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ASRouter: "resource:///modules/asrouter/ASRouter.sys.mjs",
  Spotlight: "resource:///modules/asrouter/Spotlight.sys.mjs",
});

export const FeedbackModal = {
  /**
   * @param {MozBrowser} browser
   * @param {string} type - "thumbs-up" or "thumbs-down".
   * @param {object} [metadata] - Optional metadata to include in telemetry.
   */
  async open(browser, type, metadata) {
    await lazy.ASRouter.waitForInitialized;
    const message = await lazy.ASRouter.handleMessageRequest({
      triggerId: "feedbackThumbClick",
      triggerParam: { type },
      template: "spotlight",
    });
    if (!message) {
      return;
    }
    if (metadata) {
      message.content.feedbackData = metadata;
    }
    try {
      await lazy.Spotlight.showSpotlightDialog(browser, message);
    } catch (e) {
      console.error("Failed to open feedback modal", e);
    }
  },
};
