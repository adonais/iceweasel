/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::crypto::{self, CipherSuite, DEFAULT_CIPHER_SUITE};
use crate::utils;
use crate::{LockstoreError, SecurityLevel};

use kvstore::{Database, GetOptions, Key, Store, StorePath};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

const DB_NAME: &str = "lockstore.keys";
const DEK_PREFIX: &str = "lockstore::dek::";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WrappedDek {
    security_level: SecurityLevel,
    kek_ref: String,
    wrapped_dek: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DekMetadata {
    wrapped_deks: Vec<WrappedDek>,
    cipher_suite: CipherSuite,
    #[serde(default)]
    extractable: bool,
}

#[derive(Clone)]
pub struct LockstoreKeystore {
    store: Arc<Store>,
    in_memory: bool,
}

impl LockstoreKeystore {
    pub fn new(path: PathBuf) -> Result<Self, LockstoreError> {
        let store = Arc::new(Store::new(StorePath::OnDisk(path)));
        nss_gk_api::init();
        Ok(Self {
            store,
            in_memory: false,
        })
    }

    pub fn new_in_memory() -> Result<Self, LockstoreError> {
        let store = Arc::new(Store::new(StorePath::for_in_memory()));
        nss_gk_api::init();
        Ok(Self {
            store,
            in_memory: true,
        })
    }

    pub fn create_dek(
        &self,
        collection_name: &str,
        security_level: SecurityLevel,
        extractable: bool,
    ) -> Result<(), LockstoreError> {
        self.create_dek_with_cipher(
            collection_name,
            security_level,
            extractable,
            DEFAULT_CIPHER_SUITE,
        )
    }

    pub fn create_dek_with_cipher(
        &self,
        collection_name: &str,
        security_level: SecurityLevel,
        extractable: bool,
        cipher_suite: CipherSuite,
    ) -> Result<(), LockstoreError> {
        let dek_key = format!("{}{}", DEK_PREFIX, collection_name);
        let db = Database::new(&self.store, DB_NAME);
        let key = Key::from(dek_key.as_str());
        let existing = db.get(&key, &GetOptions::default())?;

        if existing.is_some() {
            return Err(LockstoreError::InvalidConfiguration(format!(
                "DEK already exists for collection: {}",
                collection_name
            )));
        }

        let new_dek = crypto::generate_random_key(cipher_suite);
        let kek = self.get_kek_for(cipher_suite, security_level)?;
        let wrapped = crypto::encrypt_with_key(&new_dek, &kek, cipher_suite)?;

        let metadata = DekMetadata {
            wrapped_deks: vec![WrappedDek {
                security_level,
                kek_ref: security_level.storage_key().to_string(),
                wrapped_dek: wrapped,
            }],
            cipher_suite,
            extractable,
        };

        self.save_metadata(collection_name, &metadata)
    }

    pub(crate) fn get_dek_internal(
        &self,
        collection_name: &str,
        security_level: SecurityLevel,
    ) -> Result<(Vec<u8>, CipherSuite, bool), LockstoreError> {
        let metadata = self.load_metadata(collection_name)?;

        let entry = metadata
            .wrapped_deks
            .iter()
            .find(|w| w.security_level == security_level)
            .ok_or_else(|| {
                LockstoreError::NotFound(format!(
                    "No DEK for collection '{}' at security level '{}'",
                    collection_name,
                    security_level.as_str()
                ))
            })?;

        let kek = self.get_kek_for(metadata.cipher_suite, security_level)?;
        let dek = crypto::decrypt_with_key(&entry.wrapped_dek, &kek)?;

        Ok((dek, metadata.cipher_suite, metadata.extractable))
    }

    pub fn is_dek_extractable(&self, collection_name: &str) -> Result<bool, LockstoreError> {
        let metadata = self.load_metadata(collection_name)?;
        Ok(metadata.extractable)
    }

    pub fn get_dek(
        &self,
        collection_name: &str,
        security_level: SecurityLevel,
    ) -> Result<(Vec<u8>, CipherSuite), LockstoreError> {
        if !self.is_dek_extractable(collection_name)? {
            return Err(LockstoreError::NotExtractable(format!(
                "DEK for '{}' is not extractable",
                collection_name
            )));
        }

        let (dek, cipher_suite, _) = self.get_dek_internal(collection_name, security_level)?;
        Ok((dek, cipher_suite))
    }

    /// Adds a wrapped copy of an existing DEK under a new security level.
    /// The caller must authenticate via `source_security_level` to unwrap the DEK first.
    pub fn add_security_level(
        &self,
        collection_name: &str,
        source_security_level: SecurityLevel,
        new_security_level: SecurityLevel,
    ) -> Result<(), LockstoreError> {
        let mut metadata = self.load_metadata(collection_name)?;

        if metadata
            .wrapped_deks
            .iter()
            .any(|w| w.security_level == new_security_level)
        {
            return Err(LockstoreError::InvalidConfiguration(format!(
                "Security level '{}' already exists for collection '{}'",
                new_security_level.as_str(),
                collection_name
            )));
        }

        let source_entry = metadata
            .wrapped_deks
            .iter()
            .find(|w| w.security_level == source_security_level)
            .ok_or_else(|| {
                LockstoreError::NotFound(format!(
                    "No DEK for collection '{}' at security level '{}'",
                    collection_name,
                    source_security_level.as_str()
                ))
            })?;

        let source_kek = self.get_kek_for(metadata.cipher_suite, source_security_level)?;
        let dek = crypto::decrypt_with_key(&source_entry.wrapped_dek, &source_kek)?;

        let new_kek = self.get_kek_for(metadata.cipher_suite, new_security_level)?;
        let new_wrapped = crypto::encrypt_with_key(&dek, &new_kek, metadata.cipher_suite)?;

        metadata.wrapped_deks.push(WrappedDek {
            security_level: new_security_level,
            kek_ref: new_security_level.storage_key().to_string(),
            wrapped_dek: new_wrapped,
        });

        self.save_metadata(collection_name, &metadata)
    }

    /// Removes the wrapped DEK entry for `security_level`.
    /// The entry is first decrypted to authenticate the caller's access to that level.
    /// Fails if it is the last remaining entry.
    pub fn remove_security_level(
        &self,
        collection_name: &str,
        security_level: SecurityLevel,
    ) -> Result<(), LockstoreError> {
        let mut metadata = self.load_metadata(collection_name)?;

        if metadata.wrapped_deks.len() <= 1 {
            return Err(LockstoreError::InvalidConfiguration(format!(
                "Cannot remove the last security level from collection '{}'",
                collection_name
            )));
        }

        let entry = metadata
            .wrapped_deks
            .iter()
            .find(|w| w.security_level == security_level)
            .ok_or_else(|| {
                LockstoreError::NotFound(format!(
                    "No DEK for collection '{}' at security level '{}'",
                    collection_name,
                    security_level.as_str()
                ))
            })?;

        let kek = self.get_kek_for(metadata.cipher_suite, security_level)?;
        crypto::decrypt_with_key(&entry.wrapped_dek, &kek)?;

        metadata
            .wrapped_deks
            .retain(|w| w.security_level != security_level);

        self.save_metadata(collection_name, &metadata)
    }

    pub fn delete_dek(&self, collection_name: &str) -> Result<(), LockstoreError> {
        let dek_key = format!("{}{}", DEK_PREFIX, collection_name);
        let db = Database::new(&self.store, DB_NAME);
        let key = Key::from(dek_key.as_str());

        if !db.has(&key, &GetOptions::default())? {
            return Err(LockstoreError::NotFound(format!(
                "DEK not found for collection: {}",
                collection_name
            )));
        }

        crypto::secure_delete(&self.store, DB_NAME, &dek_key)
    }

    pub fn list_collections(&self) -> Result<Vec<String>, LockstoreError> {
        use kvstore::DatabaseError;

        let reader = self.store.reader()?;
        let db_name = DB_NAME.to_string();

        let collections = reader
            .read(|conn| {
                let mut stmt = conn
                    .prepare(
                        "SELECT data.key FROM data
                         JOIN dbs ON data.db_id = dbs.id
                         WHERE dbs.name = ?1
                         AND data.key LIKE ?2
                         ORDER BY data.key",
                    )
                    .map_err(DatabaseError::from)?;

                let dek_pattern = format!("{}%", DEK_PREFIX);
                let collection_strings: Result<Vec<String>, _> = stmt
                    .query_map([&db_name, &dek_pattern], |row| {
                        let key: String = row.get(0)?;
                        Ok(key.strip_prefix(DEK_PREFIX).unwrap_or(&key).to_string())
                    })
                    .map_err(DatabaseError::from)?
                    .collect();

                collection_strings.map_err(DatabaseError::from)
            })
            .map_err(LockstoreError::Database)?;

        Ok(collections)
    }

    pub fn close(self) {
        if self.in_memory {
            let kek_name = SecurityLevel::LocalKey.storage_key();
            let _ = crypto::zeroize(&self.store, DB_NAME, kek_name);
        }
        self.store.close();
    }

    fn load_metadata(&self, collection_name: &str) -> Result<DekMetadata, LockstoreError> {
        let dek_key = format!("{}{}", DEK_PREFIX, collection_name);
        let db = Database::new(&self.store, DB_NAME);
        let key = Key::from(dek_key.as_str());

        let metadata_value = db.get(&key, &GetOptions::default())?.ok_or_else(|| {
            LockstoreError::NotFound(format!("DEK not found for collection: {}", collection_name))
        })?;

        let metadata_bytes = utils::value_to_bytes(&metadata_value)?;
        Ok(serde_json::from_slice(&metadata_bytes)?)
    }

    fn save_metadata(
        &self,
        collection_name: &str,
        metadata: &DekMetadata,
    ) -> Result<(), LockstoreError> {
        let dek_key = format!("{}{}", DEK_PREFIX, collection_name);
        let db = Database::new(&self.store, DB_NAME);
        let key = Key::from(dek_key.as_str());
        let metadata_bytes = serde_json::to_vec(metadata)?;
        let value = utils::bytes_to_value(&metadata_bytes)?;
        db.put(&[(key, Some(value))])?;
        Ok(())
    }

    fn get_kek_for(
        &self,
        cipher_suite: CipherSuite,
        security_level: SecurityLevel,
    ) -> Result<Vec<u8>, LockstoreError> {
        let storage_key = security_level.storage_key();
        let db = Database::new(&self.store, DB_NAME);
        let key = Key::from(storage_key);

        let existing_kek = db.get(&key, &GetOptions::default())?;

        if let Some(value) = existing_kek {
            utils::value_to_bytes(&value)
        } else {
            let new_kek = crypto::generate_random_key(cipher_suite);
            let value = utils::bytes_to_value(&new_kek)?;
            db.put(&[(key, Some(value))])?;
            Ok(new_kek)
        }
    }
}
