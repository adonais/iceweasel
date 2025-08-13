/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useCallback } from "react";
import { FeatureHighlight } from "./FeatureHighlight";

export function ShortcutFeatureHighlight({
  position,
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
    <div className="shortcut-feature-highlight">
      <FeatureHighlight
        position={position}
        feature={feature}
        dispatch={dispatch}
        message={
          <div className="shortcut-feature-highlight-content">
            <img
              src="chrome://global/skin/icons/open-in-new.svg"
              width="24"
              height="24"
              alt=""
            />
            <div className="shortcut-feature-highlight-copy">
              <p
                className="title"
                data-l10n-id="newtab-shortcuts-highlight-title"
              />
              <p
                className="subtitle"
                data-l10n-id="newtab-shortcuts-highlight-subtitle"
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
