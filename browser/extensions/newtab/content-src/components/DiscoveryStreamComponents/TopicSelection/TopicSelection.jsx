/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ModalOverlayWrapper } from "content-src/components/ModalOverlay/ModalOverlay";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { PREFS } from "content-src/lib/PrefsConstants.mjs";

const EMOJI_LABELS = {
  business: "💼",
  arts: "🎭",
  food: "🍕",
  health: "🩺",
  finance: "💰",
  government: "🏛️",
  sports: "⚽️",
  tech: "💻",
  travel: "✈️",
  "education-science": "🧪",
  society: "💡",
};

function TopicSelection({ supportUrl }) {
  const dispatch = useDispatch();
  const inputRef = useRef(null);
  const modalRef = useRef(null);
  const checkboxWrapperRef = useRef(null);
  const prefs = useSelector(state => state.Prefs.values);
  const topics = prefs[PREFS.TOPICS_AVAILABLE].split(", ");
  const selectedTopics = prefs[PREFS.TOPICS_SELECTED];
  const suggestedTopics =
    prefs[PREFS.TOPIC_SELECTION_SUGGESTED_TOPICS]?.split(", ");
  const displayCount = prefs[PREFS.TOPIC_SELECTION_ONBOARDING_DISPLAY_COUNT];
  const topicsHaveBeenPreviouslySet =
    prefs[PREFS.TOPIC_SELECTION_HAS_BEEN_UPDATED_PREVIOUSLY];
  const [isFirstRun] = useState(displayCount === 0);
  const displayCountRef = useRef(displayCount);
  const preselectedTopics = () => {
    if (selectedTopics) {
      return selectedTopics.split(", ");
    }
    return isFirstRun ? suggestedTopics : [];
  };
  const [topicsToSelect, setTopicsToSelect] = useState(preselectedTopics);

  function isFirstSave() {
    // Only return true if the user has not previous set prefs
    // and the selected topics pref is empty
    if (selectedTopics === "" && !topicsHaveBeenPreviouslySet) {
      return true;
    }

    return false;
  }

  function handleModalClose() {
    dispatch(ac.OnlyToMain({ type: at.TOPIC_SELECTION_USER_DISMISS }));
    dispatch(
      ac.BroadcastToContent({ type: at.TOPIC_SELECTION_SPOTLIGHT_CLOSE })
    );
  }

  function handleUserClose(e) {
    const id = e?.target?.id;

    if (id === "first-run") {
      dispatch(ac.AlsoToMain({ type: at.TOPIC_SELECTION_MAYBE_LATER }));
      dispatch(
        ac.SetPref(PREFS.TOPIC_SELECTION_ONBOARDING_MAYBE_DISPLAY, true)
      );
    } else {
      dispatch(
        ac.SetPref(PREFS.TOPIC_SELECTION_ONBOARDING_MAYBE_DISPLAY, false)
      );
    }
    handleModalClose();
  }

  // By doing this, the useEffect that sets up the IntersectionObserver
  // will not re-run every time displayCount changes,
  // but the observer callback will always have access
  // to the latest displayCount value through the ref.
  useEffect(() => {
    displayCountRef.current = displayCount;
  }, [displayCount]);

  useEffect(() => {
    const { current } = modalRef;
    let observer;
    if (current) {
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          // if the user has seen the modal more than 3 times,
          // automatically remove them from onboarding
          if (displayCountRef.current > 3) {
            dispatch(
              ac.SetPref(PREFS.TOPIC_SELECTION_ONBOARDING_MAYBE_DISPLAY, false)
            );
          }
          observer.unobserve(modalRef.current);
          dispatch(
            ac.AlsoToMain({
              type: at.TOPIC_SELECTION_IMPRESSION,
            })
          );
        }
      });
      observer.observe(current);
    }

    return () => {
      if (current) {
        observer.unobserve(current);
      }
    };
  }, [modalRef, dispatch]);

  // when component mounts, set focus to input
  useEffect(() => {
    inputRef?.current?.focus();
  }, [inputRef]);

  const handleFocus = useCallback(e => {
    const isArrowPressed = e.key === "ArrowUp" || e.key === "ArrowDown";

    if (
      isArrowPressed &&
      checkboxWrapperRef.current.contains(document.activeElement)
    ) {
      e.preventDefault();
      const checkboxElements =
        checkboxWrapperRef.current.querySelectorAll("input");
      const [firstInput] = checkboxElements;
      const lastInput = checkboxElements[checkboxElements.length - 1];
      const inputArr = Array.from(checkboxElements);
      const currentIndex = inputArr.indexOf(document.activeElement);
      let nextEl;
      if (e.key === "ArrowUp") {
        nextEl =
          document.activeElement === firstInput
            ? lastInput
            : checkboxElements[currentIndex - 1];
      } else if (e.key === "ArrowDown") {
        nextEl =
          document.activeElement === lastInput
            ? firstInput
            : checkboxElements[currentIndex + 1];
      }
      nextEl.tabIndex = 0;
      document.activeElement.tabIndex = -1;
      nextEl.focus();
    }
  }, []);

  useEffect(() => {
    const ref = modalRef.current;
    ref.addEventListener("keydown", handleFocus);

    inputRef.current.tabIndex = 0;

    return () => {
      ref.removeEventListener("keydown", handleFocus);
    };
  }, [handleFocus]);

  function handleChange(e) {
    const topic = e.target.name;
    const isChecked = e.target.checked;
    if (isChecked) {
      setTopicsToSelect([...topicsToSelect, topic]);
    } else {
      const updatedTopics = topicsToSelect.filter(t => t !== topic);
      setTopicsToSelect(updatedTopics);
    }
  }

  function handleSubmit() {
    const topicsString = topicsToSelect.join(", ");
    dispatch(ac.SetPref(PREFS.TOPICS_SELECTED, topicsString));
    dispatch(ac.SetPref(PREFS.TOPIC_SELECTION_ONBOARDING_MAYBE_DISPLAY, false));
    if (!topicsHaveBeenPreviouslySet) {
      dispatch(
        ac.SetPref(PREFS.TOPIC_SELECTION_HAS_BEEN_UPDATED_PREVIOUSLY, true)
      );
    }
    dispatch(
      ac.OnlyToMain({
        type: at.TOPIC_SELECTION_USER_SAVE,
        data: {
          topics: topicsString,
          previous_topics: selectedTopics,
          first_save: isFirstSave(),
        },
      })
    );
    handleModalClose();
  }

  return (
    <ModalOverlayWrapper
      onClose={handleUserClose}
      innerClassName="topic-selection-container"
    >
      <div className="topic-selection-form" ref={modalRef}>
        <button
          className="dismiss-button"
          title="dismiss"
          onClick={handleUserClose}
        />
        <h1 className="title" data-l10n-id="newtab-topic-selection-title" />
        <p
          className="subtitle"
          data-l10n-id="newtab-topic-selection-subtitle"
        />
        <div className="topic-list" ref={checkboxWrapperRef}>
          {topics.map((topic, i) => {
            const checked = topicsToSelect.includes(topic);
            return (
              <label className={`topic-item`} key={topic}>
                <input
                  type="checkbox"
                  id={topic}
                  name={topic}
                  ref={i === 0 ? inputRef : null}
                  onChange={handleChange}
                  checked={checked}
                  aria-checked={checked}
                  tabIndex={-1}
                />
                <div className={`topic-custom-checkbox`}>
                  <span className="topic-icon">{EMOJI_LABELS[`${topic}`]}</span>
                  <span className="topic-checked" />
                </div>
                <span
                  className="topic-item-label"
                  data-l10n-id={`newtab-topic-label-${topic}`}
                />
              </label>
            );
          })}
        </div>
        <div className="modal-footer">
          <a
            href={supportUrl}
            data-l10n-id="newtab-topic-selection-privacy-link"
          />
          <moz-button-group className="button-group">
            <moz-button
              id={isFirstRun ? "first-run" : ""}
              data-l10n-id={
                isFirstRun
                  ? "newtab-topic-selection-button-maybe-later"
                  : "newtab-topic-selection-cancel-button"
              }
              onClick={handleUserClose}
            />
            <moz-button
              data-l10n-id="newtab-topic-selection-save-button"
              type="primary"
              onClick={handleSubmit}
            />
          </moz-button-group>
        </div>
      </div>
    </ModalOverlayWrapper>
  );
}

export { TopicSelection };
