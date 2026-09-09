/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React, { useRef } from "react";
import { useSelector } from "react-redux";
import { actionCreators as ac } from "common/Actions.mjs";
import { getLinkMenuOptions } from "content-src/lib/link-menu-options";
import { PanelListItems } from "content-src/components/LinkMenu/PanelListItems";
import { usePanelListIsOpen } from "content-src/lib/panel-list-utils";

/**
 * A context menu for IAB banners (e.g. billboard, leaderboard).
 *
 * Note: MREC ad formats and sponsored stories share the context menu with
 * other cards: make sure you also look at DSLinkMenu component
 * to keep any updates to ad-related context menu items in sync.
 *
 * @param dispatch
 * @param spoc
 * @param position
 * @param type
 * @param showAdReporting
 * @returns {Element}
 * @class
 */
export function AdBannerContextMenu({
  dispatch,
  spoc,
  position,
  type,
  showAdReporting,
  toggleActive = () => {},
  // @nova-cleanup(remove-conditional): Remove novaEnabled, use size="small" and type="icon ghost" as default
  novaEnabled,
}) {
  const ADBANNER_CONTEXT_MENU_OPTIONS = [
    "BlockAdUrl",
    ...(showAdReporting ? ["ReportAd"] : []),
    "ManageSponsoredContent",
    "OurSponsorsAndYourPrivacy",
  ];

  const { isPrivateBrowsingEnabled, platform, privacyInfoUrl } = useSelector(
    state => ({
      isPrivateBrowsingEnabled: state.Prefs.values.isPrivateBrowsingEnabled,
      platform: state.Prefs.values.platform,
      privacyInfoUrl: state.Prefs.values["privacyInfo.url"],
    })
  );

  const panelListRef = useRef(null);
  const contextMenuOpen = usePanelListIsOpen(panelListRef, {
    onShown: () => toggleActive(true),
    onHidden: () => toggleActive(false),
  });
  const contextMenuClassNames = `ads-context-menu${
    contextMenuOpen ? " context-menu-open" : ""
  }`;

  const menuId = `ad-banner-context-menu-${position}`;

  const options = getLinkMenuOptions({
    dispatch,
    isPrivateBrowsingEnabled,
    platform,
    privacyInfoUrl,
    options: ADBANNER_CONTEXT_MENU_OPTIONS,
    shouldSendImpressionStats: true,
    userEvent: ac.DiscoveryStreamUserEvent,
    site: {
      // Props we want to pass on for new ad types that come from Unified Ads API
      block_key: spoc.block_key,
      flight_id: spoc.flight_id,
      format: spoc.format,
      id: spoc.id,
      guid: spoc.guid,
      card_type: "spoc",
      // required to record telemetry for an action, see handleBlockUrl in TelemetryFeed.sys.mjs
      is_pocket_card: true,
      position,
      sponsor: spoc.sponsor,
      title: spoc.title,
      url: spoc.url || spoc.shim?.url,
      personalization_models: spoc.personalization_models,
      priority: spoc.priority,
      score: spoc.score,
      alt_text: spoc.alt_text,
      shim: spoc.shim,
    },
    index: position,
    source: type?.toUpperCase(),
  });

  return (
    <div className="ads-context-menu-wrapper">
      <div className={contextMenuClassNames}>
        <moz-button
          type={novaEnabled ? "icon ghost" : "icon"}
          size={novaEnabled ? "small" : "default"}
          data-l10n-id="newtab-menu-content-tooltip"
          data-l10n-args={JSON.stringify({
            title: spoc.title || spoc.sponsor || spoc.alt_text,
          })}
          iconsrc="chrome://global/skin/icons/more.svg"
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
    </div>
  );
}
