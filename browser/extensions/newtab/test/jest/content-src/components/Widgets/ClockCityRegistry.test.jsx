/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { readFileSync } from "fs";
import path from "path";
import { CLOCK_CITIES } from "content-src/components/Widgets/Clocks/ClockCityRegistry.mjs";

const NEWTAB_ROOT = path.resolve(__dirname, "../../../../..");
const ftl = readFileSync(
  path.join(
    NEWTAB_ROOT,
    "../../../browser/locales/en-US/browser/newtab/newtab.ftl"
  ),
  "utf8"
);

describe("ClockCityRegistry", () => {
  // A curated city's name is only localized if newtab-clock-city-<id> exists,
  // and its fallbackName duplicates that message's en-US value. Both drift
  // silently: a missing id or a changed value just falls back to English.
  it("pairs every curated city with its Fluent message and en-US name", () => {
    const messages = [
      ...ftl.matchAll(/^newtab-clock-city-([a-z0-9-]+) = (.+)$/gm),
    ].map(([, id, name]) => `${id} = ${name}`);
    expect(
      CLOCK_CITIES.map(
        ({ id, fallbackName }) => `${id} = ${fallbackName}`
      ).sort()
    ).toEqual(messages.sort());
  });
});
