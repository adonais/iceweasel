/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act, renderHook, waitFor } from "@testing-library/react";
import { useWidgetLabels } from "content-src/components/Nova/CustomizeMenu/WidgetsManagementPanel/useWidgetLabels.jsx";

const WIDGETS = [
  { id: "clocks", customizeL10nId: "newtab-custom-widget-clock-toggle" },
  { id: "weather", customizeL10nId: "newtab-custom-widget-weather-toggle" },
];

describe("useWidgetLabels", () => {
  afterEach(() => {
    delete document.l10n;
  });

  it("builds the id map on the first render without document.l10n", () => {
    const { result } = renderHook(() => useWidgetLabels(WIDGETS));

    expect([...result.current]).toEqual([
      ["clocks", "clocks"],
      ["weather", "weather"],
    ]);
  });

  it("maps every widget to its own id when the lookup rejects", async () => {
    document.l10n = {
      formatMessages: jest.fn(() => Promise.reject(new Error("no messages"))),
    };

    const { result } = renderHook(() => useWidgetLabels(WIDGETS));

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect([...result.current]).toEqual([
      ["clocks", "clocks"],
      ["weather", "weather"],
    ]);
  });

  it("ignores a lookup that resolves after the widget list changed", async () => {
    const pending = [];
    document.l10n = {
      formatMessages: jest.fn(
        () => new Promise(resolve => pending.push(resolve))
      ),
    };

    const { result, rerender } = renderHook(
      widgets => useWidgetLabels(widgets),
      { initialProps: WIDGETS }
    );
    rerender([WIDGETS[0]]);
    await act(async () => {
      pending[1]([null]);
      pending[0]([null, null]);
    });

    expect([...result.current]).toEqual([["clocks", "clocks"]]);
  });
});
