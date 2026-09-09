/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React, { useRef } from "react";
import { actionCreators as ac } from "common/Actions.mjs";
import { getLinkMenuOptions } from "content-src/lib/link-menu-options";
import { PanelListItems } from "content-src/components/LinkMenu/PanelListItems";
import { usePanelListIsOpen } from "content-src/lib/panel-list-utils";

/**
 * A context menu for blocking, following and unfollowing sections.
 *
 * @param props
 * @returns {React.FunctionComponent}
 */
export function SectionContextMenu({
  type = "DISCOVERY_STREAM",
  buttonType = "icon",
  title,
  index,
  dispatch,
  sectionKey,
  following,
  sectionPersonalization,
  sectionPosition,
  learnMoreUrl,
}) {
  const SECTIONS_CONTEXT_MENU_OPTIONS = [];
  if (following) {
    SECTIONS_CONTEXT_MENU_OPTIONS.push("SectionUnfollow");
  }
  SECTIONS_CONTEXT_MENU_OPTIONS.push("SectionBlock");
  SECTIONS_CONTEXT_MENU_OPTIONS.push("Separator");
  SECTIONS_CONTEXT_MENU_OPTIONS.push("SectionLearnMore");

  const panelListRef = useRef(null);
  const contextMenuOpen = usePanelListIsOpen(panelListRef);

  const menuId = `section-context-menu-${sectionKey ?? index}`;

  const options = getLinkMenuOptions({
    dispatch,
    index,
    source: type.toUpperCase(),
    options: SECTIONS_CONTEXT_MENU_OPTIONS,
    shouldSendImpressionStats: true,
    // Section menu telemetry has always gone through the getLinkMenuOptions
    // ac.UserEvent default, unlike the card/ad menus which use
    // ac.DiscoveryStreamUserEvent. Keep ac.UserEvent to preserve that behavior.
    userEvent: ac.UserEvent,
    site: {
      sectionPersonalization,
      sectionKey,
      sectionPosition,
      title,
      learnMoreUrl,
    },
  });

  const tooltipL10nId = title
    ? "newtab-menu-content-tooltip"
    : "newtab-menu-section-tooltip";

  return (
    <div
      className={`section-context-menu${contextMenuOpen ? " context-menu-open" : ""}`}
    >
      <moz-button
        type={buttonType}
        size="default"
        iconsrc="chrome://global/skin/icons/more.svg"
        data-l10n-id={tooltipL10nId}
        data-l10n-args={title ? JSON.stringify({ title }) : null}
        menuId={menuId}
      />
      <panel-list
        className="panel-list-no-icons"
        id={menuId}
        ref={panelListRef}
      >
        <PanelListItems options={options} />
      </panel-list>
    </div>
  );
}
