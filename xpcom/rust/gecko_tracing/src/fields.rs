/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::fmt::Write;

use tracing::field::{Field, Visit};

/// Formats a message and its fields as `message key=value key=value`.
pub(crate) struct FieldFormatter<'a> {
    pub(crate) out: &'a mut String,
}

impl Visit for FieldFormatter<'_> {
    // Write strings bare instead of Debug-quoted.
    fn record_str(&mut self, field: &Field, value: &str) {
        self.record_debug(field, &format_args!("{value}"));
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        // Marker that tracing_support's macros add to every event.
        if field.name() == "tracing_support" {
            return;
        }
        // No separator at the start, or after a prefix such as `[module] `.
        let sep = if self.out.is_empty() || self.out.ends_with(' ') {
            ""
        } else {
            " "
        };
        let _ = if field.name() == "message" {
            write!(self.out, "{sep}{value:?}")
        } else {
            write!(self.out, "{sep}{}={value:?}", field.name())
        };
    }
}
