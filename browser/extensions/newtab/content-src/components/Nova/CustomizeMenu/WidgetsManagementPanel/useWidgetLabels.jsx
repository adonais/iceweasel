/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @nova-cleanup(move-directory): Move to components/CustomizeMenu/WidgetsManagementPanel/ after Nova ships

import { useEffect, useState } from "react";

/**
 * Returns the customize panel toggle label of each widget by widget id, or
 * null while the labels are still resolving. A label that does not resolve
 * maps to its widget id. Without document.l10n (jest) the map is built on the
 * first render: an asynchronous fallback would update state after a test's
 * act() and fail whichever suite mounted the panel.
 *
 * @param {{ id: string, customizeL10nId: string }[]} widgets
 * @returns {Map<string, string>|null}
 */
export function useWidgetLabels(widgets) {
  const widgetIds = widgets.map(w => w.id).join();
  const hasL10n =
    typeof document !== "undefined" && Boolean(document.l10n?.formatMessages);
  const [labels, setLabels] = useState(() =>
    hasL10n ? null : new Map(widgets.map(w => [w.id, w.id]))
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
          widgets.map(w => ({ id: w.customizeL10nId }))
        );
      } catch (e) {
        // Keep the panel usable if localisation fails.
      }

      if (cancelled) {
        return;
      }

      setLabels(
        new Map(
          widgets.map((w, i) => [
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
    // widgetIds captures the meaningful change; widgets is a new array each
    // render, so depending on it would rerun the effect every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetIds, hasL10n]);

  return labels;
}
