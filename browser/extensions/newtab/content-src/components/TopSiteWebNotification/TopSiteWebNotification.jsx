/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ReactReduxContext, useSelector } from "react-redux";
import {
  getNotificationIdsForUrl,
  isWebNotificationsEnabled,
} from "content-src/lib/web-notification-match.mjs";
import React from "react";

function Badge({ link }) {
  const enabled = useSelector(isWebNotificationsEnabled);
  const count = useSelector(
    state => getNotificationIdsForUrl(state, link?.url).length
  );

  if (!enabled || !count) {
    return null;
  }
  return <div className="top-site-web-notification">{count}</div>;
}

/**
 * Count badge on a top site tile for the site's web notifications. Rendered on
 * every tile (including bare tile mounts in tests with no redux Provider), so it
 * bails before any store access when there is no store; the running app always
 * has one.
 *
 * @param link The top site link object for the tile.
 */
function TopSiteWebNotification({ link }) {
  const store = React.useContext(ReactReduxContext);
  if (!store) {
    return null;
  }
  return <Badge link={link} />;
}

export { TopSiteWebNotification };
