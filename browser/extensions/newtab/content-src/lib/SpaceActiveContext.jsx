/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";

/**
 * Whether the enclosing space is the active one. Impression observers only
 * observe while it is true, since a peeked space does not register impressions.
 * Observing again on activation reports what is already in view.
 */
export const SpaceActiveContext = React.createContext(true);
