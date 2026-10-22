/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useEffect, useRef } from "react";

export const CarouselNav = ({ items = [], activeId, onSelect, navLabel }) => {
  const groupRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return undefined;
    }
    const handleChange = () => onSelectRef.current?.(group.value);
    group.addEventListener("change", handleChange);
    return () => group.removeEventListener("change", handleChange);
  }, []);

  const pillItems = items.filter(item => item?.pill && item.id);
  if (pillItems.length < 2) {
    return null;
  }

  const labelProps = navLabel?.raw
    ? { "aria-label": navLabel.raw }
    : { "data-l10n-id": navLabel?.string_id ?? "onboarding-carousel-nav" };

  return (
    <div className="carousel-nav">
      <moz-segmented-control ref={groupRef} value={activeId} {...labelProps}>
        {pillItems.map(({ id, pill }) => (
          <moz-segmented-control-item
            key={id}
            value={id}
            label={pill.label?.raw}
            data-l10n-id={pill.label?.string_id}
            iconsrc={pill.icon}
          />
        ))}
      </moz-segmented-control>
    </div>
  );
};
