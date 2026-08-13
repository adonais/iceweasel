/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line no-unused-vars
import React, { useCallback, useRef } from "react";
import { useSelector, batch } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { useIntersectionObserver } from "../../../lib/utils";
import { WIDGET_REGISTRY, resolveWidgetSize } from "common/WidgetsRegistry.mjs";
import { WidgetMenuFooter } from "../WidgetMenuFooter";
import { SizeSubmenu } from "../SizeSubmenu";
import { StockTicker } from "./StockTicker";
import { StocksError } from "./StocksError";

const USER_ACTION_TYPES = {
  CHANGE_SIZE: "change_size",
  SEARCH_TICKERS: "search_tickers",
  LEARN_MORE: "learn_more",
};

const STOCKS_ENTRY = WIDGET_REGISTRY.find(w => w.id === "stocks");
const STOCKS_PLACEHOLDER_COUNT = 4;

function Stocks({ dispatch, widgetsMayBeMaximized, widgetEnabledMap }) {
  const prefs = useSelector(state => state.Prefs.values);
  const { tickers, error } = useSelector(state => state.Stocks);

  // Resolve size through the registry helper, not the pref, so trainhop and the
  // default can apply.
  const widgetSize = resolveWidgetSize(STOCKS_ENTRY, prefs);
  const showError = error && !tickers.length;
  const impressionFired = useRef(false);

  const handleIntersection = useCallback(() => {
    if (impressionFired.current) {
      return;
    }
    impressionFired.current = true;
    dispatch(
      ac.AlsoToMain({
        type: at.WIDGETS_IMPRESSION,
        data: {
          widget_name: "stocks",
          widget_size: widgetSize,
        },
      })
    );
  }, [dispatch, widgetSize]);

  const widgetRef = useIntersectionObserver(handleIntersection);

  const handleChangeSize = useCallback(
    size => {
      batch(() => {
        dispatch(
          ac.OnlyToMain({
            type: at.SET_PREF,
            data: { name: STOCKS_ENTRY.sizePref, value: size },
          })
        );
        dispatch(
          ac.OnlyToMain({
            type: at.WIDGETS_USER_EVENT,
            data: {
              widget_name: "stocks",
              widget_source: "context_menu",
              user_action: USER_ACTION_TYPES.CHANGE_SIZE,
              action_value: size,
              widget_size: size,
            },
          })
        );
      });
    },
    [dispatch]
  );

  // Placeholder: a real ticker search will replace this telemetry-only stub in
  // a follow-up.
  function handleSearchTickers() {
    dispatch(
      ac.OnlyToMain({
        type: at.WIDGETS_USER_EVENT,
        data: {
          widget_name: "stocks",
          widget_source: "context_menu",
          user_action: USER_ACTION_TYPES.SEARCH_TICKERS,
          widget_size: widgetSize,
        },
      })
    );
  }

  // The shared footer opens the support link; here we only record the click.
  function handleLearnMore() {
    dispatch(
      ac.OnlyToMain({
        type: at.WIDGETS_USER_EVENT,
        data: {
          widget_name: "stocks",
          widget_source: "context_menu",
          user_action: USER_ACTION_TYPES.LEARN_MORE,
          widget_size: widgetSize,
        },
      })
    );
  }

  return (
    <article
      className={`stocks widget col-4 ${widgetSize}-widget`}
      ref={el => {
        widgetRef.current = [el];
      }}
    >
      <div className="stocks-title-wrapper">
        <span
          className="stocks-title"
          data-l10n-id="newtab-stocks-widget-title"
        ></span>
        <div className="stocks-context-menu-wrapper">
          <moz-button
            className="stocks-context-menu-button"
            iconSrc="chrome://global/skin/icons/more.svg"
            menuId="stocks-context-menu"
            type="icon ghost"
            size="small"
            data-l10n-id="newtab-stocks-widget-menu-button"
          />
          <panel-list id="stocks-context-menu">
            <panel-item
              data-l10n-id="newtab-stocks-menu-search"
              onClick={handleSearchTickers}
            />
            <WidgetMenuFooter
              dispatch={dispatch}
              widgetId="stocks"
              widgetEnabledMap={widgetEnabledMap}
              widgetName="stocks"
              enabledPref={STOCKS_ENTRY.enabledPref}
              widgetSize={widgetSize}
              learnMoreL10nId="newtab-stocks-menu-learn-more"
              onLearnMore={handleLearnMore}
              sizeSubmenu={
                widgetsMayBeMaximized ? (
                  <SizeSubmenu
                    submenuId="stocks-size-submenu"
                    sizes={["medium", "large"]}
                    checkedSize={widgetSize}
                    onChangeSize={handleChangeSize}
                  />
                ) : null
              }
            />
          </panel-list>
        </div>
      </div>

      <div className="stocks-body">
        {showError && (
          <StocksError widgetSize={widgetSize} dispatch={dispatch} />
        )}
        {!showError && widgetSize === "medium" && (
          <ul
            className={`stocks-grid${tickers.length ? "" : " stocks-grid--loading"}`}
          >
            {tickers.length
              ? tickers.map(t => (
                  <StockTicker
                    key={t.ticker}
                    name={t.name}
                    ticker={t.ticker}
                    price={t.last_price}
                    changePercent={t.todays_change_perc}
                  />
                ))
              : Array.from({ length: STOCKS_PLACEHOLDER_COUNT }).map((_, i) => (
                  <StockTicker key={i} loading={true} />
                ))}
          </ul>
        )}
        {!showError && widgetSize === "large" && (
          <ul
            className={`stocks-list${tickers.length ? "" : " stocks-list--loading"}`}
          >
            {tickers.length
              ? tickers.map(t => (
                  <StockTicker
                    key={t.ticker}
                    size="large"
                    name={t.name}
                    ticker={t.ticker}
                    price={t.last_price}
                    changePercent={t.todays_change_perc}
                  />
                ))
              : Array.from({ length: STOCKS_PLACEHOLDER_COUNT }).map((_, i) => (
                  <StockTicker key={i} size="large" loading={true} />
                ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export { Stocks };
