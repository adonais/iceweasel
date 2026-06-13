/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

pub mod crypto;
mod datastore;
mod keystore;
mod pbkdf2;
mod utils;

pub use crypto::CipherSuite;
pub use crypto::DEFAULT_CIPHER_SUITE;
pub use datastore::LockstoreDatastore;
pub use keystore::{ConnectionHandle, Keystore};
#[cfg(test)]
pub use utils::{bytes_to_value, value_to_bytes};

use kvstore::{DatabaseError, StoreError};
use nss_rs::Error as NssError;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const KEYSTORE_FILENAME: &str = "lockstore.keys.sqlite";
pub const DATASTORE_FILENAME_PREFIX: &str = "lockstore.data.";
pub const DATASTORE_FILENAME_SUFFIX: &str = ".sqlite";

pub fn datastore_filename(collection_name: &str) -> String {
    format!(
        "{}{}{}",
        DATASTORE_FILENAME_PREFIX, collection_name, DATASTORE_FILENAME_SUFFIX
    )
}

#[derive(Error, Debug)]
pub enum LockstoreError {
    #[error("Store error: {0}")]
    Store(#[from] StoreError),
    #[error("Database error: {0}")]
    Database(#[from] DatabaseError),
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("Key not found: {0}")]
    NotFound(String),
    #[error("Encryption error: {0}")]
    Encryption(String),
    #[error("Decryption error: {0}")]
    Decryption(String),
    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),
    #[error("DEK is not extractable: {0}")]
    NotExtractable(String),
    #[error("Authentication cancelled")]
    AuthenticationCancelled,
    #[error("Authentication failed")]
    AuthenticationFailed,
    #[error("Token error: {0}")]
    TokenError(String),
    #[error("Invalid kek_ref: {0}")]
    InvalidKekRef(String),
    #[error("NSS initialization failed: {0}")]
    NssInitialization(String),
    #[error("Primary password is locked")]
    Locked,
    #[error("Primary password is incorrect")]
    WrongPassword,
    #[error("Primary password is not initialized")]
    NotInitialized,
    #[error("Locking failure: {0}")]
    LockingFailure(String),
}

impl From<serde_json::Error> for LockstoreError {
    fn from(err: serde_json::Error) -> Self {
        LockstoreError::Serialization(err.to_string())
    }
}

impl From<NssError> for LockstoreError {
    fn from(err: NssError) -> Self {
        LockstoreError::Encryption(err.to_string())
    }
}

pub const KEK_REF_PREFIX: &str = "lockstore::kek::";
pub const KEK_REF_LOCAL: &str = "lockstore::kek::local";
pub const KEK_REF_PRP: &str = "lockstore::kek::primary_password";

/// The kind of KEK identified by a `kek_ref`.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum KekType {
    #[default]
    #[serde(rename = "local")]
    LocalKey,
    #[serde(rename = "pkcs11token")]
    Pkcs11Token,
    #[serde(rename = "primary_password")]
    PrimaryPassword,
    #[cfg(test)]
    #[serde(rename = "test")]
    Test,
}

impl KekType {
    pub fn as_str(&self) -> &str {
        match self {
            KekType::LocalKey => "local",
            KekType::Pkcs11Token => "pkcs11token",
            KekType::PrimaryPassword => "primary_password",
            #[cfg(test)]
            KekType::Test => "test",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "local" => Some(KekType::LocalKey),
            "pkcs11token" => Some(KekType::Pkcs11Token),
            "primary_password" => Some(KekType::PrimaryPassword),
            #[cfg(test)]
            "test" => Some(KekType::Test),
            _ => None,
        }
    }

    pub fn from_kek_ref(kek_ref: &str) -> Result<Self, LockstoreError> {
        if kek_ref == KEK_REF_LOCAL {
            Ok(KekType::LocalKey)
        } else if kek_ref == KEK_REF_PRP {
            Ok(KekType::PrimaryPassword)
        } else if kek_ref.starts_with("lockstore::kek::pkcs11:") {
            Ok(KekType::Pkcs11Token)
        } else {
            #[cfg(test)]
            if kek_ref == "lockstore::kek::test" {
                return Ok(KekType::Test);
            }
            Err(LockstoreError::InvalidKekRef(kek_ref.to_string()))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredValue {
    pub data: Vec<u8>,
    pub timestamp: u64,
}
