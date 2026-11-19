/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! A Rust tracing layer that forwards events to Gecko logging: MOZ_LOG output on
//! stderr or MOZ_LOG_FILE, plus a LOGS profiler marker, as a C++ `MOZ_LOG`
//! call produces.

use tracing::{subscriber::Interest, Event, Level, Metadata, Subscriber};
use tracing_subscriber::layer::{Context, Filter, Layer};

use crate::fields::FieldFormatter;

fn to_log_level(level: Level) -> log::Level {
    match level {
        Level::ERROR => log::Level::Error,
        Level::WARN => log::Level::Warn,
        Level::INFO => log::Level::Info,
        Level::DEBUG => log::Level::Debug,
        Level::TRACE => log::Level::Trace,
    }
}

/// Whether MOZ_LOG enables the callsite's target at its level, like
/// `MOZ_LOG_TEST` in C++.
pub(crate) fn moz_log_test(meta: &Metadata<'_>) -> bool {
    gecko_logger::moz_log_test(meta.target(), to_log_level(*meta.level()))
}

/// Filters events by the MOZ_LOG level of their target.
pub struct MozLogFilter;

impl MozLogFilter {
    fn is_enabled(meta: &Metadata<'_>) -> bool {
        meta.is_event() && moz_log_test(meta)
    }
}

impl<S> Filter<S> for MozLogFilter {
    // Cached per callsite, and rebuilt by gecko_logger when MOZ_LOG changes.
    fn callsite_enabled(&self, meta: &'static Metadata<'static>) -> Interest {
        if Self::is_enabled(meta) {
            Interest::always()
        } else {
            Interest::never()
        }
    }

    // Still called when other filters disagree on the callsite's interest.
    fn enabled(&self, meta: &Metadata<'_>, _cx: &Context<'_, S>) -> bool {
        Self::is_enabled(meta)
    }
}

/// Forwards Rust tracing events to Gecko logging.
pub struct MozLogLayer;

impl<S: Subscriber> Layer<S> for MozLogLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let metadata = event.metadata();
        gecko_logger::moz_log(metadata.target(), to_log_level(*metadata.level()), |out| {
            event.record(&mut FieldFormatter { out })
        });
    }
}
