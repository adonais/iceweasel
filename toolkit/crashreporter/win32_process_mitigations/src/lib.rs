/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Crate to read the Windows process mitigation options that are configured on the
//! system for the current executable, both the per-application Exploit Protection
//! settings and the system-wide defaults.

#![deny(missing_docs)]

mod decode;
mod error;
mod query;
mod registry;

pub use self::error::MitigationOptionsError;
pub use self::query::{
    get_app_mitigation_options, get_system_mitigation_options, MitigationOptions,
};
