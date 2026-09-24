/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{borrow::Cow, error::Error};

use serde::{Deserialize, Serialize};
use wgpu_core_remote_types::id;
use wgt::error::{ErrorType, WebGpuError};

pub fn error_to_string(error: impl Error) -> String {
    use std::fmt::Write;
    let mut message = format!("{}", error);
    let mut e = error.source();
    while let Some(source) = e {
        write!(message, ", caused by: {}", source).unwrap();
        e = source.source();
    }
    message
}

#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
#[error("{message}")]
pub struct GPUError<'a> {
    pub message: Cow<'a, str>,
    pub r#type: ErrorType,
}

impl WebGpuError for GPUError<'static> {
    fn webgpu_error_type(&self) -> ErrorType {
        self.r#type
    }
}

impl GPUError<'static> {
    pub fn oom() -> Self {
        Self {
            message: "Out of memory".into(),
            r#type: ErrorType::OutOfMemory,
        }
    }

    pub fn report(self, global: &wgpu_core_remote::global::Global, device_id: id::DeviceId) {
        global.device_handle_error(device_id, self, None, "");
    }
}
