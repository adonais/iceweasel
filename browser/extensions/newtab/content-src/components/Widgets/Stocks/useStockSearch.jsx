/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";

// Monotonic across every Stocks instance so a widget that unmounts and remounts
// never reuses a request id that an earlier, still-running request could answer.
let searchRequestSeq = 0;

/**
 * Focus a moz-button that may have just been created. Its inner button only
 * exists after its first render, and focus() on the host does nothing before
 * that, so wait for the render when there is one to wait for.
 *
 * @param {HTMLElement|null} el
 */
export function focusOnceRendered(el) {
  if (!el) {
    return;
  }
  if (el.updateComplete) {
    el.updateComplete.then(() => el.focus());
  } else {
    el.focus();
  }
}

/**
 * Owns the ticker-search panel lifecycle: whether it is open, sending a search,
 * and returning focus when it closes. The watchlist mutation on add stays in the
 * parent; this hook only opens, closes, and submits.
 *
 * @param {object} options
 * @param {Function} options.dispatch The store's dispatch.
 * @param {Function} options.recordUserAction Telemetry recorder from useWidgetTelemetry.
 * @param {object} options.menuButtonRef Ref to the widget menu button, the last-resort focus target on close.
 * @returns {{ active: boolean, open: (openedFrom?: object) => void, close: () => void, submit: (query: string) => void, searchButtonRef: object, emptySearchButtonRef: object }}
 *   `open` takes the ref of the control that opened search.
 *   The two returned refs are for the toolbar and empty-state search buttons.
 */
export function useStockSearch({ dispatch, recordUserAction, menuButtonRef }) {
  const [active, setActive] = useState(false);
  const wasActiveRef = useRef(false);
  const searchButtonRef = useRef(null);
  const emptySearchButtonRef = useRef(null);
  const openedFromRef = useRef(null);

  // Once search closes, return focus to the control that opened it. The
  // empty-state button is gone after an add, so fall through to the toolbar
  // button, then the menu button.
  useLayoutEffect(() => {
    if (active) {
      wasActiveRef.current = true;
    } else if (wasActiveRef.current) {
      wasActiveRef.current = false;
      focusOnceRendered(
        openedFromRef.current?.current ??
          searchButtonRef.current ??
          menuButtonRef.current
      );
    }
  }, [active, menuButtonRef]);

  const openPanel = useCallback(
    openedFrom => {
      openedFromRef.current = openedFrom ?? null;
      // Start clean so results from a previous search never flash on reopen.
      dispatch({ type: at.WIDGETS_STOCKS_SEARCH_CLEAR });
      setActive(true);
    },
    [dispatch]
  );

  const closePanel = useCallback(() => {
    setActive(false);
    dispatch({ type: at.WIDGETS_STOCKS_SEARCH_CLEAR });
  }, [dispatch]);

  const submit = useCallback(
    query => {
      const trimmed = query.trim();
      if (!trimmed) {
        return;
      }
      const requestId = String(++searchRequestSeq);
      dispatch({
        type: at.WIDGETS_STOCKS_SEARCH_STARTED,
        data: { requestId, query: trimmed },
      });
      dispatch(
        ac.OnlyToMain({
          type: at.WIDGETS_STOCKS_SEARCH_REQUEST,
          data: { requestId, query: trimmed },
        })
      );
      recordUserAction("search_submit", { source: "search" });
    },
    [dispatch, recordUserAction]
  );

  return {
    active,
    open: openPanel,
    close: closePanel,
    submit,
    searchButtonRef,
    emptySearchButtonRef,
  };
}
