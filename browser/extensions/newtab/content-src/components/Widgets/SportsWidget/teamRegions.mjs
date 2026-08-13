/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Team code to ISO 3166-1 alpha-2 region code accepted by
// Intl.DisplayNames. Covers the 43 qualified 2026 World Cup teams not
// in FLUENT_OVERRIDE_KEYS (see useLocalizedTeamNames.jsx). Teams Merino
// sends that are in neither map fall back to team.name.
//
// Production Merino sends a mix of FIFA codes and ISO 3166-1 alpha-3
// codes (and a couple of non-standard ones like CVI for Cabo Verde),
// so for teams where the two differ we list both keys mapping to the
// same alpha-2 — that way the lookup hits whichever the API delivers.
export const TEAM_REGION_CODES = {
  ALG: "DZ",
  ARG: "AR",
  AUS: "AU",
  AUT: "AT",
  BEL: "BE",
  BRA: "BR",
  CAN: "CA",
  CHE: "CH",
  COL: "CO",
  CPV: "CV",
  CRO: "HR",
  CUW: "CW",
  CVI: "CV",
  CZE: "CZ",
  ECU: "EC",
  EGY: "EG",
  ESP: "ES",
  FRA: "FR",
  GER: "DE",
  GHA: "GH",
  HAI: "HT",
  HRV: "HR",
  IRN: "IR",
  IRQ: "IQ",
  JOR: "JO",
  JPN: "JP",
  KOR: "KR",
  KSA: "SA",
  MAR: "MA",
  MEX: "MX",
  NED: "NL",
  NLD: "NL",
  NOR: "NO",
  NZL: "NZ",
  PAN: "PA",
  PAR: "PY",
  POR: "PT",
  PRT: "PT",
  QAT: "QA",
  RSA: "ZA",
  SEN: "SN",
  SUI: "CH",
  SWE: "SE",
  TUN: "TN",
  TUR: "TR",
  URU: "UY",
  URY: "UY",
  USA: "US",
  UZB: "UZ",
};
