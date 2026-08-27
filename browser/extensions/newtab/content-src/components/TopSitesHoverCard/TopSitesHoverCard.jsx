/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ReactReduxContext, useSelector } from "react-redux";
import { HOVER_CARD_CONTENT } from "content-src/components/TopSitesHoverCard/hover-card-content";
import { isWebNotificationsEnabled } from "content-src/lib/web-notification-match.mjs";
import React from "react";

/**
 * Applies the web notifications feature gate, then routes the tile to exactly
 * one content variant from the registry (see hover-card-content.jsx). The
 * chosen variant owns the full card chrome and decides whether it has anything
 * to paint.
 *
 * @param link The top site link object for the hovered tile.
 */
function HoverCardContent({ link }) {
  const enabled = useSelector(isWebNotificationsEnabled);

  if (!enabled) {
    return null;
  }

  const variant = HOVER_CARD_CONTENT.find(entry => entry.match(link));
  if (!variant) {
    return null;
  }

  const { Component } = variant;
  return <Component link={link} />;
}

/**
 * Floating card shown on hover over a top site tile, rendered as a descendant
 * of the tile's `.top-site-inner`, which owns the positioning context and CSS
 * hover visibility.
 *
 * Every tile renders this, including bare tile mounts in unit tests that have
 * no redux Provider. Bail before any store access in that case; the running
 * app always has a Provider, so the content renders normally there.
 *
 * @param link The top site link object for the hovered tile.
 */
function TopSitesHoverCard({ link }) {
  const store = React.useContext(ReactReduxContext);
  if (!store) {
    return null;
  }
  return <HoverCardContent link={link} />;
}

export { TopSitesHoverCard };
