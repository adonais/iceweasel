/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { DSCard } from "../DiscoveryStreamComponents/DSCard/DSCard";

// @experiment(remove) { bug 2069496 }
/**
 * The sponsored card in one cell of the widgets row.
 *
 * @param {object} spoc - a normalized spoc from state.DiscoveryStream.spocs
 * @param {Function} dispatch
 * @param {string} type - telemetry source
 */
export const WidgetsRowAd = ({ spoc, dispatch, type }) => (
  <DSCard
    id={spoc.id}
    flightId={spoc.flight_id}
    url={spoc.url}
    title={spoc.title}
    excerpt={spoc.excerpt}
    raw_image_src={spoc.raw_image_src}
    alt_text={spoc.alt_text}
    source={spoc.domain}
    sponsor={spoc.sponsor}
    sponsored_by_override={spoc.sponsored_by_override}
    shim={spoc.shim}
    format={spoc.format}
    // NewTabAttributionFeed only reports a view or click when this is set.
    attribution={spoc.attribution}
    // The slot exists to hold an ad, so it always qualifies. AdBanner, the
    // other dedicated ad surface, hardcodes it the same way.
    is_ad_eligible_position={true}
    type={type}
    // Deliberate: the cell has one fixed position, so there is no grid index
    // to report. Read it alongside the WIDGETS_ROW_AD source, not on its own.
    pos={0}
    dispatch={dispatch}
    // Opts into the sections-card-ui treatment the design asks for.
    mayHaveSectionsCards={true}
    sectionsClassNames="widgets-row-ad"
    // Required, and column 1's media matcher is "default" so it always
    // applies. A fixed cell needs no per-column variants.
    sectionsCardImageSizes={{ 1: "medium" }}
  />
);
