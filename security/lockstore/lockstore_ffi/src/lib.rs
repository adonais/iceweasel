/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

pub use lockstore_rs::LockstoreDatastore;
use lockstore_rs::{LockstoreError, LockstoreKeystore, SecurityLevel, KEYSTORE_FILENAME};
use nserror::{nsresult, NS_ERROR_FAILURE, NS_ERROR_INVALID_ARG, NS_ERROR_NOT_AVAILABLE, NS_OK};
use nsstring::{nsACString, nsCString};
use std::path::PathBuf;
use std::sync::Arc;
use thin_vec::ThinVec;

// ============================================================================
// Handle Types
// ============================================================================

pub struct LockstoreKeystoreHandle {
    keystore: Arc<LockstoreKeystore>,
    profile_path: PathBuf,
}

// ============================================================================
// Helpers
// ============================================================================

fn error_to_nsresult(err: LockstoreError) -> nsresult {
    log::error!("Lockstore error: {}", err);
    match err {
        LockstoreError::NotFound(_) => NS_ERROR_NOT_AVAILABLE,
        LockstoreError::Serialization(_) => NS_ERROR_INVALID_ARG,
        LockstoreError::NotExtractable(_) => NS_ERROR_NOT_AVAILABLE,
        _ => NS_ERROR_FAILURE,
    }
}

// ============================================================================
// Security Level FFI Type
// ============================================================================

#[repr(u32)]
#[derive(Debug, Clone, Copy)]
pub enum LockstoreSecurityLevel {
    LocalKey = 0,
}

impl From<LockstoreSecurityLevel> for SecurityLevel {
    fn from(level: LockstoreSecurityLevel) -> Self {
        match level {
            LockstoreSecurityLevel::LocalKey => SecurityLevel::LocalKey,
        }
    }
}

// ============================================================================
// Keystore FFI Functions
// ============================================================================

#[no_mangle]
pub unsafe extern "C" fn lockstore_keystore_open(
    profile_path: &nsACString,
    ret_handle: &mut *mut LockstoreKeystoreHandle,
) -> nsresult {
    if profile_path.is_empty() {
        log::error!("Profile path cannot be empty");
        return NS_ERROR_INVALID_ARG;
    }

    let profile_path_str = profile_path.to_utf8();
    let profile = PathBuf::from(profile_path_str.as_ref());
    let keystore_path = profile.join(KEYSTORE_FILENAME);

    let keystore = match LockstoreKeystore::new(keystore_path) {
        Ok(k) => Arc::new(k),
        Err(e) => return error_to_nsresult(e),
    };

    let handle = Box::new(LockstoreKeystoreHandle {
        keystore,
        profile_path: profile,
    });

    *ret_handle = Box::into_raw(handle);
    NS_OK
}

#[no_mangle]
pub extern "C" fn lockstore_keystore_create_dek(
    handle: &LockstoreKeystoreHandle,
    collection: &nsACString,
    security_level: LockstoreSecurityLevel,
    extractable: bool,
) -> nsresult {
    if collection.is_empty() {
        log::error!("Collection cannot be empty");
        return NS_ERROR_INVALID_ARG;
    }

    let coll_str = collection.to_utf8();

    match handle
        .keystore
        .create_dek(&coll_str, security_level.into(), extractable)
    {
        Ok(_) => NS_OK,
        Err(e) => error_to_nsresult(e),
    }
}

#[no_mangle]
pub extern "C" fn lockstore_keystore_get_dek(
    handle: &LockstoreKeystoreHandle,
    collection: &nsACString,
    security_level: LockstoreSecurityLevel,
    ret_dek: &mut ThinVec<u8>,
) -> nsresult {
    if collection.is_empty() {
        log::error!("Collection cannot be empty");
        return NS_ERROR_INVALID_ARG;
    }

    let coll_str = collection.to_utf8();

    match handle.keystore.get_dek(&coll_str, security_level.into()) {
        Ok((dek_bytes, _cipher_suite)) => {
            *ret_dek = dek_bytes.into();
            NS_OK
        }
        Err(e) => error_to_nsresult(e),
    }
}

#[no_mangle]
pub extern "C" fn lockstore_keystore_delete_dek(
    handle: &LockstoreKeystoreHandle,
    collection: &nsACString,
) -> nsresult {
    if collection.is_empty() {
        log::error!("Collection cannot be empty");
        return NS_ERROR_INVALID_ARG;
    }

    let coll_str = collection.to_utf8();

    match handle.keystore.delete_dek(&coll_str) {
        Ok(()) => NS_OK,
        Err(e) => error_to_nsresult(e),
    }
}

#[no_mangle]
pub extern "C" fn lockstore_keystore_list_collections(
    handle: &LockstoreKeystoreHandle,
    ret_collections: &mut ThinVec<nsCString>,
) -> nsresult {
    match handle.keystore.list_collections() {
        Ok(collections) => {
            *ret_collections = collections
                .into_iter()
                .map(|c| nsCString::from(&c[..]))
                .collect();
            NS_OK
        }
        Err(e) => error_to_nsresult(e),
    }
}

#[no_mangle]
pub extern "C" fn lockstore_keystore_add_security_level(
    handle: &LockstoreKeystoreHandle,
    collection: &nsACString,
    from_level: LockstoreSecurityLevel,
    to_level: LockstoreSecurityLevel,
) -> nsresult {
    if collection.is_empty() {
        log::error!("Collection cannot be empty");
        return NS_ERROR_INVALID_ARG;
    }
    let coll_str = collection.to_utf8();
    match handle
        .keystore
        .add_security_level(&coll_str, from_level.into(), to_level.into())
    {
        Ok(()) => NS_OK,
        Err(e) => error_to_nsresult(e),
    }
}

#[no_mangle]
pub extern "C" fn lockstore_keystore_remove_security_level(
    handle: &LockstoreKeystoreHandle,
    collection: &nsACString,
    level: LockstoreSecurityLevel,
) -> nsresult {
    if collection.is_empty() {
        log::error!("Collection cannot be empty");
        return NS_ERROR_INVALID_ARG;
    }
    let coll_str = collection.to_utf8();
    match handle
        .keystore
        .remove_security_level(&coll_str, level.into())
    {
        Ok(()) => NS_OK,
        Err(e) => error_to_nsresult(e),
    }
}

#[no_mangle]
pub unsafe extern "C" fn lockstore_keystore_close(
    handle: *mut LockstoreKeystoreHandle,
) -> nsresult {
    let _ = Box::from_raw(handle);
    NS_OK
}

// ============================================================================
// Datastore FFI Functions
// ============================================================================

#[no_mangle]
pub unsafe extern "C" fn lockstore_datastore_open(
    keystore_handle: &LockstoreKeystoreHandle,
    collection: &nsACString,
    security_level: LockstoreSecurityLevel,
    ret_handle: &mut *mut LockstoreDatastore,
) -> nsresult {
    if collection.is_empty() {
        log::error!("Collection cannot be empty");
        return NS_ERROR_INVALID_ARG;
    }

    let coll_str = collection.to_utf8();

    let datastore = match LockstoreDatastore::new(
        keystore_handle.profile_path.clone(),
        coll_str.to_string(),
        keystore_handle.keystore.clone(),
        security_level.into(),
    ) {
        Ok(d) => d,
        Err(e) => return error_to_nsresult(e),
    };

    *ret_handle = Box::into_raw(Box::new(datastore));
    NS_OK
}

#[no_mangle]
pub unsafe extern "C" fn lockstore_datastore_put(
    handle: &LockstoreDatastore,
    entry_name: &nsACString,
    data_ptr: *const u8,
    data_len: usize,
) -> nsresult {
    if entry_name.is_empty() {
        log::error!("Entry name cannot be empty");
        return NS_ERROR_INVALID_ARG;
    }

    if data_ptr.is_null() || data_len == 0 {
        log::error!("Invalid data pointer or length");
        return NS_ERROR_INVALID_ARG;
    }

    let data_slice = std::slice::from_raw_parts(data_ptr, data_len);
    let entry_str = entry_name.to_utf8();

    match handle.put(&entry_str, data_slice) {
        Ok(_) => NS_OK,
        Err(e) => error_to_nsresult(e),
    }
}

#[no_mangle]
pub extern "C" fn lockstore_datastore_get(
    handle: &LockstoreDatastore,
    entry_name: &nsACString,
    ret_data: &mut ThinVec<u8>,
) -> nsresult {
    if entry_name.is_empty() {
        log::error!("Entry name cannot be empty");
        return NS_ERROR_INVALID_ARG;
    }

    let entry_str = entry_name.to_utf8();

    match handle.get(&entry_str) {
        Ok(data) => {
            *ret_data = data.into();
            NS_OK
        }
        Err(e) => error_to_nsresult(e),
    }
}

#[no_mangle]
pub extern "C" fn lockstore_datastore_delete(
    handle: &LockstoreDatastore,
    entry_name: &nsACString,
) -> nsresult {
    if entry_name.is_empty() {
        log::error!("Entry name cannot be empty");
        return NS_ERROR_INVALID_ARG;
    }

    let entry_str = entry_name.to_utf8();

    match handle.delete(&entry_str) {
        Ok(()) => NS_OK,
        Err(e) => error_to_nsresult(e),
    }
}

#[no_mangle]
pub extern "C" fn lockstore_datastore_keys(
    handle: &LockstoreDatastore,
    ret_entries: &mut ThinVec<nsCString>,
) -> nsresult {
    match handle.keys() {
        Ok(entries) => {
            *ret_entries = entries
                .into_iter()
                .map(|e| nsCString::from(&e[..]))
                .collect();
            NS_OK
        }
        Err(e) => error_to_nsresult(e),
    }
}

#[no_mangle]
pub unsafe extern "C" fn lockstore_datastore_close(handle: *mut LockstoreDatastore) -> nsresult {
    Box::from_raw(handle).close();
    NS_OK
}
