/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line no-unused-vars
import React, { useCallback } from "react";
import { useSelector, batch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { WIDGET_REGISTRY, resolveWidgetSize } from "common/WidgetsRegistry.mjs";
import { WidgetMenuButton } from "../WidgetMenuButton";
import { WidgetMenuFooter } from "../WidgetMenuFooter";
import { SizeSubmenu } from "../SizeSubmenu";
import { useWidgetTelemetry } from "../useWidgetTelemetry";

const USER_ACTION_TYPES = {
  CHANGE_SIZE: "change_size",
  LEARN_MORE: "learn_more",
};

const HOROSCOPES_ENTRY = WIDGET_REGISTRY.find(w => w.id === "horoscopes");

/**
 * Horoscopes widget.
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
const Horoscopes = ({
  dispatch,
  handleUserInteraction,
  widgetsMayBeMaximized,
  widgetEnabledMap,
}) => {
  const prefs = useSelector(state => state.Prefs.values);

  const widgetSize = resolveWidgetSize(HOROSCOPES_ENTRY, prefs);

  // Show the "New" badge until the user first interacts with the widget.
  const hasInteracted = prefs["widgets.horoscopes.interaction"];

  const { impressionRef, recordUserAction } = useWidgetTelemetry({
    dispatch,
    widget: HOROSCOPES_ENTRY,
    widgetSize,
  });

  const handleInteraction = useCallback(
    () => handleUserInteraction("horoscopes"),
    [handleUserInteraction]
  );

  const handleChangeSize = useCallback(
    size => {
      batch(() => {
        dispatch(
          ac.OnlyToMain({
            type: at.SET_PREF,
            data: { name: HOROSCOPES_ENTRY.sizePref, value: size },
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
  const handleLearnMore = () => {
    recordUserAction(USER_ACTION_TYPES.LEARN_MORE, { source: "context_menu" });
    handleInteraction();
  };

  return (
    <article
      className={`horoscopes widget col-4 ${widgetSize}-widget`}
      ref={impressionRef}
      aria-labelledby="horoscopes-widget-label"
    >
      <div className="horoscopes-title-wrapper">
        <div className="horoscopes-badge-title-wrapper">
          {!hasInteracted && (
            <moz-badge
              className="horoscopes-new-badge"
              data-l10n-id="newtab-widget-lists-label-new"
            ></moz-badge>
          )}
          <h2
            id="horoscopes-widget-label"
            className="newtab-widget-title"
            data-l10n-id="newtab-horoscopes-widget-title"
          />
        </div>
        <div className="horoscopes-context-menu-wrapper">
          <WidgetMenuButton
            className="horoscopes-context-menu-button"
            menuId="horoscopes-context-menu"
            l10nId="newtab-horoscopes-widget-open-menu-button"
          />
          <panel-list
            className="panel-list-no-icons"
            id="horoscopes-context-menu"
          >
            {/* No items above the footer yet, so its leading divider is off.
                Add widget items here and set showDivider back to true. */}
            <WidgetMenuFooter
              dispatch={dispatch}
              widgetId={HOROSCOPES_ENTRY.id}
              widgetEnabledMap={widgetEnabledMap}
              widgetName={HOROSCOPES_ENTRY.telemetryName}
              enabledPref={HOROSCOPES_ENTRY.enabledPref}
              widgetSize={widgetSize}
              learnMoreL10nId="newtab-horoscopes-menu-learn-more"
              onLearnMore={handleLearnMore}
              showDivider={false}
              sizeSubmenu={
                widgetsMayBeMaximized ? (
                  <SizeSubmenu
                    submenuId="horoscopes-size-submenu"
                    sizes={HOROSCOPES_ENTRY.validSizes}
                    checkedSize={widgetSize}
                    onChangeSize={handleChangeSize}
                  />
                ) : null
              }
            />
          </panel-list>
        </div>
      </div>

      {/* The widget iframe goes here. */}
      <div className="horoscopes-body" />
    </article>
  );
};

export { Horoscopes };
