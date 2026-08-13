/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Resolves the winning team's `key` for a finished match, or null for a draw.
// home_score/away_score already include extra-time goals; a penalty shootout
// decides it when the score is level.
export const getMatchWinnerKey = match => {
  if (!match) {
    return null;
  }
  const homeScore = match.home_score || 0;
  const awayScore = match.away_score || 0;
  if (homeScore > awayScore) {
    return match.home_team.key;
  }
  if (awayScore > homeScore) {
    return match.away_team.key;
  }
  // Level aggregate: a shootout decides it only when both penalty scores are
  // present (mirrors the SportsMatchRow `hasPenalties` guard).
  const hasPenalties =
    match.home_penalty !== null &&
    match.home_penalty !== undefined &&
    match.away_penalty !== null &&
    match.away_penalty !== undefined;
  if (hasPenalties && match.home_penalty !== match.away_penalty) {
    return match.home_penalty > match.away_penalty
      ? match.home_team.key
      : match.away_team.key;
  }
  return null;
};

// Accept both observed names for the third-place match.
const FINAL_STAGES = new Set(["final"]);
const BRONZE_FINAL_STAGES = new Set(["3rd place", "bronze final"]);

export const isFinalStage = stage => FINAL_STAGES.has(stage?.toLowerCase());

export const isBronzeFinalStage = stage =>
  BRONZE_FINAL_STAGES.has(stage?.toLowerCase());

// "past" is expected; the aliases keep just-ended current-bucket matches safe.
const FINISHED_STATUS_TYPES = new Set(["past", "final", "ended"]);

const resolveWinnerLoser = match => {
  const winnerKey = getMatchWinnerKey(match);
  if (!winnerKey) {
    return null;
  }
  const homeWon = winnerKey === match.home_team.key;
  return {
    winner: homeWon ? match.home_team : match.away_team,
    loser: homeWon ? match.away_team : match.home_team,
  };
};

export const getTournamentPlacements = matches => {
  const placements = { champion: null, runnerUp: null, third: null };
  if (!matches?.length) {
    return placements;
  }
  const finalMatch = matches.find(match => isFinalStage(match?.stage));
  const finalResult = resolveWinnerLoser(finalMatch);
  if (finalResult) {
    placements.champion = { team: finalResult.winner, match: finalMatch };
    placements.runnerUp = { team: finalResult.loser, match: finalMatch };
  }
  const bronzeMatch = matches.find(match => isBronzeFinalStage(match?.stage));
  const bronzeResult = resolveWinnerLoser(bronzeMatch);
  if (bronzeResult) {
    placements.third = { team: bronzeResult.winner, match: bronzeMatch };
  }
  return placements;
};

// Include finished current-bucket matches; the backend may not resync them to
// `previous` immediately.
export const getFinishedTournamentMatches = (rawMatches = {}) => {
  const previous = rawMatches?.previous ?? [];
  const current = rawMatches?.current ?? [];
  return [
    ...previous,
    ...current.filter(match =>
      FINISHED_STATUS_TYPES.has(match?.status_type?.toLowerCase())
    ),
  ];
};
