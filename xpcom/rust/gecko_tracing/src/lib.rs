/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! This provides a way to set up rust tracing "layers".
mod fields;
mod moz_log;
mod span_marker;

pub fn initialize_tracing() {
    use tracing_subscriber::prelude::*;
    tracing_subscriber::registry()
        // The application-services tracing-support library, which directs tracing from some crates
        // back into the application for logging or other diagnostic purposes.
        .with(tracing_support::simple_event_layer())
        // Forward events to Gecko logging.
        .with(moz_log::MozLogLayer.with_filter(moz_log::MozLogFilter))
        // Record spans as profiler duration markers.
        .with(span_marker::SpanMarkerLayer.with_filter(span_marker::SpanMarkerFilter))
        // More layers can be added by additional `.with(...)` statements.
        .init();
}
