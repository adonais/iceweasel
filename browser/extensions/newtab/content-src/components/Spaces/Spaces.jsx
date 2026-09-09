/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { SPACE_IDS } from "common/PageLayoutVariants.mjs";

// Tab label and icon per space. The section inside keeps its own heading.
const SPACE_META = {
  [SPACE_IDS.STORIES]: {
    l10nId: "newtab-spaces-tab-stories",
    iconsrc: "chrome://global/skin/icons/newsfeed.svg",
  },
  [SPACE_IDS.WIDGETS]: {
    l10nId: "newtab-spaces-tab-widgets",
    iconsrc: "chrome://browser/skin/topsites.svg",
  },
  [SPACE_IDS.ACTIVITY]: {
    l10nId: "newtab-spaces-tab-activity",
    iconsrc: "chrome://browser/skin/history.svg",
  },
};

// Trackpad momentum keeps firing after the fingers lift, so a gesture is locked
// until the wheel goes quiet. Otherwise one flick skips several spaces.
const SWIPE_THRESHOLD_PX = 50;
const SWIPE_END_MS = 200;

// Computed direction, not the dir attribute: about:newtab carries none on
// <html>, so the attribute can read empty in an RTL build. Only called from
// event handlers -- the startup cache renders without a window, so this cannot
// run during render.
function isRtl() {
  return getComputedStyle(document.documentElement).direction === "rtl";
}

/**
 * Navigable panels for the content band.
 *
 * Every space stays mounted and the track clips the inactive ones. Impression
 * observers are viewport-relative, so a clipped space never reports as seen;
 * unmounting instead would re-fire impressions on every return.
 *
 * @param {object} props
 * @param {Array<{id: string, content: React.ReactNode}>} props.spaces - populated
 *   spaces, in tablist order
 * @param {Function} props.dispatch - Redux dispatch, for switch telemetry
 */
export function Spaces({ spaces, dispatch }) {
  // By id, not index: turning a space off shifts the indices after it.
  const [activeId, setActiveId] = useState(spaces[0]?.id);
  // Falls back to the leftmost space when the active one is turned off.
  const activeIndex = Math.max(
    spaces.findIndex(space => space.id === activeId),
    0
  );
  // Hydration is itself a change of translate, so animate from the second render.
  const [animate, setAnimate] = useState(false);
  const tablistRef = useRef(null);
  // Keyboard switches move focus to the new tab; pointer clicks do not.
  const focusActiveTab = useRef(false);

  useEffect(() => {
    setAnimate(true);
  }, []);

  useEffect(() => {
    if (focusActiveTab.current) {
      focusActiveTab.current = false;
      tablistRef.current
        ?.querySelector('[role="tab"][aria-selected="true"]')
        ?.focus();
    }
  }, [activeIndex]);

  const switchTo = useCallback(
    (index, method) => {
      if (index === activeIndex || index < 0 || index >= spaces.length) {
        return;
      }
      setActiveId(spaces[index].id);
      dispatch(
        ac.OnlyToMain({
          type: at.SPACES_USER_EVENT,
          data: {
            space: spaces[index].id,
            previous_space: spaces[activeIndex].id,
            method,
          },
        })
      );
    },
    [activeIndex, spaces, dispatch]
  );

  const onTabKeyDown = useCallback(
    event => {
      const offsets = { ArrowLeft: -1, ArrowRight: 1 };
      let next;
      if (event.key in offsets) {
        // The tablist is horizontal, so ArrowRight means the next tab visually.
        next = activeIndex + offsets[event.key] * (isRtl() ? -1 : 1);
      } else if (event.key === "Home") {
        next = 0;
      } else if (event.key === "End") {
        next = spaces.length - 1;
      } else {
        return;
      }
      if (next >= 0 && next < spaces.length) {
        event.preventDefault();
        focusActiveTab.current = true;
        switchTo(next, "keyboard");
      }
    },
    [activeIndex, spaces.length, switchTo]
  );

  // Trackpads report horizontal scroll as deltaX.
  const wheelTotal = useRef(0);
  const wheelSpent = useRef(false);
  const wheelTimer = useRef(null);
  useEffect(() => () => clearTimeout(wheelTimer.current), []);

  const onWheel = useCallback(
    event => {
      // With shift held Gecko reports the scroll as deltaY and ignores deltaX
      // (mousewheel.with_shift.action = 4), so the axes swap.
      const across = event.shiftKey ? event.deltaY : event.deltaX;
      const along = event.shiftKey ? event.deltaX : event.deltaY;
      if (Math.abs(across) <= Math.abs(along)) {
        return;
      }
      clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        wheelTotal.current = 0;
        wheelSpent.current = false;
      }, SWIPE_END_MS);

      if (wheelSpent.current) {
        return;
      }
      wheelTotal.current += across;
      if (Math.abs(wheelTotal.current) >= SWIPE_THRESHOLD_PX) {
        wheelSpent.current = true;
        // Scrolling right moves the content left, i.e. towards the next space.
        switchTo(
          activeIndex + Math.sign(wheelTotal.current) * (isRtl() ? -1 : 1),
          "swipe"
        );
      }
    },
    [activeIndex, switchTo]
  );

  // Touch: compare where the finger lifted against where it landed.
  const touchStart = useRef(null);

  const onTouchStart = useCallback(event => {
    const [touch] = event.touches;
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }, []);

  const onTouchEnd = useCallback(
    event => {
      const start = touchStart.current;
      touchStart.current = null;
      const [touch] = event.changedTouches;
      if (!start || !touch) {
        return;
      }
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (
        Math.abs(deltaX) < SWIPE_THRESHOLD_PX ||
        Math.abs(deltaX) <= Math.abs(deltaY)
      ) {
        return;
      }
      // Dragging left pulls the next space into view.
      switchTo(activeIndex - Math.sign(deltaX) * (isRtl() ? -1 : 1), "swipe");
    },
    [activeIndex, switchTo]
  );

  return (
    <div
      className="spaces-container"
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="spaces-frame">
        {/* A real tablist, so arrow-key traversal comes with the pattern. */}
        <div className="spaces-tablist-slot">
          <div
            className="spaces-tablist"
            role="tablist"
            ref={tablistRef}
            onKeyDown={onTabKeyDown}
          >
            {spaces.map((space, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={space.id}
                  id={`spaces-tab-${space.id}`}
                  className={`spaces-tab${isActive ? " active" : ""}`}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={`spaces-panel-${space.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => switchTo(index, "tab")}
                >
                  <img
                    className="spaces-tab-icon"
                    src={SPACE_META[space.id].iconsrc}
                    alt=""
                  />
                  <span data-l10n-id={SPACE_META[space.id].l10nId} />
                </button>
              );
            })}
          </div>
        </div>
        <div className={`spaces-track${animate ? " animate" : ""}`}>
          {spaces.map((space, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={space.id}
                id={`spaces-panel-${space.id}`}
                className={`space${isActive ? " active" : ""}`}
                style={{ "--space-offset": index - activeIndex }}
                role="tabpanel"
                aria-labelledby={`spaces-tab-${space.id}`}
                aria-hidden={isActive ? undefined : "true"}
                inert={!isActive}
              >
                {space.content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
