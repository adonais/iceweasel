/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React, { useCallback, useRef } from "react";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { useIntersectionObserver } from "../../../lib/utils";

// The Stocks widget's error box. It only mounts while there's an error, so the
// intersection observer set up on mount reports WIDGETS_ERROR the first time the
// message is actually on screen.
function StocksError({ widgetSize, dispatch }) {
  const errorFired = useRef(false);
  const handleErrorIntersection = useCallback(() => {
    if (errorFired.current) {
      return;
    }
    errorFired.current = true;
    // Fire from content so the event ties to this tab's session, matching the
    // other widgets' error telemetry.
    dispatch(
      ac.AlsoToMain({
        type: at.WIDGETS_ERROR,
        data: {
          widget_name: "stocks",
          widget_size: widgetSize,
          error_type: "load_error",
        },
      })
    );
  }, [dispatch, widgetSize]);
  const errorRef = useIntersectionObserver(handleErrorIntersection);

  return (
    // role="alert" so a screen reader announces the failure when the box
    // appears, since it replaces the widget's data without moving focus.
    <div
      className="stocks-error"
      role="alert"
      ref={el => {
        errorRef.current = [el];
      }}
    >
      <span className="icon icon-info-warning" aria-hidden="true" />
      <p
        className="stocks-error-text"
        data-l10n-id="newtab-stocks-error-not-available"
      />
    </div>
  );
}

export { StocksError };
