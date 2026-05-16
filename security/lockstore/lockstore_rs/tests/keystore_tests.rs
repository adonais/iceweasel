/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use lockstore_rs::{CipherSuite, LockstoreError, LockstoreKeystore, SecurityLevel};
use tempfile::tempdir;

#[test]
fn test_new_in_memory() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");
    keystore.close();
}

#[test]
fn test_create_dek() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col1", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    let collections = keystore.list_collections().expect("Failed to list");
    assert_eq!(collections, vec!["col1"]);

    keystore.close();
}

#[test]
fn test_create_dek_duplicate_fails() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("dup", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    let result = keystore.create_dek("dup", SecurityLevel::LocalKey, true);
    assert!(matches!(
        result,
        Err(LockstoreError::InvalidConfiguration(_))
    ));

    keystore.close();
}

#[test]
fn test_delete_dek() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("to_delete", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    keystore.delete_dek("to_delete").expect("Failed to delete");

    let collections = keystore.list_collections().expect("Failed to list");
    assert!(collections.is_empty());

    keystore.close();
}

#[test]
fn test_delete_dek_nonexistent() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    let result = keystore.delete_dek("nonexistent");
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_extractable_dek() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("extractable", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    assert!(keystore
        .is_dek_extractable("extractable")
        .expect("Failed to check"));

    let (key, cipher_suite) = keystore
        .get_dek("extractable", SecurityLevel::LocalKey)
        .expect("Failed to get DEK");
    assert!(!key.is_empty());
    assert_eq!(cipher_suite, CipherSuite::Aes256Gcm);

    keystore.close();
}

#[test]
fn test_non_extractable_dek() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("non_extractable", SecurityLevel::LocalKey, false)
        .expect("Failed to create DEK");

    assert!(!keystore
        .is_dek_extractable("non_extractable")
        .expect("Failed to check"));

    let result = keystore.get_dek("non_extractable", SecurityLevel::LocalKey);
    assert!(matches!(result, Err(LockstoreError::NotExtractable(_))));

    keystore.close();
}

#[test]
fn test_create_dek_with_aes256gcm() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek_with_cipher(
            "aes_col",
            SecurityLevel::LocalKey,
            true,
            CipherSuite::Aes256Gcm,
        )
        .expect("Failed to create DEK");

    let (_key, cipher_suite) = keystore
        .get_dek("aes_col", SecurityLevel::LocalKey)
        .expect("Failed to get DEK");
    assert_eq!(cipher_suite, CipherSuite::Aes256Gcm);

    keystore.close();
}

#[test]
fn test_create_dek_with_chacha20() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek_with_cipher(
            "chacha_col",
            SecurityLevel::LocalKey,
            true,
            CipherSuite::ChaCha20Poly1305,
        )
        .expect("Failed to create DEK");

    let (_key, cipher_suite) = keystore
        .get_dek("chacha_col", SecurityLevel::LocalKey)
        .expect("Failed to get DEK");
    assert_eq!(cipher_suite, CipherSuite::ChaCha20Poly1305);

    keystore.close();
}

#[test]
fn test_get_dek_returns_correct_data() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("get_test", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    let (key, cipher_suite) = keystore
        .get_dek("get_test", SecurityLevel::LocalKey)
        .expect("Failed to get DEK");

    assert_eq!(key.len(), cipher_suite.key_size());
    assert_eq!(cipher_suite, CipherSuite::Aes256Gcm);

    keystore.close();
}

#[test]
fn test_list_collections_empty() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    let collections = keystore.list_collections().expect("Failed to list");
    assert!(collections.is_empty());

    keystore.close();
}

#[test]
fn test_list_collections_single() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("only", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    let collections = keystore.list_collections().expect("Failed to list");
    assert_eq!(collections, vec!["only"]);

    keystore.close();
}

#[test]
fn test_list_collections_multiple() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("alpha", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");
    keystore
        .create_dek("beta", SecurityLevel::LocalKey, false)
        .expect("Failed to create DEK");
    keystore
        .create_dek("gamma", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    let collections = keystore.list_collections().expect("Failed to list");
    assert_eq!(collections.len(), 3);
    assert!(collections.contains(&"alpha".to_string()));
    assert!(collections.contains(&"beta".to_string()));
    assert!(collections.contains(&"gamma".to_string()));

    keystore.close();
}

#[test]
fn test_list_collections_after_delete() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("a", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");
    keystore
        .create_dek("b", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    keystore.delete_dek("a").expect("Failed to delete");

    let collections = keystore.list_collections().expect("Failed to list");
    assert_eq!(collections, vec!["b"]);

    keystore.close();
}

#[test]
fn test_get_dek_missing_collection() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    let result = keystore.get_dek("nonexistent", SecurityLevel::LocalKey);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_is_dek_extractable_missing_collection() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    let result = keystore.is_dek_extractable("nonexistent");
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_close() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");
    keystore.close();
}

#[test]
fn test_new_on_disk() {
    let dir = tempdir().expect("Failed to create temp dir");
    let path = dir.path().join("keystore.sqlite");

    let keystore = LockstoreKeystore::new(path).expect("Failed to create on-disk keystore");
    keystore
        .create_dek("col1", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    let collections = keystore.list_collections().expect("Failed to list");
    assert_eq!(collections, vec!["col1"]);

    keystore.close();
}

#[test]
fn test_on_disk_persistence() {
    let dir = tempdir().expect("Failed to create temp dir");
    let path = dir.path().join("keystore.sqlite");

    let key_material;
    {
        let keystore =
            LockstoreKeystore::new(path.clone()).expect("Failed to create on-disk keystore");
        keystore
            .create_dek("persist", SecurityLevel::LocalKey, true)
            .expect("Failed to create DEK");
        let (key, _cs) = keystore
            .get_dek("persist", SecurityLevel::LocalKey)
            .expect("Failed to get DEK");
        key_material = key;
        keystore.close();
    }

    let keystore = LockstoreKeystore::new(path).expect("Failed to reopen keystore");
    let (key, cipher_suite) = keystore
        .get_dek("persist", SecurityLevel::LocalKey)
        .expect("DEK should persist");
    assert_eq!(key, key_material);
    assert_eq!(cipher_suite, CipherSuite::Aes256Gcm);

    keystore.close();
}

#[test]
fn test_on_disk_list_collections_persists() {
    let dir = tempdir().expect("Failed to create temp dir");
    let path = dir.path().join("keystore.sqlite");

    {
        let keystore =
            LockstoreKeystore::new(path.clone()).expect("Failed to create on-disk keystore");
        keystore
            .create_dek("alpha", SecurityLevel::LocalKey, true)
            .expect("Failed to create DEK");
        keystore
            .create_dek("beta", SecurityLevel::LocalKey, false)
            .expect("Failed to create DEK");
        keystore
            .create_dek("gamma", SecurityLevel::LocalKey, true)
            .expect("Failed to create DEK");
        keystore.close();
    }

    let keystore = LockstoreKeystore::new(path).expect("Failed to reopen keystore");
    let collections = keystore.list_collections().expect("Failed to list");
    assert_eq!(collections.len(), 3);
    assert!(collections.contains(&"alpha".to_string()));
    assert!(collections.contains(&"beta".to_string()));
    assert!(collections.contains(&"gamma".to_string()));

    keystore.close();
}

#[test]
fn test_on_disk_delete_dek_persists() {
    let dir = tempdir().expect("Failed to create temp dir");
    let path = dir.path().join("keystore.sqlite");

    {
        let keystore =
            LockstoreKeystore::new(path.clone()).expect("Failed to create on-disk keystore");
        keystore
            .create_dek("to_delete", SecurityLevel::LocalKey, true)
            .expect("Failed to create DEK");
        keystore
            .delete_dek("to_delete")
            .expect("Failed to delete DEK");
        keystore.close();
    }

    let keystore = LockstoreKeystore::new(path).expect("Failed to reopen keystore");
    let result = keystore.get_dek("to_delete", SecurityLevel::LocalKey);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    let collections = keystore.list_collections().expect("Failed to list");
    assert!(collections.is_empty());

    keystore.close();
}

#[test]
fn test_add_security_level() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    keystore
        .add_security_level("col", SecurityLevel::LocalKey, SecurityLevel::TestLevel)
        .expect("Failed to add security level");

    let (key_local, _) = keystore
        .get_dek("col", SecurityLevel::LocalKey)
        .expect("Failed to get via LocalKey");
    let (key_test, _) = keystore
        .get_dek("col", SecurityLevel::TestLevel)
        .expect("Failed to get via TestLevel");

    assert_eq!(
        key_local, key_test,
        "both levels should decrypt to the same DEK"
    );

    keystore.close();
}

#[test]
fn test_add_duplicate_security_level_fails() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    let result =
        keystore.add_security_level("col", SecurityLevel::LocalKey, SecurityLevel::LocalKey);
    assert!(matches!(
        result,
        Err(LockstoreError::InvalidConfiguration(_))
    ));

    keystore.close();
}

#[test]
fn test_add_security_level_missing_source_fails() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    let result =
        keystore.add_security_level("col", SecurityLevel::TestLevel, SecurityLevel::LocalKey);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_remove_security_level() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");
    keystore
        .add_security_level("col", SecurityLevel::LocalKey, SecurityLevel::TestLevel)
        .expect("Failed to add security level");

    keystore
        .remove_security_level("col", SecurityLevel::TestLevel)
        .expect("Failed to remove security level");

    let result = keystore.get_dek("col", SecurityLevel::TestLevel);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    let (key, _) = keystore
        .get_dek("col", SecurityLevel::LocalKey)
        .expect("LocalKey should still work");
    assert!(!key.is_empty());

    keystore.close();
}

#[test]
fn test_remove_last_security_level_fails() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");

    let result = keystore.remove_security_level("col", SecurityLevel::LocalKey);
    assert!(matches!(
        result,
        Err(LockstoreError::InvalidConfiguration(_))
    ));

    keystore.close();
}

#[test]
fn test_remove_security_level_authenticates() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");
    keystore
        .add_security_level("col", SecurityLevel::LocalKey, SecurityLevel::TestLevel)
        .expect("Failed to add security level");

    // Removing TestLevel requires its KEK to exist and be valid.
    // Since it was just created, this should succeed.
    keystore
        .remove_security_level("col", SecurityLevel::TestLevel)
        .expect("Should authenticate and remove successfully");

    keystore.close();
}

#[test]
fn test_remove_nonexistent_security_level_fails() {
    let keystore = LockstoreKeystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", SecurityLevel::LocalKey, true)
        .expect("Failed to create DEK");
    keystore
        .add_security_level("col", SecurityLevel::LocalKey, SecurityLevel::TestLevel)
        .expect("Failed to add security level");

    let result = keystore.remove_security_level("missing_col", SecurityLevel::LocalKey);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}
