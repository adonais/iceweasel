/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useCallback } from "react";
import { useSelector } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { FeatureHighlight } from "./FeatureHighlight";

export function WallpaperFeatureHighlight({
  position,
  dispatch,
  handleDismiss,
  handleClick,
  handleBlock,
}) {
  const onDismiss = useCallback(() => {
    handleDismiss();
    handleBlock();
  }, [handleDismiss, handleBlock]);

  const onToggleClick = useCallback(
    elementId => {
      dispatch({ type: at.SHOW_PERSONALIZE });
      dispatch(ac.UserEvent({ event: "SHOW_PERSONALIZE" }));
      handleClick(elementId);
      onDismiss();
    },
    [dispatch, onDismiss, handleClick]
  );

  // Extract the strings and feature ID from OMC
  const { messageData } = useSelector(state => state.Messages);

  return (
    <div className="wallpaper-feature-highlight">
      <FeatureHighlight
        position={position}
        data-l10n-id="feature-highlight-wallpaper"
        feature={messageData.content.feature}
        dispatch={dispatch}
        message={
          <div className="wallpaper-feature-highlight-content">
            <img
              src="chrome://newtab/content/data/content/assets/custom-wp-highlight.png"
              alt=""
              width="320"
              height="195"
            />
            <p className="title" data-l10n-id={messageData.content.title} />
            <p
              className="subtitle"
              data-l10n-id={messageData.content.subtitle}
            />
            <span className="button-wrapper">
              <moz-button
                type="default"
                onClick={() => onToggleClick("open-customize-menu")}
                data-l10n-id={messageData.content.cta}
              />
            </span>
          </div>
        }
        toggle={<div className="icon icon-help"></div>}
        openedOverride={true}
        showButtonIcon={false}
        dismissCallback={onDismiss}
        outsideClickCallback={handleDismiss}
      />
    </div>
  );
}
