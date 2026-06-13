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
  // @nova-cleanup(remove-pref): Remove the nova.enabled pref check and keep the Nova copy and image path as the default once Nova ships.
  const isNova = useSelector(state => state.Prefs.values["nova.enabled"]);
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
    <div
      className={`wallpaper-feature-highlight ${messageData.content?.darkModeDismiss ? "is-inverted-dark-dismiss-button" : ""}`}
    >
      <FeatureHighlight
        position={position}
        data-l10n-id="feature-highlight-wallpaper"
        feature={messageData.content.feature}
        dispatch={dispatch}
        modalClassName="wallpaper-feature-highlight-modal"
        message={
          <div className="wallpaper-feature-highlight-content">
            <picture
              className={
                isNova
                  ? "wallpaper-feature-highlight-image"
                  : "follow-section-button-highlight-image"
              }
            >
              <source
                srcSet={
                  messageData.content?.darkModeImageURL ||
                  (isNova
                    ? "chrome://newtab/content/data/content/assets/highlights/firefox-mascot-prop-paintbucket-rgb.svg"
                    : "chrome://newtab/content/data/content/assets/highlights/omc-newtab-wallpapers.svg")
                }
                media="(prefers-color-scheme: dark)"
              />
              <source
                srcSet={
                  messageData.content?.imageURL ||
                  (isNova
                    ? "chrome://newtab/content/data/content/assets/highlights/firefox-mascot-prop-paintbucket-rgb.svg"
                    : "chrome://newtab/content/data/content/assets/highlights/omc-newtab-wallpapers.svg")
                }
                media="(prefers-color-scheme: light)"
              />
              <img
                width={isNova ? "207" : "320"}
                height={isNova ? "156" : "195"}
                alt=""
              />
            </picture>
            <div className="wallpaper-feature-highlight-copy">
              {!isNova && messageData.content?.cardTitle ? (
                <p className="title">{messageData.content.cardTitle}</p>
              ) : (
                <p
                  className="title"
                  data-l10n-id={
                    isNova
                      ? "newtab-wallpaper-feature-highlight-title"
                      : messageData.content.title ||
                        "newtab-new-user-custom-wallpaper-title"
                  }
                />
              )}
              {!isNova && messageData.content?.cardMessage ? (
                <p className="subtitle">{messageData.content.cardMessage}</p>
              ) : (
                <p
                  className="subtitle"
                  data-l10n-id={
                    isNova
                      ? "newtab-wallpaper-feature-highlight-subtitle"
                      : messageData.content.subtitle ||
                        "newtab-new-user-custom-wallpaper-subtitle"
                  }
                />
              )}
            </div>
            <span className="button-wrapper">
              {!isNova && messageData.content?.cardCta ? (
                <moz-button
                  type={isNova ? "primary" : "default"}
                  onClick={() => onToggleClick("open-customize-menu")}
                  label={messageData.content.cardCta}
                />
              ) : (
                <moz-button
                  type={isNova ? "primary" : "default"}
                  onClick={() => onToggleClick("open-customize-menu")}
                  data-l10n-id={
                    isNova
                      ? "newtab-wallpaper-feature-highlight-cta"
                      : messageData.content.cta ||
                        "newtab-new-user-custom-wallpaper-cta"
                  }
                />
              )}
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
