/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! A Rust tracing layer that records spans as profiler duration markers.

use gecko_profiler::{
    add_marker, gecko_profiler_category,
    schema::{Format, Location},
    JSONWriter, MarkerOptions, MarkerSchema, MarkerTiming, ProfilerMarker, ProfilerTime,
};
use serde::{Deserialize, Serialize};
use tracing::{span, subscriber::Interest, Metadata, Subscriber};
use tracing_subscriber::{
    layer::{Context, Filter, Layer},
    registry::LookupSpan,
};

use crate::{fields::FieldFormatter, moz_log::moz_log_test};

/// Stored in a span's extensions while it is open, and turned into a
/// `SpanMarker` when it closes.
struct PendingSpanMarker {
    start: ProfilerTime,
    fields: String,
}

/// Profiler marker for a span. Span fields can come from any crate using Rust
/// tracing and may contain PII, so the marker uses a `SanitizedString`. The
/// profiler replaces it with `<sanitized>` when a profile is shared without
/// "Include resource URLs and paths".
#[derive(Serialize, Deserialize, Debug)]
struct SpanMarker {
    fields: String,
}

impl ProfilerMarker for SpanMarker {
    fn marker_type_name() -> &'static str {
        "RustTracingSpan"
    }

    fn marker_type_display() -> MarkerSchema {
        let mut schema = MarkerSchema::new(&[Location::MarkerChart, Location::MarkerTable]);
        schema.set_all_labels("{marker.name} {marker.data.fields}");
        schema.add_key_label_format("fields", "Fields", Format::SanitizedString);
        schema
    }

    fn stream_json_marker_data(&self, json_writer: &mut JSONWriter) {
        json_writer.string_property("fields", &self.fields);
    }
}

/// Filters spans by the MOZ_LOG level of their target, and only while the
/// current thread is being profiled.
pub struct SpanMarkerFilter;

impl<S> Filter<S> for SpanMarkerFilter {
    // Cached per callsite, and rebuilt by gecko_logger when MOZ_LOG changes.
    // `sometimes` rather than `always`: `enabled` also checks the profiler.
    fn callsite_enabled(&self, meta: &'static Metadata<'static>) -> Interest {
        // TODO: misuses MOZ_LOG targets and levels until profiler markers
        // can be filtered by emitter (bug 2069963).
        if meta.is_span() && moz_log_test(meta) {
            Interest::sometimes()
        } else {
            Interest::never()
        }
    }

    // Called on every span, since `callsite_enabled` returns `sometimes`.
    fn enabled(&self, meta: &Metadata<'_>, _cx: &Context<'_, S>) -> bool {
        meta.is_span()
            && gecko_profiler::current_thread_is_being_profiled_for_markers()
            && moz_log_test(meta)
    }
}

/// Records Rust tracing spans as profiler interval markers.
pub struct SpanMarkerLayer;

impl<S> Layer<S> for SpanMarkerLayer
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_new_span(&self, attrs: &span::Attributes<'_>, id: &span::Id, ctx: Context<'_, S>) {
        let Some(span) = ctx.span(id) else {
            return;
        };
        let mut fields = String::new();
        attrs.record(&mut FieldFormatter { out: &mut fields });
        span.extensions_mut().insert(PendingSpanMarker {
            start: ProfilerTime::now(),
            fields,
        });
    }

    fn on_record(&self, id: &span::Id, values: &span::Record<'_>, ctx: Context<'_, S>) {
        let Some(span) = ctx.span(id) else {
            return;
        };
        let mut extensions = span.extensions_mut();
        if let Some(pending) = extensions.get_mut::<PendingSpanMarker>() {
            values.record(&mut FieldFormatter {
                out: &mut pending.fields,
            });
        }
    }

    fn on_close(&self, id: span::Id, ctx: Context<'_, S>) {
        let Some(span) = ctx.span(&id) else {
            return;
        };
        let Some(pending) = span.extensions_mut().remove::<PendingSpanMarker>() else {
            return;
        };
        add_marker(
            span.metadata().name(),
            gecko_profiler_category!(Logs),
            MarkerOptions {
                timing: MarkerTiming::interval_until_now_from(pending.start),
                ..Default::default()
            },
            SpanMarker {
                fields: pending.fields,
            },
        );
    }
}
