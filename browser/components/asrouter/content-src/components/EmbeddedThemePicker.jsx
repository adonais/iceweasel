/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useEffect, useRef } from "react";

export const EmbeddedThemePicker = ({ installSource }) => {
  const themePickerRef = useRef(null);

  useEffect(() => {
    if (installSource !== "about:welcome") {
      return;
    }
    // The widget may not be upgraded from a plain element yet when this
    // mounts, so wait for its class definition before calling `shown()`.
    customElements.whenDefined("theme-picker").then(() => {
      themePickerRef.current?.shown();
    });
  }, [installSource]);

  return (
    <theme-picker
      ref={themePickerRef}
      installsource={installSource}
    ></theme-picker>
  );
};
