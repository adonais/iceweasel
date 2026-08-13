/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! Wrappers for XPC.

extern "C" {
    fn Gecko_IsInAutomation() -> bool;
}

/// Whether the application is running in automation (e.g. tests).
pub fn is_in_automation() -> bool {
    // SAFETY: Safe because it returns a primitive by value.
    unsafe { Gecko_IsInAutomation() }
}
