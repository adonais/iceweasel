/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useRef, useState } from "react";

/**
 * Subscribe to a panel-list's open/close lifecycle.
 *
 * @param {Element|null|undefined} panelList
 *   The <panel-list> element (e.g. a ref's `.current`). A nullish value is a
 *   no-op, so callers don't need their own guard.
 * @param {object} handlers
 * @param {function} [handlers.onShown]  Called when the panel-list opens.
 * @param {function} [handlers.onHidden] Called when the panel-list closes.
 * @returns {function} Cleanup that removes the listeners.
 */
export function subscribePanelListToggle(
  panelList,
  { onShown, onHidden } = {}
) {
  if (!panelList) {
    return () => {};
  }
  const handleShown = () => onShown?.();
  const handleHidden = () => onHidden?.();
  panelList.addEventListener("shown", handleShown);
  panelList.addEventListener("hidden", handleHidden);
  return () => {
    panelList.removeEventListener("shown", handleShown);
    panelList.removeEventListener("hidden", handleHidden);
  };
}

/**
 * A reusable hook that wraps subscribePanelListToggle. Returns whether the
 * paired panel-list is currently open, and optionally runs onShown/onHidden side
 * effects on the events themselves (not on mount). Handlers may change identity
 * between renders without re-subscribing.
 *
 * @param {React.RefObject} panelListRef Ref to the <panel-list> element.
 * @param {object} [handlers]
 * @param {function} [handlers.onShown]
 * @param {function} [handlers.onHidden]
 * @returns {boolean} Whether the panel-list is open.
 */
export function usePanelListIsOpen(panelListRef, { onShown, onHidden } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const handlersRef = useRef({ onShown, onHidden });
  handlersRef.current = { onShown, onHidden };

  useEffect(
    () =>
      subscribePanelListToggle(panelListRef.current, {
        onShown: () => {
          setIsOpen(true);
          handlersRef.current.onShown?.();
        },
        onHidden: () => {
          setIsOpen(false);
          handlersRef.current.onHidden?.();
        },
      }),
    [panelListRef]
  );

  return isOpen;
}
