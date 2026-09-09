/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { renderHook, waitFor } from "@testing-library/react";
import { CLOCK_CITIES } from "content-src/components/Widgets/Clocks/ClockCityRegistry.mjs";
import { useCuratedCityNames } from "content-src/components/Widgets/Clocks/useCuratedCityNames.jsx";

// jsdom has no document.l10n; about:newtab always does. Only Munich resolves
// so tests can cover both the resolved and the unresolved path.
const mockDocumentL10n = () => {
  document.l10n = {
    formatValues: jest.fn(async ids =>
      ids.map(({ id }) =>
        id === "newtab-clock-city-de-munich" ? "München" : null
      )
    ),
  };
};

describe("useCuratedCityNames", () => {
  beforeEach(mockDocumentL10n);
  afterEach(() => {
    delete document.l10n;
  });

  it("returns an empty map until l10n resolves", () => {
    const { result, unmount } = renderHook(() => useCuratedCityNames());
    expect(result.current).toEqual({});
    // Unmount before formatValues resolves so the hook's cleanup cancels the
    // setState that would otherwise fire outside act().
    unmount();
  });

  it("maps localized names by cityId and skips unresolved ids", async () => {
    const { result } = renderHook(() => useCuratedCityNames());
    await waitFor(() => expect(result.current["de-munich"]).toBe("München"));
    // Only the resolved id is present; null (unresolved) values are skipped.
    expect(Object.keys(result.current)).toEqual(["de-munich"]);
    // Requested every curated city's Fluent id.
    const [[requested]] = document.l10n.formatValues.mock.calls;
    expect(requested).toContainEqual({ id: "newtab-clock-city-us-new-york" });
    expect(requested.length).toBe(CLOCK_CITIES.length);
  });

  it("resolves only the requested cityIds when a subset is passed", async () => {
    const { result } = renderHook(() => useCuratedCityNames(["de-munich"]));
    await waitFor(() => expect(result.current["de-munich"]).toBe("München"));
    const [[requested]] = document.l10n.formatValues.mock.calls;
    expect(requested).toEqual([{ id: "newtab-clock-city-de-munich" }]);
  });

  it("does not call l10n for an empty cityIds list", () => {
    const { result } = renderHook(() => useCuratedCityNames([]));
    expect(result.current).toEqual({});
    expect(document.l10n.formatValues).not.toHaveBeenCalled();
  });
});
