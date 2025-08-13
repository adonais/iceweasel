/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { FeatureHighlight } from "./FeatureHighlight";
import React, { useCallback } from "react";

export function FollowSectionButtonHighlight({
  arrowPosition,
  position,
  verticalPosition,
  dispatch,
  handleDismiss,
  handleBlock,
  feature,
}) {
  const onDismiss = useCallback(() => {
    handleDismiss();
    handleBlock();
  }, [handleDismiss, handleBlock]);

  return (
    <div className="follow-section-button-highlight">
      <FeatureHighlight
        position={position}
        arrowPosition={arrowPosition}
        verticalPosition={verticalPosition}
        feature={feature}
        dispatch={dispatch}
        message={
          <div className="follow-section-button-highlight-content">
            <img
              src="chrome://browser/content/asrouter/assets/smiling-fox-icon.svg"
              width="24"
              height="24"
              alt=""
            />
            <div className="follow-section-button-highlight-copy">
              <p
                className="title"
                data-l10n-id="newtab-section-follow-highlight-title"
              />
              <p
                className="subtitle"
                data-l10n-id="newtab-section-follow-highlight-subtitle"
              />
            </div>
          </div>
        }
        openedOverride={true}
        showButtonIcon={false}
        dismissCallback={onDismiss}
        outsideClickCallback={handleDismiss}
      />
    </div>
  );
}
