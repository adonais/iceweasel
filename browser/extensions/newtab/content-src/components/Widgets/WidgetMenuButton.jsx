/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";

// The "…" button that opens a widget's context menu. menuId is the id of the
// panel-list it opens; l10nId should set both the title and the aria-label.
export const WidgetMenuButton = ({ className, menuId, l10nId, ref }) => (
  <moz-button
    className={className}
    data-l10n-id={l10nId}
    iconSrc="chrome://global/skin/icons/more.svg"
    menuId={menuId}
    type="ghost"
    size="small"
    ref={ref}
  />
);
