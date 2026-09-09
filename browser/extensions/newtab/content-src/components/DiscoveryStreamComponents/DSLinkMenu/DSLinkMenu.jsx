/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getLinkMenuOptions } from "content-src/lib/link-menu-options";
import { PanelListItems } from "content-src/components/LinkMenu/PanelListItems";
import { subscribePanelListToggle } from "content-src/lib/panel-list-utils";
import { actionCreators as ac } from "common/Actions.mjs";
import React from "react";
import { connect } from "react-redux";

export class _DSLinkMenu extends React.PureComponent {
  constructor(props) {
    super(props);
    this.panelListRef = React.createRef();
    this.onMenuShown = this.onMenuShown.bind(this);
    this.onMenuHidden = this.onMenuHidden.bind(this);
  }

  componentDidMount() {
    // The panel-list is persistent (paired to its moz-button via menuId).
    // Mirror its open/close into the card's active state via its shown/hidden
    // events (replacing the ContextMenuButton onUpdate / LinkMenu onShow calls).
    this.teardownMenuEvents = subscribePanelListToggle(
      this.panelListRef.current,
      { onShown: this.onMenuShown, onHidden: this.onMenuHidden }
    );
  }

  componentWillUnmount() {
    this.teardownMenuEvents?.();
  }

  onMenuShown() {
    this.props.onMenuShow?.();
  }

  onMenuHidden() {
    this.props.onMenuUpdate?.(false);
  }

  render() {
    const { index, dispatch } = this.props;
    let TOP_STORIES_CONTEXT_MENU_OPTIONS;
    const PREF_REPORT_ADS_ENABLED = "discoverystream.reportAds.enabled";
    const prefs = this.props.Prefs.values;
    const showAdsReporting = prefs[PREF_REPORT_ADS_ENABLED];
    const isSpoc = this.props.card_type === "spoc";

    if (isSpoc) {
      TOP_STORIES_CONTEXT_MENU_OPTIONS = [
        "BlockUrl",
        ...(showAdsReporting ? ["ReportAd"] : []),
        "ManageSponsoredContent",
        "OurSponsorsAndYourPrivacy",
      ];
    } else {
      TOP_STORIES_CONTEXT_MENU_OPTIONS = [
        "CheckBookmark",
        "Separator",
        "OpenInNewWindow",
        "OpenInPrivateWindow",
        "Separator",
        "BlockUrl",
        ...(this.props.section ? ["ReportContent"] : []),
      ];
    }

    const type = this.props.type || "DISCOVERY_STREAM";
    const title = this.props.title || this.props.source;
    const menuId = `ds-card-context-menu-${this.props.id ?? index}`;

    const options = getLinkMenuOptions({
      dispatch,
      index,
      source: type.toUpperCase(),
      isPrivateBrowsingEnabled: this.props.isPrivateBrowsingEnabled,
      platform: this.props.platform,
      privacyInfoUrl: this.props.privacyInfoUrl,
      options: TOP_STORIES_CONTEXT_MENU_OPTIONS,
      shouldSendImpressionStats: true,
      userEvent: ac.DiscoveryStreamUserEvent,
      site: {
        referrer: "https://getpocket.com/recommendations",
        title: this.props.title,
        type: this.props.type,
        url: this.props.url,
        guid: this.props.id,
        pocket_id: this.props.pocket_id,
        card_type: this.props.card_type,
        shim: this.props.shim,
        bookmarkGuid: this.props.bookmarkGuid,
        flight_id: this.props.flightId,
        tile_id: this.props.tile_id,
        corpus_item_id: this.props.corpus_item_id,
        scheduled_corpus_item_id: this.props.scheduled_corpus_item_id,
        recommended_at: this.props.recommended_at,
        received_rank: this.props.received_rank,
        topic: this.props.topic,
        position: index,
        ...(this.props.format ? { format: this.props.format } : {}),
        ...(this.props.section
          ? {
              section: this.props.section,
              section_position: this.props.section_position,
              is_section_followed: this.props.is_section_followed,
            }
          : {}),
      },
    });

    return (
      <div className="context-menu-position-container">
        <moz-button
          class="context-menu-button"
          type="icon ghost"
          size="small"
          iconsrc="chrome://global/skin/icons/more.svg"
          data-l10n-id="newtab-menu-content-tooltip"
          data-l10n-args={JSON.stringify({ title })}
          menuId={menuId}
          tabindex={this.props.tabIndex}
        />
        <panel-list
          className="panel-list-no-icons"
          id={menuId}
          ref={this.panelListRef}
        >
          <PanelListItems options={options} />
        </panel-list>
      </div>
    );
  }
}

export const DSLinkMenu = connect(state => ({
  Prefs: state.Prefs,
  isPrivateBrowsingEnabled: state.Prefs.values.isPrivateBrowsingEnabled,
  platform: state.Prefs.values.platform,
  privacyInfoUrl: state.Prefs.values["privacyInfo.url"],
}))(_DSLinkMenu);
