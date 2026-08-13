/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SLOTS } from "./OMCHighlightSlots.mjs";

export const SHELLS = Object.freeze({
  POPOVER: "popover",
});

export const DISMISS_MODES = Object.freeze({
  BLOCK: "block",
});

export const OMC_HIGHLIGHT_REGISTRY = Object.freeze({
  WorldCupWidgetsCallout: {
    slot: SLOTS.WIDGETS_ROW,
    shell: SHELLS.POPOVER,
    chrome: {
      position: "inset-block-start inset-inline-center",
      modalClassName: "widgets-callout",
    },
    body: {
      image: {
        src: "chrome://newtab/content/data/content/assets/highlights/widget-worldcup.png",
      },
      title: { l10nId: "newtab-sports-widget-message-day-in-play-title" },
      subtitle: { l10nId: "newtab-sports-widget-message-day-in-play-body" },
    },
    dismiss: DISMISS_MODES.BLOCK,
  },
  WidgetsCallout: {
    slot: SLOTS.WIDGETS_ROW,
    shell: SHELLS.POPOVER,
    chrome: {
      position: "inset-block-start inset-inline-center",
      modalClassName: "widgets-callout",
    },
    body: {
      image: {
        src: "chrome://newtab/content/data/content/assets/highlights/widget-non-worldcup.png",
      },
      title: { l10nId: "newtab-widget-message-focus-forecasts-title" },
      subtitle: { l10nId: "newtab-widget-message-focus-forecasts-body" },
    },
    dismiss: DISMISS_MODES.BLOCK,
  },
  // Survey callouts; the CTA opens content.surveyUrl set by the OMC message.
  WorldCupSurveyCallout: {
    slot: SLOTS.WIDGETS_ROW,
    shell: SHELLS.POPOVER,
    chrome: {
      position: "inset-block-start inset-inline-center",
      modalClassName: "widgets-callout widgets-survey-callout",
    },
    body: {
      image: {
        src: "chrome://newtab/content/data/content/assets/highlights/widget-survey.webp",
      },
      title: { l10nId: "newtab-sports-widget-message-survey-title" },
      subtitle: { l10nId: "newtab-sports-widget-message-survey-body" },
      cta: { l10nId: "newtab-sports-widget-message-survey-cta" },
    },
    dismiss: DISMISS_MODES.BLOCK,
  },
  WorldCupWidgetSurveyCallout: {
    slot: SLOTS.WIDGETS_ROW,
    shell: SHELLS.POPOVER,
    chrome: {
      position: "inset-block-start inset-inline-center",
      modalClassName: "widgets-callout widgets-survey-callout",
    },
    body: {
      image: {
        src: "chrome://newtab/content/data/content/assets/highlights/widget-survey.webp",
      },
      title: { l10nId: "newtab-sports-widget-message-survey-widget-title" },
      subtitle: { l10nId: "newtab-sports-widget-message-survey-widget-body" },
      cta: { l10nId: "newtab-sports-widget-message-survey-cta" },
    },
    dismiss: DISMISS_MODES.BLOCK,
  },
});

export const getRegistryEntry = messageType => {
  if (!messageType) {
    return null;
  }
  return OMC_HIGHLIGHT_REGISTRY[messageType] || null;
};

export const resolveText = ({ content, rawKey, l10nKey, defaultL10nId }) => {
  const raw = content?.[rawKey];
  if (raw) {
    return { raw };
  }
  const customL10nId = content?.[l10nKey];
  if (customL10nId) {
    return { l10nId: customL10nId };
  }
  if (defaultL10nId) {
    return { l10nId: defaultL10nId };
  }
  return null;
};

export const resolveImage = ({ content, defaults }) => {
  if (content?.hideImage) {
    return null;
  }
  const override = content?.imageURL;
  if (override) {
    return { src: override };
  }
  return defaults || null;
};
