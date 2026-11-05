/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @nova-cleanup(move-directory): Move to components/CustomizeMenu/WidgetsManagementPanel/ after Nova ships

import { useEffect, useState } from "react";

/**
 * Returns the customize panel toggle label of each widget by widget id, or
 * null while the Fluent labels are still resolving. Widgets with a
 * customizeL10nId are labeled by the .label attribute in that message, and
 * extension widgets without one are labeled with their name. A label that does
 * not resolve maps to its widget id. Without document.l10n (jest) the map is
 * built on the first render, with each customizeL10nId widget labeled with its
 * widget id: an asynchronous fallback would update state after a test's act()
 * and fail whichever suite mounted the panel.
 *
 * @param {{ id: string, customizeL10nId?: string, name?: string }[]} widgets
 * @returns {Map<string, string>|null}
 */
export function useWidgetLabels(widgets) {
  const localizedWidgets = widgets.filter(w => w.customizeL10nId);
  const widgetIds = localizedWidgets.map(w => w.id).join();
  const hasL10n =
    typeof document !== "undefined" && Boolean(document.l10n?.formatMessages);
  const [fluentLabels, setFluentLabels] = useState(() =>
    hasL10n ? null : new Map()
  );

  useEffect(() => {
    if (!hasL10n) {
      return undefined;
    }
    let cancelled = false;

    async function resolveLabels() {
      // The toggle labels ship as attribute-only Fluent messages
      // (`.label = ...`), so we use formatMessages and read the label
      // attribute rather than formatValues, which would return null.
      let messages = [];
      try {
        messages = await document.l10n.formatMessages(
          localizedWidgets.map(w => ({ id: w.customizeL10nId }))
        );
      } catch (e) {
        // Keep the panel usable if localisation fails.
      }

      if (cancelled) {
        return;
      }

      setFluentLabels(
        new Map(
          localizedWidgets.map((w, i) => [
            w.id,
            messages[i]?.attributes?.find(attr => attr.name === "label")
              ?.value || w.id,
          ])
        )
      );
    }

    resolveLabels();

    return () => {
      cancelled = true;
    };
    // widgetIds captures the meaningful change; localizedWidgets is a new
    // array each render, so depending on it would rerun the effect every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetIds, hasL10n]);

  return (
    fluentLabels &&
    new Map(
      widgets.map(w => [
        w.id,
        w.customizeL10nId ? (fluentLabels.get(w.id) ?? w.id) : (w.name ?? w.id),
      ])
    )
  );
}
