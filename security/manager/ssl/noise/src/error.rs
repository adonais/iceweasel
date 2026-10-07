/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Error handling.

use nss_rs::hkdf::HkdfError;

#[derive(Debug, PartialEq, thiserror::Error)]
pub enum Error {
    #[error("Invalid argument")]
    InvalidArgument,

    #[error("Invalid state")]
    InvalidState,

    #[error("Internal error")]
    Internal,

    #[error("NSS error: {0}")]
    Nss(#[from] nss_rs::Error),

    #[error("HKDF error")]
    HkdfError,
}

impl From<HkdfError> for Error {
    fn from(_: HkdfError) -> Self {
        // HkdfError does not implement Display
        Self::HkdfError
    }
}

#[cfg(feature = "xpcom")]
impl From<Error> for nserror::nsresult {
    fn from(value: Error) -> Self {
        use nserror::{NS_ERROR_DOM_INVALID_STATE_ERR, NS_ERROR_FAILURE, NS_ERROR_INVALID_ARG};
        use Error::*;

        match value {
            Internal | HkdfError | Nss(_) => NS_ERROR_FAILURE,
            InvalidArgument => NS_ERROR_INVALID_ARG,
            InvalidState => NS_ERROR_DOM_INVALID_STATE_ERR,
        }
    }
}
