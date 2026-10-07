/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;

impl ScaffoldingCall {
    pub fn is_async(&self) -> bool {
        self.ffi_func.async_data.is_some()
    }

    pub fn handler_class_name(&self) -> String {
        format!("ScaffoldingCallHandler{}", self.id)
    }
}
