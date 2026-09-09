/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line no-unused-vars
import React, { useCallback } from "react";
import { useSelector, batch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { WIDGET_REGISTRY, resolveWidgetSize } from "common/WidgetsRegistry.mjs";
import { WidgetMenuFooter } from "../WidgetMenuFooter";
import { SizeSubmenu } from "../SizeSubmenu";
import { useWidgetTelemetry } from "../useWidgetTelemetry";

const USER_ACTION_TYPES = {
  CHANGE_SIZE: "change_size",
  LEARN_MORE: "learn_more",
};

const RECENT_SEARCHES_ENTRY = WIDGET_REGISTRY.find(
  w => w.id === "recentSearches"
);

/**
 * Recent Searches widget.
 *
 * @param {object} props
 * @param {Function} props.dispatch - Redux dispatch.
 * @param {Function} props.handleUserInteraction - Marks the widget as
 *   interacted with, which removes the "New" badge.
 * @param {boolean} props.widgetsMayBeMaximized - Whether the current layout
 *   allows resizing, which gates the Change size submenu.
 * @param {object} props.widgetEnabledMap - Map of widget id to whether it is
 *   currently active, used by the Move submenu.
 */
function RecentSearches({
  dispatch,
  handleUserInteraction,
  widgetsMayBeMaximized,
  widgetEnabledMap,
}) {
  const prefs = useSelector(state => state.Prefs.values);
  const { searches } = useSelector(state => state.RecentSearches);

  const widgetSize = resolveWidgetSize(RECENT_SEARCHES_ENTRY, prefs);

  // Show the "New" badge until the user first interacts with the widget.
  const hasInteracted = prefs["widgets.recentSearches.interaction"];

  const { impressionRef, recordUserAction } = useWidgetTelemetry({
    dispatch,
    widget: RECENT_SEARCHES_ENTRY,
    widgetSize,
  });

  const handleInteraction = useCallback(
    () => handleUserInteraction("recentSearches"),
    [handleUserInteraction]
  );

  const handleChangeSize = useCallback(
    size => {
      batch(() => {
        dispatch(
          ac.OnlyToMain({
            type: at.SET_PREF,
            data: { name: RECENT_SEARCHES_ENTRY.sizePref, value: size },
          })
        );
        // `value` is action_value; `size` overrides the reported widget_size,
        // which would otherwise still be the pre-change size.
        recordUserAction(USER_ACTION_TYPES.CHANGE_SIZE, {
          source: "context_menu",
          value: size,
          size,
        });
        handleInteraction();
      });
    },
    [dispatch, recordUserAction, handleInteraction]
  );

  // The shared footer opens the support link; here we only record the click.
  function handleLearnMore() {
    recordUserAction(USER_ACTION_TYPES.LEARN_MORE, { source: "context_menu" });
    handleInteraction();
  }

  return (
    <article
      className={`recent-searches widget col-4 ${widgetSize}-widget`}
      ref={impressionRef}
      aria-labelledby="recent-searches-widget-label"
    >
      <div className="recent-searches-title-wrapper">
        <div className="recent-searches-badge-title-wrapper">
          {!hasInteracted && (
            <moz-badge
              className="recent-searches-new-badge"
              data-l10n-id="newtab-widget-lists-label-new"
            ></moz-badge>
          )}
          <h2
            id="recent-searches-widget-label"
            className="recent-searches-title"
            data-l10n-id="newtab-recent-searches-widget-title"
          />
        </div>
        <div className="recent-searches-context-menu-wrapper">
          <moz-button
            className="recent-searches-context-menu-button"
            iconSrc="chrome://global/skin/icons/more.svg"
            menuId="recent-searches-context-menu"
            type="icon ghost"
            size="small"
            data-l10n-id="newtab-recent-searches-widget-menu-button"
          />
          <panel-list
            className="panel-list-no-icons"
            id="recent-searches-context-menu"
          >
            {/* No items above the footer yet, so its leading divider is off.
                Add widget items here and set showDivider back to true. */}
            <WidgetMenuFooter
              dispatch={dispatch}
              widgetId={RECENT_SEARCHES_ENTRY.id}
              widgetEnabledMap={widgetEnabledMap}
              widgetName={RECENT_SEARCHES_ENTRY.telemetryName}
              enabledPref={RECENT_SEARCHES_ENTRY.enabledPref}
              widgetSize={widgetSize}
              learnMoreL10nId="newtab-recent-searches-menu-learn-more"
              onLearnMore={handleLearnMore}
              showDivider={false}
              sizeSubmenu={
                widgetsMayBeMaximized ? (
                  <SizeSubmenu
                    submenuId="recent-searches-size-submenu"
                    sizes={RECENT_SEARCHES_ENTRY.validSizes}
                    checkedSize={widgetSize}
                    onChangeSize={handleChangeSize}
                  />
                ) : null
              }
            />
          </panel-list>
        </div>
      </div>

      {/* Rows go here. data-search-count keeps the state.RecentSearches
          subscription live until then. */}
      <div
        className="recent-searches-body"
        data-search-count={searches.length}
      />
    </article>
  );
}

export { RecentSearches };
