/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useCallback } from "react";
import { useSelector } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { MessageWrapper } from "content-src/components/MessageWrapper/MessageWrapper";
import { FeatureHighlight } from "./FeatureHighlight";
import { HighlightPopoverBody } from "./HighlightPopoverBody";
import {
  DISMISS_MODES,
  SHELLS,
  getRegistryEntry,
} from "./OMCHighlightRegistry.mjs";

// MESSAGE_CLICK telemetry source label for the callout's CTA button.
const CTA_CLICK_SOURCE = "cta";

const PopoverShell = ({
  entry,
  content,
  handleDismiss,
  handleBlock,
  handleClick,
  handleClose,
  dispatch,
}) => {
  const dismissCallback = useCallback(() => {
    handleDismiss?.();
    if (entry.dismiss === DISMISS_MODES.BLOCK) {
      handleBlock?.();
    }
  }, [entry.dismiss, handleDismiss, handleBlock]);

  // The CTA opens content.surveyUrl in a new tab and records the click. Taking
  // the survey is a conversion, not a dismissal, so we block (to keep the
  // callout from reappearing) and close the popover, but leave MESSAGE_DISMISS
  // to the X button and outside clicks. Only wired up when a surveyUrl is
  // present so we never render a "Take survey" button that just closes.
  const surveyUrl = content?.surveyUrl;
  const onCtaClick = useCallback(() => {
    dispatch(
      ac.OnlyToMain({
        type: at.OPEN_LINK,
        data: { url: surveyUrl, where: "tab" },
      })
    );
    handleClick?.(CTA_CLICK_SOURCE);
    if (entry.dismiss === DISMISS_MODES.BLOCK) {
      handleBlock?.();
    }
    handleClose?.();
  }, [
    surveyUrl,
    entry.dismiss,
    dispatch,
    handleClick,
    handleBlock,
    handleClose,
  ]);

  return (
    <FeatureHighlight
      position={entry.chrome.position}
      arrowPosition={entry.chrome.arrowPosition}
      modalClassName={entry.chrome.modalClassName}
      openedOverride={true}
      showButtonIcon={false}
      message={
        <HighlightPopoverBody
          body={entry.body}
          content={content}
          onCtaClick={surveyUrl ? onCtaClick : undefined}
        />
      }
      dismissCallback={dismissCallback}
      outsideClickCallback={handleDismiss}
    />
  );
};

export const OMCHighlightSlot = ({ slot, dispatch }) => {
  const { messageData } = useSelector(state => state.Messages);
  const content = messageData?.content;
  const entry = getRegistryEntry(content?.messageType);

  if (!entry || entry.slot !== slot) {
    return null;
  }

  if (entry.shell === SHELLS.POPOVER) {
    return (
      <MessageWrapper dispatch={dispatch} wrapperClassName="omc-highlight-slot">
        <PopoverShell entry={entry} content={content} />
      </MessageWrapper>
    );
  }

  return null;
};
