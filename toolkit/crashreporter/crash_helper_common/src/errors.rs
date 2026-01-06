/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::num::TryFromIntError;
use thiserror::Error;

#[cfg(not(target_os = "windows"))]
pub use nix::errno::Errno as SystemError;
#[cfg(target_os = "windows")]
pub use windows_sys::Win32::Foundation::WIN32_ERROR as SystemError;

use crate::{
    messages::{self, MessageError},
    platform::PlatformError,
};

#[derive(Debug, Error)]
pub enum IPCError {
    #[error("Message error")]
    BadMessage(#[from] MessageError),
    #[error("Could not connect to a socket: {0}")]
    ConnectionFailure(SystemError),
    #[error("Failed to create a connector: {0}")]
    CreationFailure(PlatformError),
    #[error("Buffer length exceeds a 32-bit integer")]
    InvalidSize(#[from] TryFromIntError),
    #[error("Error while parsing a file descriptor string")]
    ParseError,
    #[error("Could not receive data: {0}")]
    ReceptionFailure(PlatformError),
    #[error("An operation timed out")]
    Timeout,
    #[error("Could not send data: {0}")]
    TransmissionFailure(PlatformError),
    #[error("Unexpected message of kind: {0:?}")]
    UnexpectedMessage(messages::Kind),
}
