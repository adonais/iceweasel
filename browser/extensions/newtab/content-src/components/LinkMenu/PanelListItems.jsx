/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";

/**
 * Renders the <panel-item>/<hr> children shared by the panel-list-based
 * context menus. Callers own the wrapping <panel-list> element and its
 * open/close lifecycle (this only renders items).
 *
 * @param options Built LinkMenuOptions entries (see getLinkMenuOptions).
 */
export function PanelListItems({ options }) {
  return options.map((option, i) =>
    option.type === "separator" ? (
      <hr key={i} />
    ) : (
      option.type !== "empty" && (
        <panel-item
          key={i}
          onClick={option.onClick}
          aria-haspopup={option.ariaHasPopup}
          {...(option.disabled ? { disabled: true } : {})}
        >
          <span data-l10n-id={option.string_id || option.id} />
        </panel-item>
      )
    )
  );
}
