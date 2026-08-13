/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { useSizeSubmenu } from "../../lib/utils";

// Shared "Change size" submenu (sibling to MoveSubmenu). Each widget passes the
// sizes it supports and its current size; gating stays at the call site.
export const SizeSubmenu = ({
  submenuId,
  sizes,
  checkedSize,
  onChangeSize,
}) => {
  const sizeSubmenuRef = useSizeSubmenu(onChangeSize);
  return (
    <panel-item submenu={submenuId}>
      <span data-l10n-id="newtab-widget-menu-change-size"></span>
      <panel-list ref={sizeSubmenuRef} slot="submenu" id={submenuId}>
        {sizes.map(size => (
          <panel-item
            key={size}
            type="checkbox"
            checked={checkedSize === size || undefined}
            data-size={size}
            data-l10n-id={`newtab-widget-size-${size}`}
          />
        ))}
      </panel-list>
    </panel-item>
  );
};
