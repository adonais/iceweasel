/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Spotlight: "resource:///modules/asrouter/Spotlight.sys.mjs",
});

const NEGATIVE_FEEDBACK_REASONS = [
  {
    id: "incorrect-or-misleading",
    label: { string_id: "aiwindow-feedback-reason-incorrect-or-misleading" },
  },
  {
    id: "performance-or-usability",
    label: { string_id: "aiwindow-feedback-reason-performance-or-usability" },
  },
  {
    id: "doesnt-address-my-request",
    label: { string_id: "aiwindow-feedback-reason-doesnt-address-my-request" },
  },
  {
    id: "harmful-or-offensive",
    label: { string_id: "aiwindow-feedback-reason-harmful-or-offensive" },
  },
  {
    id: "lacks-personalization",
    label: { string_id: "aiwindow-feedback-reason-lacks-personalization" },
  },
  { id: "other", label: { string_id: "aiwindow-feedback-reason-other" } },
];

export function buildModalConfig(type) {
  const isPositive = type === "thumbs-up";
  const tiles = [];

  if (!isPositive) {
    tiles.push({
      type: "multiselect",
      subtitle: { string_id: "aiwindow-feedback-choose-any" },
      data: NEGATIVE_FEEDBACK_REASONS,
      style: { marginBlock: "0 16px" },
    });
  }

  tiles.push({
    type: "textarea",
    subtitle: {
      string_id: isPositive
        ? "aiwindow-feedback-what-worked-well"
        : "aiwindow-feedback-add-details",
    },
    style: { marginBlock: "0" },
    data: {
      id: "feedback-text",
      rows: 4,
      character_limit: 1000,
    },
  });

  return {
    id: "SMARTWINDOW_FEEDBACK_MODAL",
    template: "spotlight",
    content: {
      id: "SMARTWINDOW_FEEDBACK_MODAL",
      template: "multistage",
      modal: "window",
      screens: [
        {
          id: "SMARTWINDOW_FEEDBACK_SCREEN",
          content: {
            position: "center",
            screen_style: {
              width: "560px",
              maxHeight: "495px",
              overflow: "auto",
            },
            dismiss_button: { size: "small", action: { dismiss: true } },
            title: {
              string_id: "aiwindow-feedback-modal-title",
            },
            tiles,
            above_button_content: [
              {
                type: "text",
                text: {
                  string_id: "aiwindow-feedback-disclaimer",
                  fontSize: "13px",
                },
                link_keys: ["learn-more"],
              },
            ],
            "learn-more": {
              action: {
                type: "OPEN_URL",
                data: {
                  where: "chromeless",
                  args: "https://support.mozilla.org/1/firefox/%VERSION%/%OS%/%LOCALE%/smart-window-user-feedback",
                },
              },
            },
            primary_button: {
              label: {
                string_id: "aiwindow-feedback-submit",
              },
              action: isPositive
                ? { navigate: true }
                : {
                    type: "MULTI_ACTION",
                    collectSelect: true,
                    navigate: true,
                    data: {
                      actions: [],
                    },
                  },
            },
            secondary_button: {
              label: {
                string_id: "aiwindow-feedback-cancel",
              },
              action: {
                navigate: true,
              },
            },
          },
        },
      ],
    },
  };
}

export const FeedbackModal = {
  /**
   * @param {MozBrowser} browser
   * @param {string} type - "thumbs-up" or "thumbs-down".
   */
  async open(browser, type) {
    const message = buildModalConfig(type);
    try {
      await lazy.Spotlight.showSpotlightDialog(browser, message);
    } catch (e) {
      console.error("Failed to open feedback modal", e);
    }
  },
};
