/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useState } from "react";
import { CLOCK_CITIES, clockCityFluentId } from "./ClockCityRegistry.mjs";

// Resolves curated cities' localized names into a { cityId: name } map. Pass
// `cityIds` for just those (e.g. the shown clocks), or omit for all (search).
// Empty until resolved.
export const useCuratedCityNames = (cityIds = null) => {
  const [names, setNames] = useState({});
  // Stable dependency: re-resolve when the requested set changes, not when a
  // fresh array with the same ids is passed on each render.
  const idsKey = cityIds ? [...cityIds].sort().join(",") : "*";

  useEffect(() => {
    // null/omitted resolves the full list (search); an explicit array resolves
    // exactly those ids (an empty array resolves nothing).
    const ids = cityIds === null ? CLOCK_CITIES.map(city => city.id) : cityIds;
    if (!ids.length) {
      return undefined;
    }
    let cancelled = false;
    document.l10n
      .formatValues(ids.map(id => ({ id: clockCityFluentId(id) })))
      .then(values => {
        if (cancelled) {
          return;
        }
        const resolved = {};
        ids.forEach((id, index) => {
          if (values[index]) {
            resolved[id] = values[index];
          }
        });
        setNames(resolved);
      });
    return () => {
      cancelled = true;
    };
    // idsKey captures the meaningful change; cityIds identity is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return names;
};
