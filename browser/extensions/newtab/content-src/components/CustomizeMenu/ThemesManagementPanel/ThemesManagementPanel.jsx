/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
// eslint-disable-next-line no-shadow
import { CSSTransition } from "react-transition-group";

// Full browser theme selection sub-panel. The compact `theme-picker` lives in
// the customize panel row; the "See more themes" box-button opens this sliding
// panel, which shows the full `theme-picker` (appearance chooser + all themes)
// and a link out to the about:addons themes list.
function ThemesManagementPanel({ onSubpanelToggle, togglePanel, showPanel }) {
  const arrowButtonRef = useRef(null);
  const panelRef = useRef(null);
  const dispatch = useDispatch();

  // Notify parent menu when subpanel opens/closes
  useEffect(() => {
    if (onSubpanelToggle) {
      onSubpanelToggle(showPanel);
    }
  }, [showPanel, onSubpanelToggle]);

  const handlePanelEntered = () => {
    arrowButtonRef.current?.focus();
  };

  const openAboutAddonsThemes = () => {
    dispatch(ac.OnlyToMain({ type: at.OPEN_ABOUT_ADDONS_THEMES }));
  };

  const isRTL = typeof document !== "undefined" && document.dir === "rtl";
  const arrowIconSrc = `chrome://global/skin/icons/shaft-arrow-${isRTL ? "right" : "left"}.svg`;

  return (
    <div id="themes-management-panel" className="themes-mgmt-panel-container">
      <moz-box-button
        onClick={togglePanel}
        data-l10n-id="newtab-appearance-more-themes-button"
      ></moz-box-button>
      <CSSTransition
        nodeRef={panelRef}
        in={showPanel}
        timeout={300}
        classNames="themes-mgmt-panel"
        unmountOnExit={true}
        onEntered={handlePanelEntered}
      >
        <div ref={panelRef} className="themes-mgmt-panel">
          <div className="panel-content">
            <div className="arrow-wrapper">
              <moz-button
                ref={arrowButtonRef}
                type="ghost"
                className="arrow-button"
                iconSrc={arrowIconSrc}
                onClick={togglePanel}
              ></moz-button>
              <h2 data-l10n-id="newtab-appearance-manage-title"></h2>
            </div>
            <theme-picker
              layout="full"
              showLabels={false}
              installsource="about:newtab"
            ></theme-picker>
            <button
              className="external-link"
              onClick={openAboutAddonsThemes}
              data-l10n-id="newtab-appearance-explore-more-themes-button"
            ></button>
          </div>
        </div>
      </CSSTransition>
    </div>
  );
}

export { ThemesManagementPanel };
