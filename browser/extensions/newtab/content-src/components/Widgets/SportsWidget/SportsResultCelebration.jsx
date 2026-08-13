/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { SportsMatchRow } from "./SportsMatchRow";

// Alpha-channel WebM mascots (full-widget-frame, fox pre-composited) with a
// static first-frame poster so kit is in place before playback starts.
const CHAMPION_MASCOT =
  "chrome://newtab/content/data/content/assets/kit-champion.webm";
const CHAMPION_MASCOT_POSTER =
  "chrome://newtab/content/data/content/assets/kit-champion.png";
const DEFAULT_MASCOT =
  "chrome://newtab/content/data/content/assets/kit-default.webm";
const DEFAULT_MASCOT_POSTER =
  "chrome://newtab/content/data/content/assets/kit-default.png";

const SINGLE_PLACEMENT_LABELS = {
  champion: {
    large: "newtab-sports-widget-world-cup-champions",
    medium: "newtab-sports-widget-world-cup-champions-short",
  },
  runnerUp: {
    large: "newtab-sports-widget-runner-up",
    medium: "newtab-sports-widget-runner-up",
  },
  third: {
    large: "newtab-sports-widget-third-place",
    medium: "newtab-sports-widget-third-place",
  },
};

const PODIUM_LABELS = {
  champion: "newtab-sports-widget-champions",
  runnerUp: "newtab-sports-widget-runner-up",
  third: "newtab-sports-widget-third-place",
};

const ResultTeam = ({ team, teamName, labelL10nId, variant }) => (
  <div className={`sports-result-team sports-result-team-${variant}`}>
    <span className="sports-result-flag-wrapper">
      <img
        className="sports-result-flag"
        src={team.icon_url}
        alt={teamName}
        title={teamName}
      />
    </span>
    <span className="sports-result-text">
      <span className="sports-result-name">{teamName}</span>
      <span className="sports-result-placement" data-l10n-id={labelL10nId} />
    </span>
  </div>
);

const displayName = (team, localizedNames) =>
  localizedNames?.[team.key] ?? team.name;

export const SportsResultCard = ({
  team,
  type = "champion",
  size = "large",
  finalMatch = null,
  finalMatchVariant = "upcoming",
  tbdTeamName = "",
  localizedNames = null,
}) => {
  const labels =
    SINGLE_PLACEMENT_LABELS[type] ?? SINGLE_PLACEMENT_LABELS.champion;
  return (
    <div
      className={`sports-result-card sports-result-card-${type} sports-result-card-${size}`}
    >
      <div className="sports-result-surface">
        <ResultTeam
          team={team}
          teamName={displayName(team, localizedNames)}
          variant={type}
          labelL10nId={labels[size] ?? labels.large}
        />
        {finalMatch ? (
          <div className="sports-result-final">
            <p
              className="sports-result-final-label"
              data-l10n-id="newtab-sports-widget-final"
            />
            <SportsMatchRow
              match={finalMatch}
              variant={finalMatchVariant}
              size={size}
              tbdTeamName={tbdTeamName}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const SportsPodium = ({ placements, localizedNames = null }) => (
  <div className="sports-podium">
    <div className="sports-result-surface sports-podium-surface">
      <ResultTeam
        team={placements.champion.team}
        teamName={displayName(placements.champion.team, localizedNames)}
        variant="podium-champion"
        labelL10nId={PODIUM_LABELS.champion}
      />
      <ResultTeam
        team={placements.runnerUp.team}
        teamName={displayName(placements.runnerUp.team, localizedNames)}
        variant="podium-runner-up"
        labelL10nId={PODIUM_LABELS.runnerUp}
      />
      <ResultTeam
        team={placements.third.team}
        teamName={displayName(placements.third.team, localizedNames)}
        variant="podium-third"
        labelL10nId={PODIUM_LABELS.third}
      />
    </div>
  </div>
);

export const SportsResultMascot = ({ animationId = 0, view }) => {
  const isChampion = view === "champion";
  const src = isChampion ? CHAMPION_MASCOT : DEFAULT_MASCOT;
  const poster = isChampion ? CHAMPION_MASCOT_POSTER : DEFAULT_MASCOT_POSTER;
  // Remount per celebration (key) so playback restarts from the first frame.
  return (
    <video
      key={animationId}
      className={`sports-result-mascot sports-result-mascot-${view}`}
      src={src}
      poster={poster}
      autoPlay={true}
      loop={true}
      muted={true}
      playsInline={true}
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
};
