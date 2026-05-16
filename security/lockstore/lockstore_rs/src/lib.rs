/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

pub mod crypto;
mod datastore;
mod keystore;
mod utils;

pub use crypto::CipherSuite;
pub use crypto::DEFAULT_CIPHER_SUITE;
pub use datastore::LockstoreDatastore;
pub use keystore::LockstoreKeystore;
#[cfg(test)]
pub use utils::{bytes_to_value, value_to_bytes};

use kvstore::{DatabaseError, StoreError};
use nss_gk_api::Error as NssError;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SecurityLevel {
    #[serde(rename = "local")]
    LocalKey, // Key stored unprotected in the local keystore file
    #[cfg(test)]
    #[serde(rename = "test")]
    TestLevel,
}

impl Default for SecurityLevel {
    fn default() -> Self {
        SecurityLevel::LocalKey
    }
}

impl SecurityLevel {
    pub fn as_str(&self) -> &str {
        match self {
            SecurityLevel::LocalKey => "local",
            #[cfg(test)]
            SecurityLevel::TestLevel => "test",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "local" => Some(SecurityLevel::LocalKey),
            #[cfg(test)]
            "test" => Some(SecurityLevel::TestLevel),
            _ => None,
        }
    }

    pub fn storage_key(&self) -> &str {
        match self {
            SecurityLevel::LocalKey => "lockstore::kek::local",
            #[cfg(test)]
            SecurityLevel::TestLevel => "lockstore::kek::test",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredValue {
    pub data: Vec<u8>,
    pub timestamp: u64,
}
