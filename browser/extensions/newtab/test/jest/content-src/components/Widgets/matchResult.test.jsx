/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  getMatchWinnerKey,
  getTournamentPlacements,
  getFinishedTournamentMatches,
} from "content-src/components/Widgets/SportsWidget/matchResult.mjs";

function match(overrides = {}) {
  return {
    home_team: { key: "MEX" },
    away_team: { key: "RSA" },
    home_score: 0,
    away_score: 0,
    home_extra: null,
    away_extra: null,
    home_penalty: null,
    away_penalty: null,
    ...overrides,
  };
}

describe("getMatchWinnerKey", () => {
  it("returns null for a null match", () => {
    expect(getMatchWinnerKey(null)).toBeNull();
  });

  it("returns the home key when home scores more", () => {
    expect(getMatchWinnerKey(match({ home_score: 2, away_score: 1 }))).toBe(
      "MEX"
    );
  });

  it("returns the away key when away scores more", () => {
    expect(getMatchWinnerKey(match({ home_score: 0, away_score: 3 }))).toBe(
      "RSA"
    );
  });

  it("ignores home_extra/away_extra (already included in the score)", () => {
    // home_score/away_score already include extra-time goals, so the *_extra
    // fields must not be added again.
    expect(
      getMatchWinnerKey(
        match({
          home_score: 2,
          away_score: 1,
          home_extra: 1,
          away_extra: 0,
        })
      )
    ).toBe("MEX");
  });

  it("returns null for a draw with no shootout", () => {
    expect(
      getMatchWinnerKey(match({ home_score: 1, away_score: 1 }))
    ).toBeNull();
  });

  it("resolves a level match by the penalty shootout", () => {
    expect(
      getMatchWinnerKey(
        match({
          home_score: 1,
          away_score: 1,
          home_penalty: 4,
          away_penalty: 5,
        })
      )
    ).toBe("RSA");
  });

  it("treats equal penalties as a draw (no winner)", () => {
    expect(
      getMatchWinnerKey(
        match({
          home_score: 0,
          away_score: 0,
          home_penalty: 3,
          away_penalty: 3,
        })
      )
    ).toBeNull();
  });
});

describe("getTournamentPlacements", () => {
  const finalMatch = match({
    stage: "Final",
    home_team: { key: "ARG" },
    away_team: { key: "FRA" },
    home_score: 3,
    away_score: 2,
  });
  const bronzeMatch = match({
    stage: "Bronze Final",
    home_team: { key: "CRO" },
    away_team: { key: "MAR" },
    home_score: 2,
    away_score: 1,
  });

  it("returns all-null placements for empty or missing input", () => {
    expect(getTournamentPlacements([])).toEqual({
      champion: null,
      runnerUp: null,
      third: null,
    });
    expect(getTournamentPlacements(undefined)).toEqual({
      champion: null,
      runnerUp: null,
      third: null,
    });
  });

  it("derives champion and runner-up from the Final", () => {
    const { champion, runnerUp } = getTournamentPlacements([finalMatch]);
    expect(champion.team.key).toBe("ARG");
    expect(champion.match).toBe(finalMatch);
    expect(runnerUp.team.key).toBe("FRA");
    expect(runnerUp.match).toBe(finalMatch);
  });

  it("derives third place from the Bronze Final winner", () => {
    const { third } = getTournamentPlacements([bronzeMatch, finalMatch]);
    expect(third.team.key).toBe("CRO");
    expect(third.match).toBe(bronzeMatch);
  });

  it("recognizes the '3rd Place' stage (the string the feed sends)", () => {
    const thirdPlace = match({
      stage: "3rd Place",
      home_team: { key: "CRO" },
      away_team: { key: "MAR" },
      home_score: 2,
      away_score: 1,
    });
    const { third } = getTournamentPlacements([thirdPlace]);
    expect(third.team.key).toBe("CRO");
  });

  it("resolves the Final by penalty shootout", () => {
    const shootout = match({
      stage: "Final",
      home_team: { key: "ESP" },
      away_team: { key: "ENG" },
      home_score: 1,
      away_score: 1,
      home_penalty: 5,
      away_penalty: 4,
    });
    const { champion, runnerUp } = getTournamentPlacements([shootout]);
    expect(champion.team.key).toBe("ESP");
    expect(runnerUp.team.key).toBe("ENG");
  });

  it("leaves placements null while their match is undecided", () => {
    const undecidedFinal = match({
      stage: "Final",
      home_team: { key: "ARG" },
      away_team: { key: "FRA" },
      home_score: 1,
      away_score: 1,
    });
    const { champion, runnerUp, third } = getTournamentPlacements([
      undecidedFinal,
    ]);
    expect(champion).toBeNull();
    expect(runnerUp).toBeNull();
    expect(third).toBeNull();
  });
});

describe("getFinishedTournamentMatches", () => {
  it("returns an empty list for missing or empty buckets", () => {
    expect(getFinishedTournamentMatches()).toEqual([]);
    expect(getFinishedTournamentMatches({})).toEqual([]);
    expect(getFinishedTournamentMatches({ previous: [], current: [] })).toEqual(
      []
    );
  });

  it("includes every previous match", () => {
    const a = match({ stage: "Final" });
    const b = match({ stage: "Bronze Final" });
    expect(getFinishedTournamentMatches({ previous: [a, b] })).toEqual([a, b]);
  });

  it("includes finished matches still sitting in current (past/final/ended)", () => {
    for (const status of ["past", "final", "Ended"]) {
      const finished = match({ stage: "3rd Place", status_type: status });
      expect(
        getFinishedTournamentMatches({ previous: [], current: [finished] })
      ).toEqual([finished]);
    }
  });

  it("excludes live and scheduled matches in current", () => {
    const live = match({ stage: "Final", status_type: "live" });
    const halftime = match({ stage: "Final", status_type: "Halftime" });
    const scheduled = match({ stage: "Final", status_type: "scheduled" });
    expect(
      getFinishedTournamentMatches({ current: [live, halftime, scheduled] })
    ).toEqual([]);
  });

  it("surfaces third place from a 3rd Place match still in current on match day", () => {
    // The third-place match has finished (status "past", lingering in `current`
    // before the backend resync) while the Final is still live: third resolves,
    // but the live Final must not be crowned. Mirrors the real WC mock data:
    // BRA 0-0 FRA decided on penalties (2-4).
    const thirdInCurrent = match({
      stage: "3rd Place",
      status_type: "past",
      home_team: { key: "BRA" },
      away_team: { key: "FRA" },
      home_score: 0,
      away_score: 0,
      home_penalty: 2,
      away_penalty: 4,
    });
    const liveFinal = match({
      stage: "Final",
      status_type: "live",
      home_team: { key: "ARG" },
      away_team: { key: "IRQ" },
      home_score: 1,
      away_score: 0,
    });
    const { champion, runnerUp, third } = getTournamentPlacements(
      getFinishedTournamentMatches({
        previous: [],
        current: [thirdInCurrent, liveFinal],
      })
    );
    expect(champion).toBeNull();
    expect(runnerUp).toBeNull();
    expect(third.team.key).toBe("FRA");
  });
});
