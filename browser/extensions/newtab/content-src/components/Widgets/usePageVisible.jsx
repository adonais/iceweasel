/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useEffect, useState } from "react";

// Tracks page visibility. New tabs are preloaded and render while hidden, so a
// one-shot effect on mount would spend itself before the user could see it.
export const usePageVisible = () => {
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document === "undefined" || document.visibilityState === "visible"
  );

  useEffect(() => {
    const onVisibility = () =>
      setIsPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return isPageVisible;
};
