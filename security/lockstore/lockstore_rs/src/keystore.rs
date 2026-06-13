/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! # On-disk layout
//!
//! All keystore rows live in `lockstore.keys.sqlite`, in the logical
//! kvstore database `"lockstore.keys"`. Two row families:
//!
//! - **DEK metadata** at row key `"lockstore::dek::<collection>"`.
//!   Value is a JSON `DekMetadata` (via `utils::bytes_to_value`):
//!
//!   ```text
//!   {
//!     "wrapped_deks": [
//!       { "kek_type": "...", "kek_ref": "...", "wrapped_dek": [<bytes>...] },
//!       ...
//!     ],
//!     "cipher_suite": "...",
//!     "extractable": <bool>
//!   }
//!   ```
//!
//! - **PrimaryPassword params** at row key `"lockstore::prp::params"`.
//!   Value is a JSON `PrimaryPasswordParams { salt, iterations,
//!   verifier, cipher_suite }`.
//!
//! # Threat model for the on-disk layout
//!
//! The `wrapped_dek` bytes are the only piece encrypted at rest (under
//! the KEK named by `kek_ref`). Every structural field — including the
//! `kek_ref` strings — is plaintext on disk, so a plain `sqlite3` dump
//! of `lockstore.keys.sqlite` is enough to enumerate which KEKs wrap
//! each collection. The `nsILockstore.listKeks` API surfaces this same
//! data programmatically; the on-disk format is documented here as a
//! stable contract for offline tooling.

use crate::crypto::{self, CipherSuite, DEFAULT_CIPHER_SUITE};
use crate::pbkdf2;
use crate::utils;
use crate::{KekType, LockstoreError, KEK_REF_PREFIX, KEK_REF_PRP};

use kvstore::{Database, GetOptions, Key, Store, StorePath};
use nss_rs::aead::Aead;
use nss_rs::p11;
use nss_rs::SymKey;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use zeroize::Zeroize;

/// Logical kvstore database name under which keystore rows (DEK
/// metadata, PrP params) live within `lockstore.keys.sqlite`. Single
/// physical SQLite file, multiple logical databases keyed by this name.
const DB_NAME: &str = "lockstore.keys";
const DEK_PREFIX: &str = "lockstore::dek::";
const PRP_PARAMS_KEY: &str = "lockstore::prp::params";
const PRP_VERIFIER_PLAINTEXT: &[u8] = b"lockstore-prp-verifier";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WrappedDek {
    kek_type: KekType,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PrimaryPasswordParams {
    salt: Vec<u8>,
    iterations: u32,
    verifier: Vec<u8>,
    cipher_suite: CipherSuite,
}

/// Exclusive access to the keystore's DEK metadata. Acquired via
/// [`Keystore::acquire_connection`].
///
/// Holding a `ConnectionHandle` is the witness that the caller has
/// exclusive write access to DEK metadata: every operation that walks
/// or mutates collection rows
/// ([`list_collections`](Self::list_collections), `load_metadata`,
/// `save_metadata`) is a method on this type, so the compiler enforces
/// that a thread cannot read the collection list and then load a row
/// without holding the lock across both steps. Single-step mutations
/// on [`Keystore`] (`create_dek`, `add_kek`, `remove_kek`,
/// `delete_dek`, `set_prp`) acquire a connection internally;
/// multi-step operations (primary-password rotation, batch
/// maintenance) acquire one explicitly and hold it across the whole
/// pass.
pub struct ConnectionHandle<'a> {
    keystore: &'a Keystore,
    // The guard's `Drop` is what releases the underlying mutex; the
    // leading underscore tells the compiler we're keeping it solely
    // for its drop-time side-effect.
    _guard: std::sync::MutexGuard<'a, ()>,
}

impl<'a> ConnectionHandle<'a> {
    /// Returns the names of every collection that currently has DEK
    /// metadata stored.
    pub fn list_collections(&self) -> Result<Vec<String>, LockstoreError> {
        use kvstore::DatabaseError;

        let reader = self.keystore.store.reader()?;
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
                let names: Result<Vec<String>, _> = stmt
                    .query_map([&db_name, &dek_pattern], |row| {
                        let key: String = row.get(0)?;
                        Ok(key.strip_prefix(DEK_PREFIX).unwrap_or(&key).to_string())
                    })
                    .map_err(DatabaseError::from)?
                    .collect();

                names.map_err(DatabaseError::from)
            })
            .map_err(LockstoreError::Database)?;

        Ok(collections)
    }

    fn load_metadata(&self, collection_name: &str) -> Result<DekMetadata, LockstoreError> {
        let dek_key = format!("{}{}", DEK_PREFIX, collection_name);
        let db = Database::new(&self.keystore.store, DB_NAME);
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
        let db = Database::new(&self.keystore.store, DB_NAME);
        let key = Key::from(dek_key.as_str());
        let metadata_bytes = serde_json::to_vec(metadata)?;
        let value = utils::bytes_to_value(&metadata_bytes)?;
        db.put(&[(key, Some(value))])?;
        Ok(())
    }
}

/// Bytes of a plaintext KEK held in memory for a bounded window;
/// `Drop` runs `zeroize::Zeroize`.
struct CachedKek {
    kek: Vec<u8>,
    expires_at: Instant,
}

impl Drop for CachedKek {
    fn drop(&mut self) {
        self.kek.zeroize();
    }
}

#[derive(Clone)]
pub struct Keystore {
    store: Arc<Store>,
    in_memory: bool,
    prp_cache: Arc<Mutex<Option<CachedKek>>>,
    /// Per-`kek_ref` unlock deadline for PKCS#11 tokens. Presence of a
    /// non-expired entry means the user has authenticated this token within
    /// the current timeout window and may access its keys. Absence or expiry
    /// means `get_kek_from_token` returns `Locked`.
    pkcs11_auth_cache: Arc<Mutex<HashMap<String, Instant>>>,
    /// Backs the `ConnectionHandle` guard: a coarse write-lock
    /// acquired by every operation that walks or mutates DEK metadata.
    /// Callers acquire a handle via [`acquire_connection`](Self::acquire_connection)
    /// rather than touching this directly; the handle's `Drop` releases
    /// the guard. Rotation walks every collection and rewraps each
    /// `PrimaryPassword`-bound DEK under the new KEK; holding the
    /// connection across the whole pass ensures a concurrent
    /// `create_dek` cannot leave a fresh collection wrapped under the
    /// about-to-be-stale KEK only.
    connection_lock: Arc<Mutex<()>>,
}

impl Keystore {
    /// Construct a fresh on-disk keystore. Private; callers go through
    /// `get`, which returns the process-wide `Arc<Keystore>`.
    /// Bypassing `get` and constructing two `Keystore` instances for the
    /// same path would give each one its own `prp_cache` and
    /// `pkcs11_auth_cache`, so an unlock through one would not be
    /// visible through the other.
    fn new_on_disk(path: PathBuf) -> Result<Self, LockstoreError> {
        let store = Arc::new(Store::new(StorePath::OnDisk(path)));
        nss_rs::init().map_err(|e| LockstoreError::NssInitialization(e.to_string()))?;
        Ok(Self {
            store,
            in_memory: false,
            prp_cache: Arc::new(Mutex::new(None)),
            pkcs11_auth_cache: Arc::new(Mutex::new(HashMap::new())),
            connection_lock: Arc::new(Mutex::new(())),
        })
    }

    /// Get the process-wide `Arc<Keystore>` for `path`, opening it on
    /// the first call (or any call after every previous `Arc` has been
    /// dropped). Concurrent callers receive clones of the same `Arc`,
    /// so all in-process consumers share one keystore handle, one
    /// PrimaryPassword cache, and one PKCS#11 auth-cache.
    ///
    /// `path` is used as the cache key. Two `get` calls return the
    /// same `Arc` iff their `PathBuf`s compare equal; in practice every
    /// in-tree caller routes through `lockstore_keystore_open` which
    /// constructs `<profile>/lockstore.keys.sqlite` deterministically,
    /// so this is automatic.
    ///
    /// **Process scope.** The cache is parent-process-only. Child
    /// processes (network, content, …) don't open the keystore
    /// directly; they reach it through the `nsILockstore` XPCOM
    /// service hosted in the parent. Cross-Firefox-instance
    /// concurrency on the underlying SQLite file is handled by the
    /// kvstore layer (WAL mode + file locks); Lockstore itself does
    /// not add a profile lock because Firefox already enforces
    /// single-instance-per-profile via the profile lock file.
    ///
    /// The cache stores `Weak<Keystore>`, so once the last `Arc` is
    /// dropped the underlying SQLite connection closes and a
    /// subsequent call against the same path re-opens the keystore
    /// from disk with empty PrP / PKCS#11 caches (i.e. fully locked).
    /// This matters for tests that recycle a tempdir path.
    ///
    /// In-memory keystores are *not* shared — `new_in_memory` returns
    /// a fresh per-call instance for test isolation.
    pub fn get(path: PathBuf) -> Result<Arc<Self>, LockstoreError> {
        let map = SHARED_KEYSTORES.get_or_init(|| Mutex::new(HashMap::new()));
        // Surface mutex poisoning as a `LockingFailure`; an earlier
        // holder panicked while mutating the registry, so any state
        // observable through the guard may be inconsistent.
        let mut guard = map
            .lock()
            .map_err(|_| LockstoreError::LockingFailure("SHARED_KEYSTORES poisoned".into()))?;
        if let Some(weak) = guard.get(&path) {
            if let Some(arc) = weak.upgrade() {
                return Ok(arc);
            }
            // Stale entry: every prior consumer dropped its Arc, so the
            // SQLite connection is already closed. Fall through and rebuild.
        }
        let ks = Arc::new(Self::new_on_disk(path.clone())?);
        guard.insert(path, Arc::downgrade(&ks));
        Ok(ks)
    }

    pub fn new_in_memory() -> Result<Self, LockstoreError> {
        let store = Arc::new(Store::new(StorePath::for_in_memory()));
        nss_rs::init().map_err(|e| LockstoreError::NssInitialization(e.to_string()))?;
        Ok(Self {
            store,
            in_memory: true,
            prp_cache: Arc::new(Mutex::new(None)),
            pkcs11_auth_cache: Arc::new(Mutex::new(HashMap::new())),
            connection_lock: Arc::new(Mutex::new(())),
        })
    }

    pub fn create_dek(
        &self,
        collection_name: &str,
        kek_ref: &str,
        extractable: bool,
    ) -> Result<(), LockstoreError> {
        self.create_dek_with_cipher(collection_name, kek_ref, extractable, DEFAULT_CIPHER_SUITE)
    }

    pub fn create_dek_with_cipher(
        &self,
        collection_name: &str,
        kek_ref: &str,
        extractable: bool,
        cipher_suite: CipherSuite,
    ) -> Result<(), LockstoreError> {
        let kek_type = KekType::from_kek_ref(kek_ref)?;

        // Serialises against `set_prp`'s rewrap pass so a brand-new
        // DEK can't be wrapped under an about-to-be-rotated KEK.
        let conn = self.acquire_connection()?;

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
        let kek = self.get_kek_symkey(cipher_suite, kek_ref)?;
        let wrapped = crypto::encrypt_with_symkey(&new_dek, &kek, cipher_suite)?;

        let metadata = DekMetadata {
            wrapped_deks: vec![WrappedDek {
                kek_type,
                kek_ref: kek_ref.to_string(),
                wrapped_dek: wrapped,
            }],
            cipher_suite,
            extractable,
        };

        conn.save_metadata(collection_name, &metadata)
    }

    /// Install caller-supplied `dek_bytes` as the DEK for `collection_name`,
    /// wrapped under the existing KEK at `kek_ref`. Migration primitive: use
    /// this to bring data already encrypted under a known external DEK under
    /// keystore management without re-encrypting ciphertexts at rest.
    ///
    /// `dek_bytes` must match the wire length of the default cipher suite
    /// (32 bytes for AES-256-GCM); other lengths are rejected with
    /// `InvalidConfiguration`. The collection must not already have a DEK
    /// and the KEK at `kek_ref` must be unlocked (required so we can wrap
    /// the caller's bytes).
    ///
    /// Imported DEKs are inherently extractable by the caller (the bytes
    /// are already in their hands). The `extractable` flag controls only
    /// whether future `get_dek` calls succeed.
    pub fn import_dek(
        &self,
        collection_name: &str,
        kek_ref: &str,
        dek_bytes: &[u8],
        extractable: bool,
    ) -> Result<(), LockstoreError> {
        let cipher_suite = DEFAULT_CIPHER_SUITE;
        if dek_bytes.len() != cipher_suite.key_size() {
            return Err(LockstoreError::InvalidConfiguration(format!(
                "DEK length {} does not match expected {} bytes for {}",
                dek_bytes.len(),
                cipher_suite.key_size(),
                cipher_suite.as_str()
            )));
        }

        let kek_type = KekType::from_kek_ref(kek_ref)?;

        // Serialises against `set_prp`'s rewrap pass and any other DEK-ops
        // for the same reason `create_dek` does (see comment there).
        let conn = self.acquire_connection()?;

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

        let kek = self.get_kek_symkey(cipher_suite, kek_ref)?;
        let wrapped = crypto::encrypt_with_symkey(dek_bytes, &kek, cipher_suite)?;

        let metadata = DekMetadata {
            wrapped_deks: vec![WrappedDek {
                kek_type,
                kek_ref: kek_ref.to_string(),
                wrapped_dek: wrapped,
            }],
            cipher_suite,
            extractable,
        };

        conn.save_metadata(collection_name, &metadata)
    }

    pub(crate) fn get_dek_internal(
        &self,
        collection_name: &str,
        kek_ref: &str,
    ) -> Result<(Vec<u8>, CipherSuite, bool), LockstoreError> {
        let conn = self.acquire_connection()?;
        let metadata = conn.load_metadata(collection_name)?;

        let entry = metadata
            .wrapped_deks
            .iter()
            .find(|w| w.kek_ref == kek_ref)
            .ok_or_else(|| {
                LockstoreError::NotFound(format!(
                    "No DEK for collection '{}' with kek_ref '{}'",
                    collection_name, kek_ref
                ))
            })?;

        let kek = self.get_kek_symkey(metadata.cipher_suite, kek_ref)?;
        let dek = crypto::decrypt_with_symkey(&entry.wrapped_dek, &kek)?;

        Ok((dek, metadata.cipher_suite, metadata.extractable))
    }

    pub fn is_dek_extractable(&self, collection_name: &str) -> Result<bool, LockstoreError> {
        let conn = self.acquire_connection()?;
        let metadata = conn.load_metadata(collection_name)?;
        Ok(metadata.extractable)
    }

    pub fn get_dek(
        &self,
        collection_name: &str,
        kek_ref: &str,
    ) -> Result<(Vec<u8>, CipherSuite), LockstoreError> {
        if !self.is_dek_extractable(collection_name)? {
            return Err(LockstoreError::NotExtractable(format!(
                "DEK for '{}' is not extractable",
                collection_name
            )));
        }

        let (dek, cipher_suite, _) = self.get_dek_internal(collection_name, kek_ref)?;
        Ok((dek, cipher_suite))
    }

    /// Encrypts `plaintext` with the DEK for `(collection, kek_ref)`. The returned
    /// blob is self-describing: `[cipher_suite_id(1)] || [nonce] || [ciphertext+tag]`.
    /// The DEK does not need to be extractable; the DEK bytes never leave Lockstore.
    pub fn encrypt(
        &self,
        collection: &str,
        kek_ref: &str,
        plaintext: &[u8],
    ) -> Result<Vec<u8>, LockstoreError> {
        let (dek, cipher_suite, _) = self.get_dek_internal(collection, kek_ref)?;
        crypto::encrypt_with_key(plaintext, &dek, cipher_suite)
    }

    /// Decrypts a blob produced by `encrypt` using the DEK for
    /// `(collection, kek_ref)`. The cipher suite is encoded in the
    /// blob's leading byte and must match the suite recorded for this
    /// DEK in `DekMetadata.cipher_suite`; a mismatch (e.g. the blob's
    /// prefix was tampered with to point at a different suite) is
    /// rejected as `LockstoreError::Decryption` before the AEAD layer
    /// gets a chance to fail with a less specific error.
    pub fn decrypt(
        &self,
        collection: &str,
        kek_ref: &str,
        ciphertext: &[u8],
    ) -> Result<Vec<u8>, LockstoreError> {
        let (dek, expected_suite, _) = self.get_dek_internal(collection, kek_ref)?;
        let blob_suite = crypto::cipher_suite_of_blob(ciphertext)?;
        if blob_suite != expected_suite {
            return Err(LockstoreError::Decryption(format!(
                "cipher-suite mismatch: blob {} but DEK was created with {}",
                blob_suite.as_str(),
                expected_suite.as_str()
            )));
        }
        crypto::decrypt_with_key(ciphertext, &dek)
    }

    pub fn add_kek(
        &self,
        collection_name: &str,
        source_kek_ref: &str,
        new_kek_ref: &str,
    ) -> Result<(), LockstoreError> {
        let new_kek_type = KekType::from_kek_ref(new_kek_ref)?;

        let conn = self.acquire_connection()?;
        let mut metadata = conn.load_metadata(collection_name)?;

        if metadata
            .wrapped_deks
            .iter()
            .any(|w| w.kek_ref == new_kek_ref)
        {
            return Err(LockstoreError::InvalidConfiguration(format!(
                "kek_ref '{}' already exists for collection '{}'",
                new_kek_ref, collection_name
            )));
        }

        let source_entry = metadata
            .wrapped_deks
            .iter()
            .find(|w| w.kek_ref == source_kek_ref)
            .ok_or_else(|| {
                LockstoreError::NotFound(format!(
                    "No DEK for collection '{}' with kek_ref '{}'",
                    collection_name, source_kek_ref
                ))
            })?;

        let source_kek = self.get_kek_symkey(metadata.cipher_suite, source_kek_ref)?;
        let dek = crypto::decrypt_with_symkey(&source_entry.wrapped_dek, &source_kek)?;

        let new_kek = self.get_kek_symkey(metadata.cipher_suite, new_kek_ref)?;
        let new_wrapped = crypto::encrypt_with_symkey(&dek, &new_kek, metadata.cipher_suite)?;

        metadata.wrapped_deks.push(WrappedDek {
            kek_type: new_kek_type,
            kek_ref: new_kek_ref.to_string(),
            wrapped_dek: new_wrapped,
        });

        conn.save_metadata(collection_name, &metadata)
    }

    pub fn remove_kek(&self, collection_name: &str, kek_ref: &str) -> Result<(), LockstoreError> {
        let conn = self.acquire_connection()?;
        let mut metadata = conn.load_metadata(collection_name)?;

        if metadata.wrapped_deks.len() <= 1 {
            return Err(LockstoreError::InvalidConfiguration(format!(
                "Cannot remove the last KEK from collection '{}'",
                collection_name
            )));
        }

        let entry = metadata
            .wrapped_deks
            .iter()
            .find(|w| w.kek_ref == kek_ref)
            .ok_or_else(|| {
                LockstoreError::NotFound(format!(
                    "No DEK for collection '{}' with kek_ref '{}'",
                    collection_name, kek_ref
                ))
            })?;

        let kek = self.get_kek_symkey(metadata.cipher_suite, kek_ref)?;
        crypto::decrypt_with_symkey(&entry.wrapped_dek, &kek)?;

        metadata.wrapped_deks.retain(|w| w.kek_ref != kek_ref);

        conn.save_metadata(collection_name, &metadata)
    }

    /// Atomically rewrap the DEK for `collection_name` from `old_kek_ref` to
    /// `new_kek_ref`. The DEK bytes are unchanged, so ciphertexts at rest
    /// under this collection remain valid.
    ///
    /// Equivalent in effect to `add_kek` followed by `remove_kek` but
    /// atomic at the kvstore-row level: a crash mid-operation leaves the
    /// keystore in the old state or the new state, never an intermediate
    /// half-state. The wrapping entry is replaced in place, so the
    /// "collection always has at least one wrapping" invariant is
    /// preserved at every observable disk state.
    ///
    /// `old_kek_ref` must currently wrap the collection and be unlocked.
    /// `new_kek_ref` must not currently wrap the collection.
    pub fn switch_kek(
        &self,
        collection_name: &str,
        old_kek_ref: &str,
        new_kek_ref: &str,
    ) -> Result<(), LockstoreError> {
        if old_kek_ref == new_kek_ref {
            return Err(LockstoreError::InvalidConfiguration(format!(
                "old_kek_ref and new_kek_ref are the same: '{}'",
                old_kek_ref
            )));
        }

        let new_kek_type = KekType::from_kek_ref(new_kek_ref)?;

        let conn = self.acquire_connection()?;
        let mut metadata = conn.load_metadata(collection_name)?;

        let old_entry = metadata
            .wrapped_deks
            .iter()
            .find(|w| w.kek_ref == old_kek_ref)
            .ok_or_else(|| {
                LockstoreError::NotFound(format!(
                    "No DEK for collection '{}' with kek_ref '{}'",
                    collection_name, old_kek_ref
                ))
            })?;

        if metadata
            .wrapped_deks
            .iter()
            .any(|w| w.kek_ref == new_kek_ref)
        {
            return Err(LockstoreError::InvalidConfiguration(format!(
                "new_kek_ref '{}' already wraps collection '{}'",
                new_kek_ref, collection_name
            )));
        }

        let old_kek = self.get_kek_symkey(metadata.cipher_suite, old_kek_ref)?;
        let mut dek = crypto::decrypt_with_symkey(&old_entry.wrapped_dek, &old_kek)?;

        let new_kek = self.get_kek_symkey(metadata.cipher_suite, new_kek_ref)?;
        let new_wrapped = crypto::encrypt_with_symkey(&dek, &new_kek, metadata.cipher_suite)?;
        dek.zeroize();

        // In-place replace preserves the "at least one wrapping" invariant
        // at every observable state — at no point during the metadata
        // mutation is the wrappings vector empty.
        for w in metadata.wrapped_deks.iter_mut() {
            if w.kek_ref == old_kek_ref {
                w.kek_type = new_kek_type;
                w.kek_ref = new_kek_ref.to_string();
                w.wrapped_dek = new_wrapped;
                break;
            }
        }

        conn.save_metadata(collection_name, &metadata)
    }

    pub fn delete_dek(&self, collection_name: &str) -> Result<(), LockstoreError> {
        let _conn = self.acquire_connection()?;

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

    /// Acquire exclusive DEK-ops access on this keystore. Single-step
    /// public methods (`create_dek`, `add_kek`, `remove_kek`,
    /// `delete_dek`, `set_prp`) acquire one internally; multi-step
    /// callers (primary-password rotation, batch maintenance) should
    /// call this once and hold the result across the operation. See
    /// [`ConnectionHandle`] for what holding a connection guarantees.
    pub fn acquire_connection(&self) -> Result<ConnectionHandle<'_>, LockstoreError> {
        let guard = self
            .connection_lock
            .lock()
            .map_err(|_| LockstoreError::LockingFailure("connection_lock poisoned".into()))?;
        Ok(ConnectionHandle {
            keystore: self,
            _guard: guard,
        })
    }

    /// Snapshot of all collections that currently have DEK metadata
    /// stored. Internally acquires a short-lived connection; callers
    /// that need a stable view across multiple operations should call
    /// [`acquire_connection`](Self::acquire_connection) and use
    /// [`ConnectionHandle::list_collections`] directly.
    pub fn list_collections(&self) -> Result<Vec<String>, LockstoreError> {
        self.acquire_connection()?.list_collections()
    }

    /// Return the list of `kek_ref`s currently wrapping the DEK for
    /// `collection_name`. Always non-empty for an existing collection
    /// (the keystore enforces at least one KEK wrapping); rejects with
    /// `LockstoreError::NotFound` if no collection by that name exists.
    /// Order of the returned list is unspecified. Useful for callers
    /// that need to discover the wrapping state without owning the
    /// wrapped bytes — see the `nsILockstore.listKeks` scriptable
    /// wrapper for the JS-side API.
    pub fn list_collection_keks(
        &self,
        collection_name: &str,
    ) -> Result<Vec<String>, LockstoreError> {
        let conn = self.acquire_connection()?;
        let metadata = conn.load_metadata(collection_name)?;
        Ok(metadata
            .wrapped_deks
            .iter()
            .map(|w| w.kek_ref.clone())
            .collect())
    }

    /// Flush sensitive in-memory state (PrP cache, PKCS#11 auth cache)
    /// and close the underlying store eagerly. Takes `&self` so it
    /// works on the `Arc` returned by `get`. Calling this is optional
    /// — `Drop` performs the same flush automatically when the last
    /// `Arc<Keystore>` goes away — but it gives callers a deterministic
    /// flush point (useful for tests and shutdown paths).
    pub fn close(&self) {
        self.lock();
        if self.in_memory {
            let _ = crypto::zeroize(&self.store, DB_NAME, "lockstore::kek::local");
        }
        self.store.close();
    }

    // ========================================================================
    // Unified lock/unlock API
    //
    // These dispatch on the KekType derived from `kek_ref`:
    //
    //   LocalKey        → no-op; always reported as unlocked.
    //   PrimaryPassword → `secret` is the password, fed to PBKDF2; KEK bytes
    //                     cached in memory with `now + timeout` deadline.
    //                     `secret` is required (non-empty).
    //   Pkcs11Token     → `secret` is the PIN. When non-empty, we authenticate
    //                     via PK11_CheckUserPassword — a direct C_Login with
    //                     the caller-supplied PIN, bypassing NSS's password
    //                     callback. When empty, we fall back to
    //                     slot.authenticate() which delegates to whatever
    //                     callback the embedding application has installed.
    //                     A per-kek_ref unlock deadline is cached in either
    //                     case.
    //   Test       → no-op (treated like LocalKey).
    //
    // Callers should supply `secret` matching the KEK type (password for PP,
    // PIN for PKCS#11, or empty to defer to NSS).
    // ========================================================================

    /// Returns true if a primary password has been initialized for this keystore.
    /// (PP-specific: PKCS#11 tokens have no equivalent "initialised" state in
    /// Lockstore — they're either discoverable on the system or not.)
    pub fn has_prp(&self) -> bool {
        self.load_prp_params().ok().flatten().is_some()
    }

    /// Returns true if `kek_ref` is currently unlocked (KEK material available
    /// without further user interaction).
    pub fn is_kek_unlocked(&self, kek_ref: &str) -> bool {
        let level = match KekType::from_kek_ref(kek_ref) {
            Ok(l) => l,
            Err(_) => return false,
        };
        match level {
            KekType::LocalKey => true,
            KekType::PrimaryPassword => self.is_prp_unlocked_impl(),
            KekType::Pkcs11Token => self.is_pkcs11_unlocked_impl(kek_ref),
            #[cfg(test)]
            KekType::Test => true,
        }
    }

    /// Drop any cached authentication for `kek_ref`. No-op for KEK types that
    /// don't require interaction (LocalKey, Test). For PKCS#11, this
    /// clears the Lockstore-side auth cache **and** calls `PK11_Logout` on
    /// the slot so NSS's own authenticated-session state is also cleared.
    pub fn lock_kek(&self, kek_ref: &str) {
        let level = match KekType::from_kek_ref(kek_ref) {
            Ok(l) => l,
            Err(_) => return,
        };
        match level {
            KekType::LocalKey => {}
            KekType::PrimaryPassword => self.lock_prp_impl(),
            KekType::Pkcs11Token => {
                self.pkcs11_auth_cache.lock().unwrap().remove(kek_ref);
                // Best-effort NSS logout. If the kek_ref is malformed or the
                // slot isn't resolvable, we've still cleared our cache which
                // is what callers observe.
                if let Some(uri_str) = kek_ref.strip_prefix(KEK_REF_PREFIX) {
                    if let Ok(uri) = nss_rs::pk11_utils::parse(uri_str) {
                        if let Ok(slot) = self.resolve_pkcs11_slot(&uri) {
                            let _ = slot.logout();
                        }
                    }
                }
            }
            #[cfg(test)]
            KekType::Test => {}
        }
    }

    /// Lock every KEK that holds cached authentication — zeroises the
    /// PrimaryPassword KEK in memory and clears every per-kek_ref PKCS#11
    /// unlock entry. Called on `close()` and should also be wired to
    /// `xpcom-shutdown` by the XPCOM consumer.
    pub fn lock(&self) {
        self.lock_prp_impl();
        self.pkcs11_auth_cache.lock().unwrap().clear();
    }

    /// Unlock `kek_ref` so subsequent DEK accesses under it succeed for at
    /// most `timeout`. `secret` carries the password (for PrimaryPassword) or
    /// PIN (for a future PKCS#11 caller-supplied path) — it may be empty
    /// when the KEK type has its own prompting mechanism.
    pub fn unlock_kek(
        &self,
        kek_ref: &str,
        secret: &[u8],
        timeout: Duration,
    ) -> Result<(), LockstoreError> {
        let level = KekType::from_kek_ref(kek_ref)?;
        match level {
            KekType::LocalKey => Ok(()),
            KekType::PrimaryPassword => self.unlock_prp_impl(secret, timeout),
            KekType::Pkcs11Token => self.unlock_pkcs11_impl(kek_ref, secret, timeout),
            #[cfg(test)]
            KekType::Test => Ok(()),
        }
    }

    // ------------------------------------------------------------------------
    // PrimaryPassword-specific implementations
    // ------------------------------------------------------------------------

    fn is_prp_unlocked_impl(&self) -> bool {
        let mut guard = self.prp_cache.lock().unwrap();
        match guard.as_ref() {
            Some(cached) if cached.expires_at > Instant::now() => true,
            Some(_) => {
                *guard = None;
                false
            }
            None => false,
        }
    }

    fn lock_prp_impl(&self) {
        let mut guard = self.prp_cache.lock().unwrap();
        *guard = None;
    }

    fn unlock_prp_impl(&self, password: &[u8], timeout: Duration) -> Result<(), LockstoreError> {
        let params = self
            .load_prp_params()?
            .ok_or(LockstoreError::NotInitialized)?;

        let mut kek = pbkdf2::derive_kek(
            password,
            &params.salt,
            params.iterations,
            params.cipher_suite.key_size(),
        )?;

        match crypto::decrypt_with_key(&params.verifier, &kek) {
            Ok(plaintext) if plaintext == PRP_VERIFIER_PLAINTEXT => {}
            Ok(_) | Err(_) => {
                kek.zeroize();
                return Err(LockstoreError::WrongPassword);
            }
        }

        let mut guard = self.prp_cache.lock().unwrap();
        *guard = Some(CachedKek {
            kek,
            expires_at: Instant::now() + timeout,
        });

        Ok(())
    }

    // ------------------------------------------------------------------------
    // PKCS#11 token-specific implementations
    // ------------------------------------------------------------------------

    fn is_pkcs11_unlocked_impl(&self, kek_ref: &str) -> bool {
        let mut guard = self.pkcs11_auth_cache.lock().unwrap();
        match guard.get(kek_ref) {
            Some(&expires_at) if expires_at > Instant::now() => true,
            Some(_) => {
                guard.remove(kek_ref);
                false
            }
            None => false,
        }
    }

    fn unlock_pkcs11_impl(
        &self,
        kek_ref: &str,
        secret: &[u8],
        timeout: Duration,
    ) -> Result<(), LockstoreError> {
        let pkcs11_uri_str = kek_ref.strip_prefix(KEK_REF_PREFIX).ok_or_else(|| {
            LockstoreError::InvalidKekRef(format!("Invalid kek_ref format: {}", kek_ref))
        })?;
        let uri = nss_rs::pk11_utils::parse(pkcs11_uri_str).map_err(|_| {
            LockstoreError::InvalidKekRef(format!("Invalid PKCS#11 URI: {}", kek_ref))
        })?;
        let slot = self.resolve_pkcs11_slot(&uri)?;

        if !secret.is_empty() {
            // Caller-supplied PIN path: PK11_CheckUserPassword performs
            // C_Login with the given PIN, bypassing the NSS password
            // callback. NSS reports a PIN mismatch as
            // `PR_WOULD_BLOCK_ERROR`; everything else is an opaque
            // failure.
            let pin_str =
                std::str::from_utf8(secret).map_err(|_| LockstoreError::AuthenticationFailed)?;
            match slot.check_user_password(pin_str) {
                Ok(()) => {}
                Err(nss_rs::Error::Nss { name, .. }) if name == "PR_WOULD_BLOCK_ERROR" => {
                    return Err(LockstoreError::WrongPassword);
                }
                Err(_) => return Err(LockstoreError::AuthenticationFailed),
            }
        } else {
            // No PIN supplied: fall back to NSS's own password callback
            // (the embedding application's registered prompt — typically
            // PSM in Firefox).
            slot.authenticate()
                .map_err(|_| LockstoreError::AuthenticationCancelled)?;
        }

        let mut guard = self.pkcs11_auth_cache.lock().unwrap();
        guard.insert(kek_ref.to_string(), Instant::now() + timeout);
        Ok(())
    }

    /// Initialise or change the primary password.
    ///
    /// - `old = None`: initial setup. Fails with `InvalidConfiguration`
    ///   if already initialised.
    /// - `old = Some(bytes)`: change. Verifies `old`, then rewraps every
    ///   `PrimaryPassword`-wrapped DEK across all collections under the
    ///   new KEK before persisting the new params record. A crash
    ///   mid-rewrap leaves the old params valid; any already-rewrapped
    ///   collections become unreachable until the rewrap completes on a
    ///   subsequent run.
    ///
    /// Holds `connection_lock` for the duration so concurrent `create_dek` /
    /// `add_kek` / `remove_kek` callers wait until the rotation
    /// completes and cannot end up wrapped under the now-stale old KEK.
    pub fn set_prp(&self, old: Option<&[u8]>, new: &[u8]) -> Result<(), LockstoreError> {
        self.set_prp_inner(old, new, pbkdf2::PBKDF2_ITERATIONS)
    }

    /// Identical to `set_prp` but uses a single PBKDF2
    /// iteration so the test can run in milliseconds instead of seconds.
    /// **Production code must call `set_prp`.** This is
    /// public only so integration tests in `tests/` can reach it; the
    /// name is loud on purpose.
    pub fn set_prp_test_only(&self, old: Option<&[u8]>, new: &[u8]) -> Result<(), LockstoreError> {
        self.set_prp_inner(old, new, 1)
    }

    /// Private worker shared by `set_prp` (production,
    /// 800 000 iterations) and `set_prp_test_only`
    /// (single-iteration, test-only).
    fn set_prp_inner(
        &self,
        old: Option<&[u8]>,
        new: &[u8],
        iterations: u32,
    ) -> Result<(), LockstoreError> {
        if new.is_empty() {
            return Err(LockstoreError::InvalidConfiguration(
                "new primary password must not be empty".to_string(),
            ));
        }

        let conn = self.acquire_connection()?;

        let existing = self.load_prp_params()?;
        if existing.is_some() != old.is_some() {
            return Err(LockstoreError::InvalidConfiguration(
                "Primary password state does not match: 'old' must be provided iff \
                 already initialized"
                    .to_string(),
            ));
        }

        let cipher_suite = existing
            .as_ref()
            .map(|p| p.cipher_suite)
            .unwrap_or(DEFAULT_CIPHER_SUITE);

        let new_salt = crypto::generate_random_bytes(pbkdf2::PBKDF2_SALT_SIZE);
        let new_kek = pbkdf2::derive_kek(new, &new_salt, iterations, cipher_suite.key_size())?;

        if let (Some(params), Some(old_bytes)) = (existing.as_ref(), old) {
            let old_kek = pbkdf2::derive_kek(
                old_bytes,
                &params.salt,
                params.iterations,
                params.cipher_suite.key_size(),
            )?;
            match crypto::decrypt_with_key(&params.verifier, &old_kek) {
                Ok(plaintext) if plaintext == PRP_VERIFIER_PLAINTEXT => {}
                _ => return Err(LockstoreError::WrongPassword),
            }
            self.rewrap_prp_deks(&conn, &old_kek, &new_kek, cipher_suite)?;
        }

        let verifier = crypto::encrypt_with_key(PRP_VERIFIER_PLAINTEXT, &new_kek, cipher_suite)?;
        self.save_prp_params(&PrimaryPasswordParams {
            salt: new_salt,
            iterations,
            verifier,
            cipher_suite,
        })?;
        self.lock_prp_impl();
        Ok(())
    }

    fn rewrap_prp_deks(
        &self,
        conn: &ConnectionHandle<'_>,
        old_kek: &[u8],
        new_kek: &[u8],
        cipher_suite: CipherSuite,
    ) -> Result<(), LockstoreError> {
        let collections = conn.list_collections()?;
        for collection_name in collections {
            let mut metadata = match conn.load_metadata(&collection_name) {
                Ok(m) => m,
                Err(LockstoreError::NotFound(_)) => continue,
                Err(e) => return Err(e),
            };
            let mut changed = false;
            for entry in metadata.wrapped_deks.iter_mut() {
                if entry.kek_ref != KEK_REF_PRP {
                    continue;
                }
                let dek = crypto::decrypt_with_key(&entry.wrapped_dek, old_kek)?;
                entry.wrapped_dek = crypto::encrypt_with_key(&dek, new_kek, cipher_suite)?;
                changed = true;
            }
            if changed {
                conn.save_metadata(&collection_name, &metadata)?;
            }
        }
        Ok(())
    }

    fn load_prp_params(&self) -> Result<Option<PrimaryPasswordParams>, LockstoreError> {
        let db = Database::new(&self.store, DB_NAME);
        let key = Key::from(PRP_PARAMS_KEY);
        let value = db.get(&key, &GetOptions::default())?;
        match value {
            None => Ok(None),
            Some(v) => {
                let bytes = utils::value_to_bytes(&v)?;
                let params: PrimaryPasswordParams = serde_json::from_slice(&bytes)?;
                Ok(Some(params))
            }
        }
    }

    fn save_prp_params(&self, params: &PrimaryPasswordParams) -> Result<(), LockstoreError> {
        let db = Database::new(&self.store, DB_NAME);
        let key = Key::from(PRP_PARAMS_KEY);
        let bytes = serde_json::to_vec(params)?;
        let value = utils::bytes_to_value(&bytes)?;
        db.put(&[(key, Some(value))])?;
        Ok(())
    }

    // ========================================================================
    // KEK retrieval
    // ========================================================================

    fn get_kek_symkey(
        &self,
        cipher_suite: CipherSuite,
        kek_ref: &str,
    ) -> Result<SymKey, LockstoreError> {
        let kek_type = KekType::from_kek_ref(kek_ref)?;
        match kek_type {
            KekType::LocalKey => {
                let kek_bytes = self.get_kek_local(cipher_suite, kek_ref)?;
                Aead::import_key(cipher_suite.to_nss_algorithm(), &kek_bytes)
                    .map_err(|e| LockstoreError::Encryption(e.to_string()))
            }
            KekType::Pkcs11Token => self.get_kek_from_token(cipher_suite, kek_ref),
            KekType::PrimaryPassword => self.get_kek_prp(cipher_suite),
            #[cfg(test)]
            KekType::Test => {
                let kek_bytes = self.get_kek_local(cipher_suite, kek_ref)?;
                Aead::import_key(cipher_suite.to_nss_algorithm(), &kek_bytes)
                    .map_err(|e| LockstoreError::Encryption(e.to_string()))
            }
        }
    }

    fn get_kek_prp(&self, cipher_suite: CipherSuite) -> Result<SymKey, LockstoreError> {
        let mut guard = self.prp_cache.lock().unwrap();
        match guard.as_ref() {
            Some(cached) if cached.expires_at > Instant::now() => {
                Aead::import_key(cipher_suite.to_nss_algorithm(), &cached.kek)
                    .map_err(|e| LockstoreError::Encryption(e.to_string()))
            }
            Some(_) => {
                *guard = None;
                Err(LockstoreError::Locked)
            }
            None => Err(LockstoreError::Locked),
        }
    }

    fn get_kek_local(
        &self,
        cipher_suite: CipherSuite,
        kek_ref: &str,
    ) -> Result<Vec<u8>, LockstoreError> {
        let db = Database::new(&self.store, DB_NAME);
        let key = Key::from(kek_ref);

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

    fn get_kek_from_token(
        &self,
        cipher_suite: CipherSuite,
        kek_ref: &str,
    ) -> Result<SymKey, LockstoreError> {
        // The caller must `unlock_kek` first; we gate on the Lockstore-side
        // auth cache. Absent or expired entries are reported as Locked so
        // the caller re-prompts instead of silently riding NSS's
        // already-authenticated-slot state.
        {
            let mut guard = self.pkcs11_auth_cache.lock().unwrap();
            match guard.get(kek_ref) {
                Some(&expires_at) if expires_at > Instant::now() => {}
                Some(_) => {
                    guard.remove(kek_ref);
                    return Err(LockstoreError::Locked);
                }
                None => return Err(LockstoreError::Locked),
            }
        }

        let pkcs11_uri_str = kek_ref.strip_prefix(KEK_REF_PREFIX).ok_or_else(|| {
            LockstoreError::InvalidKekRef(format!("Invalid kek_ref format: {}", kek_ref))
        })?;
        let uri = nss_rs::pk11_utils::parse(pkcs11_uri_str).map_err(|_| {
            LockstoreError::InvalidKekRef(format!("Invalid PKCS#11 URI: {}", kek_ref))
        })?;
        let slot = self.resolve_pkcs11_slot(&uri)?;

        if let Some(existing) = slot.find_key_by_nickname(kek_ref) {
            return Ok(existing);
        }

        slot.generate_token_key(
            p11::CKM_AES_KEY_GEN.into(),
            cipher_suite.key_size(),
            kek_ref,
        )
        .map_err(|e| LockstoreError::TokenError(format!("Failed to generate key: {}", e)))
    }

    fn resolve_pkcs11_slot(
        &self,
        uri: &nss_rs::pk11_utils::Pkcs11Uri,
    ) -> Result<p11::Slot, LockstoreError> {
        let token_name = uri.token.as_deref().ok_or_else(|| {
            LockstoreError::InvalidKekRef("PKCS#11 URI missing token attribute".into())
        })?;

        let internal_slot = p11::Slot::internal_key_slot()
            .map_err(|e| LockstoreError::TokenError(format!("Failed to get key slot: {}", e)))?;
        if internal_slot.token_name() == token_name {
            return Ok(internal_slot);
        }

        let slots = p11::all_token_slots(p11::CKM_AES_KEY_GEN.into());
        for slot in slots {
            if slot.token_name() == token_name {
                return Ok(slot);
            }
        }

        Err(LockstoreError::TokenError(format!(
            "Token not found: {}",
            token_name
        )))
    }

    // Metadata persistence (`load_metadata`, `save_metadata`) lives on
    // `ConnectionHandle` so the type system enforces that the caller
    // holds the connection lock.
}

impl Drop for Keystore {
    /// Flush PrP / PKCS#11 in-memory caches and close the underlying
    /// kvstore connection when the last `Arc<Keystore>` is dropped.
    /// Manual `close()` callers see the same behaviour; this is the
    /// safety net for paths that just let the Arc fall out of scope.
    fn drop(&mut self) {
        self.lock();
        if self.in_memory {
            let _ = crypto::zeroize(&self.store, DB_NAME, "lockstore::kek::local");
        }
        self.store.close();
    }
}

// ----------------------------------------------------------------------------
// Process-wide cache backing `Keystore::get`
// ----------------------------------------------------------------------------

use std::sync::{OnceLock, Weak};

/// Per-path cached keystore stored as a `Weak` so the entry self-evicts
/// when every caller has dropped its `Arc`. A `HashMap` (rather than a
/// single `OnceLock<Weak>`) keeps `Keystore::get` correct
/// across tests that exercise multiple temporary profiles in one
/// process; production has exactly one entry.
static SHARED_KEYSTORES: OnceLock<Mutex<HashMap<PathBuf, Weak<Keystore>>>> = OnceLock::new();
