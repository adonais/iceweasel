/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useEffect, useState } from "react";
import { Localized } from "./MSLocalized";
import { MultiStageUtils } from "../lib/multistage-utils.mjs";

async function evaluateTargeting(targeting) {
  return await window.AWEvaluateAttributeTargeting(targeting);
}

export const ActionChecklistItem = ({ item, index, handleAction }) => {
  const [actionTargeting, setActionTargeting] = useState(true);

  useEffect(() => {
    const setInitialTargetingValue = async () => {
      setActionTargeting(await evaluateTargeting(item.targeting));
    };

    setInitialTargetingValue();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onButtonClick(event) {
    // Immediately set targeting to true to disable the button.
    // It will re-evaluate its targeting on the next load.
    setActionTargeting(true);
    handleAction(event);
  }

  return (
    // if actionTargeting is false, we want the button to be enabled
    // because it signifies that the action is not yet complete.
    // If it is true, the action has been completed, so we can disable the button.
    <button
      id={item.id}
      value={index}
      key={item.id}
      disabled={actionTargeting}
      onClick={onButtonClick}
    >
      <div className="action-checklist-label-container">
        <Localized text={item.label}>
          <span />
        </Localized>
        <div className="check-icon-container">
          {actionTargeting ? (
            <div className="check-filled" />
          ) : (
            <div className="action-arrow" />
          )}
        </div>
      </div>
    </button>
  );
};

export const ActionChecklistProgressBar = ({ progress }) => {
  return (
    <div className="action-checklist-progress-bar-container">
      <div className="action-checklist-progress-bar">
        <progress className="sr-only" value={progress || 0} max="100" />
        <div
          className="indicator"
          role="presentation"
          style={{
            "--action-checklist-progress-bar-progress": `${progress || 0}%`,
          }}
        />
      </div>
      <span className="action-checklist-progress-text">
        {Math.round(progress || 0)}%
      </span>
    </div>
  );
};

export const ActionChecklist = ({ content, message_id, handleAction }) => {
  const tiles = content.tiles.data;
  const [progressValue, setProgressValue] = useState(0);
  const [numberOfCompletedActions, setNumberOfCompletedActions] = useState(0);

  const allComplete =
    !!tiles.length && numberOfCompletedActions === tiles.length;

  function determineProgressValue() {
    let newValue = (numberOfCompletedActions / tiles.length) * 100;
    setProgressValue(newValue);
  }

  // This instance of useEffect is to evaluate the targeting of each individual action
  // when the component is initially loaded so that we can accurately populate the progress bar.
  // We're doing the heavy lifting here once on load, and keeping the rest of the information
  // regarding how many actions are complete handy in state for quick access,
  // and a lesser performance hit.
  useEffect(() => {
    let evaluateAllActionsTargeting = async () => {
      let completedActions = await Promise.all(
        tiles.map(async item => await evaluateTargeting(item.targeting))
      );
      let numCompletedActions = completedActions.filter(item => item).length;
      setNumberOfCompletedActions(numCompletedActions);
    };
    evaluateAllActionsTargeting();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // This instance of useEffect is to initially update the progress bar,
  // and to also update the progress bar each time an action is completed.
  useEffect(() => {
    determineProgressValue();
  }, [numberOfCompletedActions]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTileClick(event) {
    let { action, source_id } = content.tiles.data[event.currentTarget.value];
    let { type, data } = action;

    setNumberOfCompletedActions(numberOfCompletedActions + 1);

    MultiStageUtils.handleUserAction({ type, data });
    MultiStageUtils.sendActionTelemetry(message_id, source_id, "CLICK_BUTTON");
  }

  function handleRemoveChecklistClick(event) {
    let { action, source_id } = content[event.currentTarget.value];
    handleAction(
      { currentTarget: event.currentTarget, source: source_id },
      action
    );
  }

  return (
    <div className="action-checklist">
      <hr className="action-checklist-divider" />
      {content.action_checklist_subtitle && (
        <Localized text={content.action_checklist_subtitle}>
          <p className="action-checklist-subtitle" />
        </Localized>
      )}
      <ActionChecklistProgressBar progress={progressValue} />
      <div className="action-checklist-items">
        {tiles.map((item, index) => (
          <ActionChecklistItem
            key={item.id}
            index={index}
            item={item}
            handleAction={handleTileClick}
            showExternalLinkIcon={item.showExternalLinkIcon}
          />
        ))}
      </div>
      {allComplete && content.remove_checklist_button && (
        <button
          className="action-checklist-complete-button"
          value="remove_checklist_button"
          onClick={handleRemoveChecklistClick}
        >
          <Localized text={content.remove_checklist_button.label}>
            <span />
          </Localized>
        </button>
      )}
    </div>
  );
};
