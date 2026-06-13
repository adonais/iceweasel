/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";

const DEFAULT_GRADIENT_STOPS = [
  { offset: "0%", color: "var(--color-orange-20)" },
  { offset: "28%", color: "var(--color-orange-30)" },
  { offset: "64%", color: "var(--color-pink-30)" },
  { offset: "100%", color: "var(--color-pink-40)" },
];

export const WidgetCelebration = ({
  classNamePrefix = "widget-celebration",
  celebrationFrame,
  celebrationId,
  gradientStops = DEFAULT_GRADIENT_STOPS,
  headlineL10nId,
  illustrationSrc,
  onComplete,
  subheadL10nId,
}) => {
  const className = suffix =>
    suffix ? `${classNamePrefix}-${suffix}` : classNamePrefix;
  const resolvedIllustrationSrc = illustrationSrc?.endsWith(".svg")
    ? `${illustrationSrc}?run=${celebrationId}`
    : illustrationSrc;
  const strokeSize = celebrationFrame.strokeInset * 2;
  const strokeWidth = celebrationFrame.width - strokeSize;
  const strokeHeight = celebrationFrame.height - strokeSize;

  return (
    <div
      className={className()}
      key={celebrationId}
      role="status"
      aria-live="polite"
      onAnimationEnd={event => {
        if (
          event.target === event.currentTarget &&
          event.animationName === "widget-celebration-lifecycle"
        ) {
          onComplete?.();
        }
      }}
    >
      <div className={className("effects")} aria-hidden="true">
        <svg
          viewBox={`0 0 ${celebrationFrame.width} ${celebrationFrame.height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id={`${classNamePrefix}-gradient-${celebrationId}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              {gradientStops.map(({ offset, color }) => (
                <stop key={offset} offset={offset} stopColor={color} />
              ))}
            </linearGradient>
          </defs>
          <rect
            className={className("stroke-track")}
            x={celebrationFrame.strokeInset}
            y={celebrationFrame.strokeInset}
            width={strokeWidth}
            height={strokeHeight}
            rx={celebrationFrame.radius}
            ry={celebrationFrame.radius}
            pathLength="100"
          />
          <rect
            className={className("stroke")}
            x={celebrationFrame.strokeInset}
            y={celebrationFrame.strokeInset}
            width={strokeWidth}
            height={strokeHeight}
            rx={celebrationFrame.radius}
            ry={celebrationFrame.radius}
            pathLength="100"
            stroke={`url(#${classNamePrefix}-gradient-${celebrationId})`}
          />
          <rect
            className={className("stroke-orbit")}
            x={celebrationFrame.strokeInset}
            y={celebrationFrame.strokeInset}
            width={strokeWidth}
            height={strokeHeight}
            rx={celebrationFrame.radius}
            ry={celebrationFrame.radius}
            pathLength="100"
          />
        </svg>
      </div>
      <div className={className("copy")}>
        <span className={className("headline")} data-l10n-id={headlineL10nId} />
        <span className={className("subhead")} data-l10n-id={subheadL10nId} />
      </div>
      {resolvedIllustrationSrc && (
        <img
          alt=""
          aria-hidden="true"
          className={className("illustration")}
          src={resolvedIllustrationSrc}
        />
      )}
    </div>
  );
};
