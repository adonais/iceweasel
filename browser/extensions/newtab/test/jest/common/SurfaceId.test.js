/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isPlausibleSurfaceId } from "common/SurfaceId.mjs";

describe("isPlausibleSurfaceId", () => {
  // Every surface Merino can currently return, with a request that produces it.
  it.each([
    ["NEW_TAB_DE_AT", "de-AT", "AT"],
    ["NEW_TAB_DE_CH", "de", "CH"],
    ["NEW_TAB_DE_DE", "de-DE", "LU"],
    ["NEW_TAB_EN_CA", "en-CA", null],
    ["NEW_TAB_EN_GB", "en-US", "GB"],
    ["NEW_TAB_EN_IE", "en-GB", "IE"],
    ["NEW_TAB_EN_INTL", "en-US", "IN"],
    ["NEW_TAB_EN_ROW", "en-US", "DE"],
    ["NEW_TAB_EN_US", "ja", "JP"],
    ["NEW_TAB_ES_ES", "es-ES", null],
    ["NEW_TAB_ES_ROW", "es-MX", "MX"],
    ["NEW_TAB_FR_BE", "fr", "BE"],
    ["NEW_TAB_FR_FR", "fr", "CA"],
    ["NEW_TAB_IT_IT", "it", "CH"],
    ["NEW_TAB_PL_PL", "pl", "PL"],
  ])("accepts %s for locale %s and region %s", (surfaceId, locale, region) => {
    expect(isPlausibleSurfaceId(surfaceId, locale, region)).toBe(true);
  });

  it("accepts a new language's likely market without a client change", () => {
    expect(isPlausibleSurfaceId("NEW_TAB_PT_BR", "pt-PT", "PT")).toBe(true);
  });

  it.each([
    ["NEW_TAB_EN_AU", "en-NZ", "NZ"],
    ["NEW_TAB_DE_DE", "fr", "FR"],
    ["NEW_TAB_EN_US_1234", "en-US", "US"],
    ["new_tab_en_us", "en-US", "US"],
    ["", "en-US", "US"],
    [undefined, "en-US", "US"],
    ["NEW_TAB_EN_US", undefined, "US"],
  ])("rejects %s for locale %s and region %s", (surfaceId, locale, region) => {
    expect(isPlausibleSurfaceId(surfaceId, locale, region)).toBe(false);
  });
});
