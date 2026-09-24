/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React, { useCallback, useState } from "react";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { useOverflowSplit } from "./useOverflowSplit";

/**
 * A single row of entry points to the sections below, in feed order.
 *
 * @param props
 * @param props.sections The sections rendered in the feed
 * @param props.dispatch
 * @returns {React.FunctionComponent}
 */
function TopicNavigation({ sections, dispatch }) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  const topics = sections.filter(
    // Popular Today is excluded from the strip, since it's already the top section.
    section => section.sectionKey !== "top_stories_section"
  );

  const { containerRef, listRef, itemsRef, overflowRef, visibleCount } =
    useOverflowSplit(topics.map(topic => topic.title));

  // A null count asks for a measuring pass, so render every topic.
  const isMeasuring = visibleCount === null;
  const inlineCount = visibleCount ?? topics.length;
  const inlineTopics = topics.slice(0, inlineCount);
  const overflowTopics = topics.slice(inlineCount);
  // The More button has to be on screen during the measuring pass too, so the
  // hook can read the width it needs to reserve.
  const showOverflowControl = isMeasuring || !!overflowTopics.length;
  // The More button is the last arrow stop rather than a tab stop of its own.
  const stopCount = inlineCount + (showOverflowControl ? 1 : 0);
  const activeIndex = Math.min(focusedIndex, Math.max(0, stopCount - 1));

  const focusStop = useCallback(
    index => {
      const stopEl =
        index < inlineCount ? itemsRef.current[index] : overflowRef.current;
      stopEl?.querySelector("moz-button")?.focus();
    },
    [inlineCount, itemsRef, overflowRef]
  );

  const onTopicClick = useCallback(
    (e, topic, fromOverflowMenu) => {
      const heading = globalThis.document.getElementById(
        `section-title-${topic.sectionKey}`
      );
      if (heading) {
        const prefersReducedMotion = globalThis.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        heading.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
        // Keyboard activation reports no click detail. Have keyboard focus
        // follow the scroll to land on the first card in the selected section.
        // preventScroll leaves the animation above to do the scrolling.
        if (e.detail === 0) {
          heading
            .closest(".ds-section")
            ?.querySelector("a.ds-card-link")
            ?.focus({ preventScroll: true });
        }
      }

      dispatch(
        ac.OnlyToMain({
          type: at.TOPIC_NAVIGATION_CLICK,
          data: {
            topic: topic.sectionKey,
            event_source: fromOverflowMenu ? "OVERFLOW_MENU" : "TOPIC_STRIP",
          },
        })
      );
    },
    [dispatch]
  );

  const onKeyDown = useCallback(
    e => {
      // The open dropdown handles its own keys.
      if (e.target.closest("panel-list")) {
        return;
      }

      const lastIndex = stopCount - 1;
      // Arrow direction should match visual navigation direction in RTL
      const isRTL = globalThis.document.dir === "rtl";
      let nextIndex;

      switch (e.key) {
        case "ArrowRight":
          nextIndex = isRTL ? activeIndex - 1 : activeIndex + 1;
          break;
        case "ArrowLeft":
          nextIndex = isRTL ? activeIndex + 1 : activeIndex - 1;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = lastIndex;
          break;
        default:
          return;
      }

      if (nextIndex < 0 || nextIndex > lastIndex) {
        return;
      }
      e.preventDefault();
      setFocusedIndex(nextIndex);
      focusStop(nextIndex);
    },
    [activeIndex, stopCount, focusStop]
  );

  if (!topics.length) {
    return null;
  }

  return (
    <nav
      className={`topic-navigation${isMeasuring ? " is-measuring" : ""}`}
      data-l10n-id="newtab-topic-navigation-label"
      onKeyDown={onKeyDown}
      ref={containerRef}
    >
      <ul className="topic-navigation-list" ref={listRef}>
        {inlineTopics.map((topic, index) => (
          <li
            key={topic.sectionKey}
            ref={el => {
              itemsRef.current[index] = el;
            }}
          >
            <moz-button
              type="muted"
              size="small"
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={e => onTopicClick(e, topic, false)}
              onFocus={() => setFocusedIndex(index)}
            >
              {topic.title}
            </moz-button>
          </li>
        ))}
      </ul>
      {showOverflowControl && (
        <div className="topic-navigation-overflow" ref={overflowRef}>
          <moz-button
            type="muted"
            size="small"
            iconSrc="chrome://global/skin/icons/arrow-down-12.svg"
            iconPosition="end"
            menuId="topic-navigation-overflow-menu"
            tabIndex={activeIndex === inlineCount ? 0 : -1}
            onFocus={() => setFocusedIndex(inlineCount)}
            data-l10n-id="newtab-topic-navigation-more-button"
          />
          <panel-list
            className="panel-list-no-icons"
            id="topic-navigation-overflow-menu"
          >
            {overflowTopics.map(topic => (
              <panel-item
                key={topic.sectionKey}
                onClick={e => onTopicClick(e, topic, true)}
              >
                {topic.title}
              </panel-item>
            ))}
          </panel-list>
        </div>
      )}
    </nav>
  );
}

export { TopicNavigation };
