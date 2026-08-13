/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";

const PREF_SPORTS_WIDGET_SIZE = "widgets.sportsWidget.size";

const USER_ACTION_TYPES = {
  OPEN_MATCH_SEARCH: "open_match_search",
};

// Visible placeholder shown in place of a team's country code when the
// match-up isn't decided yet.
const TBD_PLACEHOLDER = "--";

// The /matches API has been observed sending the American spelling
// "canceled" alongside the British "cancelled" we localise to. Map both keys
// to the same Fluent IDs (see UPCOMING_STATUS_ARIA_L10N_MAP below) so the
// badge and aria-label render either way without a data-team-side fix.
const UPCOMING_STATUS_L10N_MAP = {
  delayed: "newtab-sports-widget-delayed",
  postponed: "newtab-sports-widget-postponed",
  suspended: "newtab-sports-widget-suspended",
  cancelled: "newtab-sports-widget-cancelled",
  canceled: "newtab-sports-widget-cancelled",
};

const RESULTS_STATUS_L10N_MAP = {
  final: "newtab-sports-widget-match-full-time",
};

const UPCOMING_STATUS_ARIA_L10N_MAP = {
  delayed: "newtab-sports-widget-match-aria-label-upcoming-delayed",
  postponed: "newtab-sports-widget-match-aria-label-upcoming-postponed",
  suspended: "newtab-sports-widget-match-aria-label-upcoming-suspended",
  cancelled: "newtab-sports-widget-match-aria-label-upcoming-cancelled",
  canceled: "newtab-sports-widget-match-aria-label-upcoming-cancelled",
};

// status_type is always "live" on the /wcs/live endpoint, so the actual
// sub-state has to be read from `period` and `status`. Matching rules mirror
// Fenix's MatchesResponseMapper.kt. Returns null when no rule matches.
function liveStatusL10nId({
  period,
  status: matchStatus,
  home_penalty,
  away_penalty,
}) {
  const normalisedPeriod = (period || "").toLowerCase().replace(/\s+/g, "");
  const inShootout =
    normalisedPeriod === "pen" ||
    normalisedPeriod === "penaltyshootout" ||
    (home_penalty !== null && home_penalty !== undefined) ||
    (away_penalty !== null && away_penalty !== undefined);
  const isExtraTime = /et/i.test(period || "") || /extra/i.test(period || "");
  const isHalftime = matchStatus?.toLowerCase() === "break";

  if (inShootout) {
    return "newtab-sports-widget-match-penalties";
  }
  if (isExtraTime) {
    return "newtab-sports-widget-match-extra-time";
  }
  if (isHalftime) {
    return "newtab-sports-widget-match-halftime";
  }
  return null;
}

function ScorePill({
  homeScore,
  awayScore,
  homePenalty,
  awayPenalty,
  variant,
}) {
  return (
    <div className={`sports-score-pill sports-score-pill-${variant}`}>
      {homePenalty !== null && homePenalty !== undefined && (
        <span className="sports-score-penalty">({homePenalty})</span>
      )}
      <span className="sports-score-home">{homeScore}</span>
      <span aria-hidden="true">-</span>
      <span className="sports-score-away">{awayScore}</span>
      {awayPenalty !== null && awayPenalty !== undefined && (
        <span className="sports-score-penalty">({awayPenalty})</span>
      )}
    </div>
  );
}

// Renders one side of a match row: the team flag and code, or a placeholder
// when the team is not yet decided.
function MatchTeam({ team, isFollowed, localizedName }) {
  if (!team) {
    return (
      <div className="sports-match-team">
        <span className="sports-match-flag-wrapper">
          <span
            className="sports-match-flag sports-match-flag-tbd"
            aria-hidden="true"
          />
        </span>
        <span className="sports-match-code">{TBD_PLACEHOLDER}</span>
      </div>
    );
  }
  const displayName = localizedName ?? team.name;
  // Display the ISO region to match other platforms; team.key stays the
  // internal identity key. Fall back to key when region is absent.
  const displayCode = team.region ?? team.key;
  return (
    <div className="sports-match-team">
      <span
        className={`sports-match-flag-wrapper${isFollowed ? " is-followed" : ""}`}
      >
        <img
          className="sports-match-flag"
          src={team.icon_url}
          alt={displayName}
          title={displayName}
        />
        {isFollowed && (
          <span className="sports-match-flag-check" aria-hidden="true" />
        )}
      </span>
      <span className="sports-match-code">
        {isFollowed ? <strong>{displayCode}</strong> : displayCode}
      </span>
    </div>
  );
}

// Fallback shown in the Upcoming tab if the backend returns no matches.
function UpcomingMatchPlaceholder({ size = "large" }) {
  return (
    <>
      <div
        className={`sports-match-row sports-match-row-${size} sports-match-row-placeholder`}
        aria-hidden="true"
      >
        <MatchTeam team={null} />
        <div className="sports-match-upcoming">
          <span
            className="sports-match-time sports-match-vs"
            data-l10n-id="newtab-sports-widget-match-vs"
          />
        </div>
        <MatchTeam team={null} />
      </div>
      {size === "large" && (
        <p className="sports-upcoming-empty-info">
          <span
            className="sports-upcoming-empty-info-icon"
            aria-hidden="true"
          />
          <span data-l10n-id="newtab-sports-widget-no-upcoming-matches" />
        </p>
      )}
    </>
  );
}

function SportsMatchRow({
  match,
  variant,
  size = "large",
  handleInteraction,
  followedTeams,
  tbdTeamName = "",
  localizedNames,
}) {
  const dispatch = useDispatch();
  // Read the widget size pref (not `size`, which can be "list" when the
  // user expanded the view) so the telemetry event below reports the user's
  // actual chosen size.
  const widgetSize = useSelector(
    state => state.Prefs.values[PREF_SPORTS_WIDGET_SIZE] || "medium"
  );
  const {
    home_team,
    away_team,
    date,
    status_type,
    period,
    status: matchStatus,
    home_score,
    away_score,
    home_penalty,
    away_penalty,
    query,
  } = match;
  const isHomeFollowed = !!(home_team && followedTeams?.has(home_team.key));
  const isAwayFollowed = !!(away_team && followedTeams?.has(away_team.key));
  const homeTeamName = home_team
    ? (localizedNames?.[home_team.key] ?? home_team.name)
    : tbdTeamName;
  const awayTeamName = away_team
    ? (localizedNames?.[away_team.key] ?? away_team.name)
    : tbdTeamName;
  const dateTimestamp = new Date(date).getTime();
  const displayHomeScore = home_score || 0;
  const displayAwayScore = away_score || 0;
  // A match went to a shootout only when both penalty scores are present.
  // Checking both guards against asymmetric/corrupt data where one side is
  // null — which would otherwise pass a `null` into the aria-label args.
  const hasPenalties =
    home_penalty !== null &&
    home_penalty !== undefined &&
    away_penalty !== null &&
    away_penalty !== undefined;

  // Picks the Fluent message + args used to translate the row's aria-label.
  // We pick a separate Fluent ID per sub-case (penalty shootout for results,
  // non-scheduled status for upcoming) instead of using Fluent selectors, so
  // translators see complete sentences and the strings are independently
  // translatable.
  function getAriaLabelL10n() {
    const teams = { homeTeam: homeTeamName, awayTeam: awayTeamName };
    if (variant === "results") {
      if (hasPenalties) {
        return {
          id: "newtab-sports-widget-match-aria-label-results-penalties",
          args: {
            ...teams,
            homeScore: displayHomeScore,
            awayScore: displayAwayScore,
            homePenalty: home_penalty,
            awayPenalty: away_penalty,
          },
        };
      }
      return {
        id: "newtab-sports-widget-match-aria-label-results",
        args: {
          ...teams,
          homeScore: displayHomeScore,
          awayScore: displayAwayScore,
        },
      };
    }
    if (variant === "now") {
      return {
        id: "newtab-sports-widget-match-aria-label-now",
        args: {
          ...teams,
          homeScore: displayHomeScore,
          awayScore: displayAwayScore,
        },
      };
    }
    // Upcoming. Non-scheduled statuses use a per-status Fluent ID; the
    // default ("scheduled") announces kickoff time/date.
    const upcomingId =
      UPCOMING_STATUS_ARIA_L10N_MAP[status_type?.toLowerCase()] ||
      "newtab-sports-widget-match-aria-label-upcoming";
    return {
      id: upcomingId,
      args: { ...teams, date: dateTimestamp },
    };
  }
  const ariaLabelL10n = getAriaLabelL10n();

  function renderMiddle() {
    switch (variant) {
      case "now": {
        const liveL10nId = liveStatusL10nId({
          period,
          status: matchStatus,
          home_penalty,
          away_penalty,
        });
        // The Now tab's live status footer is only shown in the large widget.
        if (!liveL10nId || size !== "large") {
          return (
            <ScorePill
              homeScore={displayHomeScore}
              awayScore={displayAwayScore}
              homePenalty={home_penalty}
              awayPenalty={away_penalty}
              variant="now"
            />
          );
        }
        return (
          <div className="sports-match-live">
            <ScorePill
              homeScore={displayHomeScore}
              awayScore={displayAwayScore}
              homePenalty={home_penalty}
              awayPenalty={away_penalty}
              variant="now"
            />
            <div className="sports-match-live-footer">
              <span data-l10n-id={liveL10nId} />
            </div>
          </div>
        );
      }
      case "results": {
        // Per Figma the Results footer is always "Full time" (optionally
        // "• Penalties"); default to it for unmapped status_types so any
        // stale live-state value that leaks into this bucket doesn't render
        // raw API text in the UI.
        const resultsStatusL10nId =
          RESULTS_STATUS_L10N_MAP[status_type?.toLowerCase()] ||
          "newtab-sports-widget-match-full-time";
        // The medium widget lacks room for "Full time • Penalties", so for a
        // penalty shootout it shows "Penalties" alone instead. Large keeps
        // both; list shows only the status (as in the "view all" view).
        const mediumPenaltiesOnly = hasPenalties && size === "medium";
        return (
          <div className="sports-match-result">
            <ScorePill
              homeScore={displayHomeScore}
              awayScore={displayAwayScore}
              homePenalty={home_penalty}
              awayPenalty={away_penalty}
              variant="results"
            />
            <div className="sports-match-result-footer">
              <span
                data-l10n-id={
                  mediumPenaltiesOnly
                    ? "newtab-sports-widget-match-penalties"
                    : resultsStatusL10nId
                }
              />
              {hasPenalties && size === "large" && (
                <>
                  <span aria-hidden="true">•</span>
                  <span data-l10n-id="newtab-sports-widget-match-penalties" />
                </>
              )}
            </div>
          </div>
        );
      }
      // Default is the upcoming variant
      default: {
        const statusL10nId =
          UPCOMING_STATUS_L10N_MAP[status_type?.toLowerCase()];
        const dateArgs = JSON.stringify({ date: dateTimestamp });
        return (
          <div className="sports-match-upcoming">
            <span
              className="sports-match-time"
              data-l10n-id="newtab-sports-widget-match-time"
              data-l10n-args={dateArgs}
            />
            {statusL10nId ? (
              <span
                className="sports-widget-match-status"
                data-l10n-id={statusL10nId}
              />
            ) : (
              <span
                className="sports-match-date"
                data-l10n-id="newtab-sports-widget-key-date"
                data-l10n-args={dateArgs}
              />
            )}
          </div>
        );
      }
    }
  }

  // Hand the click off to the main process, which calls
  // SearchUIUtils.loadSearch to resolve the user's default engine, navigate
  // (handling POST + private windows), and record SAP telemetry. We also
  // dispatch a WIDGETS_USER_EVENT so newtab-side telemetry can attribute
  // the click to the right tab variant + widget size.
  function openMatchSearch(event) {
    if (!query) {
      return;
    }
    event.preventDefault();
    dispatch(
      ac.OnlyToMain({
        type: at.WIDGETS_USER_EVENT,
        data: {
          widget_name: "sports",
          widget_source: "widget",
          user_action: USER_ACTION_TYPES.OPEN_MATCH_SEARCH,
          action_value: variant,
          widget_size: widgetSize,
        },
      })
    );
    dispatch(
      ac.OnlyToMain({
        type: at.WIDGETS_SPORTS_OPEN_MATCH_SEARCH,
        data: {
          query,
          eventInfo: {
            button: event.button,
            shiftKey: event.shiftKey,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey,
          },
        },
      })
    );
    handleInteraction?.();
  }

  function onKeyDown(event) {
    // Anchor without an href doesn't fire click on Enter/Space, so wire it
    // up manually to keep keyboard activation working.
    if (event.key === "Enter" || event.key === " ") {
      openMatchSearch(event);
    }
  }

  const clickable = !!query;
  return (
    <a
      className={`sports-match-row sports-match-row-${size}${clickable ? " clickable" : ""}`}
      data-l10n-id={ariaLabelL10n.id}
      data-l10n-args={JSON.stringify(ariaLabelL10n.args)}
      {...(clickable && {
        role: "link",
        tabIndex: 0,
        onClick: openMatchSearch,
        onKeyDown,
      })}
    >
      {/* (developer note): Replace href with SERP link. */}
      <MatchTeam
        team={home_team}
        isFollowed={isHomeFollowed}
        localizedName={localizedNames?.[home_team?.key]}
      />
      {renderMiddle()}
      <MatchTeam
        team={away_team}
        isFollowed={isAwayFollowed}
        localizedName={localizedNames?.[away_team?.key]}
      />
    </a>
  );
}

export { SportsMatchRow, UpcomingMatchPlaceholder };
