/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

pub(crate) fn panic_message(e: Box<dyn std::any::Any + Send>) -> String {
    return e
        .downcast_ref::<&str>()
        .map(|s| s.to_string())
        .or_else(|| e.downcast_ref::<String>().cloned())
        // Handle errors that come up when joining the thread
        .unwrap_or_else(|| "unknown panic".to_string());
}
