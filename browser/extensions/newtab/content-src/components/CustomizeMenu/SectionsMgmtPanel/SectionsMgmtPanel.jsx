/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
// eslint-disable-next-line no-shadow
import { CSSTransition } from "react-transition-group";

function SectionsMgmtPanel({
  exitEventFired,
  pocketEnabled,
  onSubpanelToggle,
  togglePanel,
  showPanel,
  novaEnabled,
}) {
  const arrowButtonRef = useRef(null);
  const panelRef = useRef(null);
  const { sectionPersonalization } = useSelector(
    state => state.DiscoveryStream
  );
  const layoutComponents = useSelector(
    state => state.DiscoveryStream.layout[0].components
  );
  const sections = useSelector(state => state.DiscoveryStream.feeds.data);
  const dispatch = useDispatch();

  // TODO: Wrap sectionsFeedName -> sectionsList logic in try...catch?
  let sectionsFeedName;

  const cardGridEntry = layoutComponents.find(item => item.type === "CardGrid");

  if (cardGridEntry) {
    sectionsFeedName = cardGridEntry.feed.url;
  }

  let sectionsList = [];

  if (sectionsFeedName) {
    sectionsList = sections[sectionsFeedName]?.data?.sections ?? [];
  }

  const [sectionsState, setSectionState] = useState(sectionPersonalization); // State management with useState

  let followedSectionsData = sectionsList.filter(
    item => sectionsState[item.sectionKey]?.isFollowed
  );

  let blockedSectionsData = sectionsList.filter(
    item => sectionsState[item.sectionKey]?.isBlocked
  );

  function updateCachedData() {
    // Reset cached followed/blocked list data while panel is open
    setSectionState(sectionPersonalization);

    followedSectionsData = sectionsList.filter(
      item => sectionsState[item.sectionKey]?.isFollowed
    );

    blockedSectionsData = sectionsList.filter(
      item => sectionsState[item.sectionKey]?.isBlocked
    );
  }

  const onFollowClick = useCallback(
    (sectionKey, receivedRank) => {
      dispatch(
        ac.AlsoToMain({
          type: at.SECTION_PERSONALIZATION_SET,
          data: {
            ...sectionPersonalization,
            [sectionKey]: {
              isFollowed: true,
              isBlocked: false,
              followedAt: new Date().toISOString(),
            },
          },
        })
      );
      // Telemetry Event Dispatch
      dispatch(
        ac.OnlyToMain({
          type: "FOLLOW_SECTION",
          data: {
            section: sectionKey,
            section_position: receivedRank,
            event_source: "CUSTOMIZE_PANEL",
          },
        })
      );
    },
    [dispatch, sectionPersonalization]
  );

  const onBlockClick = useCallback(
    (sectionKey, receivedRank) => {
      dispatch(
        ac.AlsoToMain({
          type: at.SECTION_PERSONALIZATION_SET,
          data: {
            ...sectionPersonalization,
            [sectionKey]: {
              isFollowed: false,
              isBlocked: true,
            },
          },
        })
      );

      // Telemetry Event Dispatch
      dispatch(
        ac.OnlyToMain({
          type: "BLOCK_SECTION",
          data: {
            section: sectionKey,
            section_position: receivedRank,
            event_source: "CUSTOMIZE_PANEL",
          },
        })
      );
    },
    [dispatch, sectionPersonalization]
  );

  const onUnblockClick = useCallback(
    (sectionKey, receivedRank) => {
      const updatedSectionData = { ...sectionPersonalization };
      delete updatedSectionData[sectionKey];
      dispatch(
        ac.AlsoToMain({
          type: at.SECTION_PERSONALIZATION_SET,
          data: updatedSectionData,
        })
      );
      // Telemetry Event Dispatch
      dispatch(
        ac.OnlyToMain({
          type: "UNBLOCK_SECTION",
          data: {
            section: sectionKey,
            section_position: receivedRank,
            event_source: "CUSTOMIZE_PANEL",
          },
        })
      );
    },
    [dispatch, sectionPersonalization]
  );

  const onUnfollowClick = useCallback(
    (sectionKey, receivedRank) => {
      const updatedSectionData = { ...sectionPersonalization };
      delete updatedSectionData[sectionKey];
      dispatch(
        ac.AlsoToMain({
          type: at.SECTION_PERSONALIZATION_SET,
          data: updatedSectionData,
        })
      );
      // Telemetry Event Dispatch
      dispatch(
        ac.OnlyToMain({
          type: "UNFOLLOW_SECTION",
          data: {
            section: sectionKey,
            section_position: receivedRank,
            event_source: "CUSTOMIZE_PANEL",
          },
        })
      );
    },
    [dispatch, sectionPersonalization]
  );

  // Close followed/blocked topic subpanel when parent menu is closed
  useEffect(() => {
    if (exitEventFired && showPanel) {
      togglePanel();
    }
  }, [exitEventFired, showPanel, togglePanel]);

  // Notify parent menu when subpanel opens/closes
  useEffect(() => {
    if (onSubpanelToggle) {
      onSubpanelToggle(showPanel);
    }
  }, [showPanel, onSubpanelToggle]);

  useEffect(() => {
    if (showPanel) {
      updateCachedData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPanel]);

  const handlePanelEntered = () => {
    arrowButtonRef.current?.focus();
  };

  const followedSectionsList = followedSectionsData.map(
    ({ sectionKey, title, receivedRank }) => {
      const following = sectionPersonalization[sectionKey]?.isFollowed;

      return (
        <li key={sectionKey}>
          <label
            id={`follow-topic-label-${sectionKey}`}
            htmlFor={`follow-topic-${sectionKey}`}
          >
            {title}
          </label>
          <div
            className={
              following ? "section-follow following" : "section-follow"
            }
          >
            <moz-button
              onClick={() =>
                following
                  ? onUnfollowClick(sectionKey, receivedRank)
                  : onFollowClick(sectionKey, receivedRank)
              }
              type={"default"}
              index={receivedRank}
              section={sectionKey}
              id={`follow-topic-${sectionKey}`}
              // Compose accessible label from the localized "Following" span and the topic title label.
              aria-labelledby={`follow-state-${sectionKey} follow-topic-label-${sectionKey}`}
            >
              <span
                className="section-button-follow-text"
                data-l10n-id="newtab-section-follow-button"
              />
              <span
                id={`follow-state-${sectionKey}`}
                className="section-button-following-text"
                data-l10n-id="newtab-section-following-button"
              />
              <span
                className="section-button-unfollow-text"
                data-l10n-id="newtab-section-unfollow-button"
              />
            </moz-button>
          </div>
        </li>
      );
    }
  );

  const blockedSectionsList = blockedSectionsData.map(
    ({ sectionKey, title, receivedRank }) => {
      const blocked = sectionPersonalization[sectionKey]?.isBlocked;

      return (
        <li key={sectionKey}>
          <label
            id={`blocked-topic-label-${sectionKey}`}
            htmlFor={`blocked-topic-${sectionKey}`}
          >
            {title}
          </label>
          <div className={blocked ? "section-block blocked" : "section-block"}>
            <moz-button
              onClick={() =>
                blocked
                  ? onUnblockClick(sectionKey, receivedRank)
                  : onBlockClick(sectionKey, receivedRank)
              }
              type="default"
              index={receivedRank}
              section={sectionKey}
              id={`blocked-topic-${sectionKey}`}
              // Compose accessible label from the localized "Blocked" span and the topic title label.
              aria-labelledby={`blocked-state-${sectionKey} blocked-topic-label-${sectionKey}`}
            >
              <span
                className="section-button-block-text"
                data-l10n-id="newtab-section-block-button"
              />
              <span
                id={`blocked-state-${sectionKey}`}
                className="section-button-blocked-text"
                data-l10n-id="newtab-section-blocked-button"
              />
              <span
                className="section-button-unblock-text"
                data-l10n-id="newtab-section-unblock-button"
              />
            </moz-button>
          </div>
        </li>
      );
    }
  );

  // @nova-cleanup(remove-conditional): Remove novaEnabled check, keep arrowIconSrc computation
  let arrowIconSrc;
  if (novaEnabled) {
    const isRTL = typeof document !== "undefined" && document.dir === "rtl";
    arrowIconSrc = `chrome://global/skin/icons/shaft-arrow-${isRTL ? "right" : "left"}.svg`;
  }

  const panelBody = (
    <>
      <h3 data-l10n-id="newtab-section-mangage-topics-followed-topics"></h3>
      {followedSectionsData.length ? (
        <ul className="topic-list">{followedSectionsList}</ul>
      ) : (
        <span
          className="topic-list-empty-state"
          data-l10n-id="newtab-section-mangage-topics-followed-topics-empty-state"
        ></span>
      )}
      <h3 data-l10n-id="newtab-section-mangage-topics-blocked-topics"></h3>
      {blockedSectionsData.length ? (
        <ul className="topic-list">{blockedSectionsList}</ul>
      ) : (
        <span
          className="topic-list-empty-state"
          data-l10n-id="newtab-section-mangage-topics-blocked-topics-empty-state"
        ></span>
      )}
    </>
  );

  return (
    <div>
      <moz-box-button
        onClick={togglePanel}
        data-l10n-id="newtab-section-manage-topics-button-v2"
        {...(!pocketEnabled ? { disabled: true } : {})}
      ></moz-box-button>
      <CSSTransition
        nodeRef={panelRef}
        in={showPanel}
        timeout={300}
        classNames="sections-mgmt-panel"
        unmountOnExit={true}
        onEntered={handlePanelEntered}
      >
        <div ref={panelRef} className="sections-mgmt-panel">
          {
            // @nova-cleanup(remove-conditional): Remove novaEnabled check and the else branch, keep the nova branch
            novaEnabled ? (
              <div className="panel-content">
                <div className="arrow-wrapper">
                  <moz-button
                    ref={arrowButtonRef}
                    type="ghost"
                    className="arrow-button"
                    iconSrc={arrowIconSrc}
                    onClick={togglePanel}
                  ></moz-button>
                  <h2 data-l10n-id="newtab-section-mangage-topics-title"></h2>
                </div>
                {panelBody}
              </div>
            ) : (
              <>
                <button
                  ref={arrowButtonRef}
                  className="arrow-button"
                  onClick={togglePanel}
                >
                  <h1 data-l10n-id="newtab-section-mangage-topics-title"></h1>
                </button>
                {panelBody}
              </>
            )
          }
        </div>
      </CSSTransition>
    </div>
  );
}

export { SectionsMgmtPanel };
