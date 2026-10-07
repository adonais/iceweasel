/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Contains the error type for this crate

use thiserror::Error;

/// The error type for this crate
#[derive(Debug, Error)]
pub enum MitigationOptionsError {
    /// Failed to enumerate the next registry subkey
    #[error("failed to enumerate next registry subkey. code: {0}")]
    RegEnumKeyFailed(u32),
    /// Failed to get a value from the registry
    #[error("failed to get registry value. code: {0}")]
    RegGetValueFailed(u32),
    /// Failed to get the length of a value from the registry
    #[error("failed to get registry value length. code: {0}")]
    RegGetValueLenFailed(u32),
    /// Failed to open a registry key
    #[error("failed to open registry key. code: {0}")]
    RegOpenKeyFailed(u32),
    /// Failed to query key for subkey length
    #[error("failed to query key for max subkey length. code: {0}")]
    RegQueryInfoKeyFailed(u32),
    /// A registry value did not have the length its type implies
    #[error("registry value has length {actual}, expected {expected}")]
    UnexpectedValueLength {
        /// The length the value's type implies
        expected: u32,
        /// The length the registry reported
        actual: u32,
    },
    /// A registry value had an unsupported type
    #[error("key has unsupported value type: {0}")]
    UnsupportedValueType(u32),
}
