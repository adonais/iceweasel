/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use lockstore_rs::{CipherSuite, Keystore, LockstoreError};
use tempfile::tempdir;

const LOCAL: &str = "lockstore::kek::local";
const TEST_LEVEL: &str = "lockstore::kek::test";

#[test]
fn test_new_in_memory() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore.close();
}

#[test]
fn test_create_dek() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col1", LOCAL, true)
        .expect("Failed to create DEK");

    let collections = keystore.list_collections().expect("Failed to list");
    assert_eq!(collections, vec!["col1"]);

    keystore.close();
}

#[test]
fn test_create_dek_duplicate_fails() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("dup", LOCAL, true)
        .expect("Failed to create DEK");

    let result = keystore.create_dek("dup", LOCAL, true);
    assert!(matches!(
        result,
        Err(LockstoreError::InvalidConfiguration(_))
    ));

    keystore.close();
}

#[test]
fn test_delete_dek() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("to_delete", LOCAL, true)
        .expect("Failed to create DEK");

    keystore.delete_dek("to_delete").expect("Failed to delete");

    let collections = keystore.list_collections().expect("Failed to list");
    assert!(collections.is_empty());

    keystore.close();
}

#[test]
fn test_delete_dek_nonexistent() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    let result = keystore.delete_dek("nonexistent");
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_extractable_dek() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("extractable", LOCAL, true)
        .expect("Failed to create DEK");

    assert!(keystore
        .is_dek_extractable("extractable")
        .expect("Failed to check"));

    let (key, cipher_suite) = keystore
        .get_dek("extractable", LOCAL)
        .expect("Failed to get DEK");
    assert!(!key.is_empty());
    assert_eq!(cipher_suite, CipherSuite::Aes256Gcm);

    keystore.close();
}

#[test]
fn test_non_extractable_dek() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("non_extractable", LOCAL, false)
        .expect("Failed to create DEK");

    assert!(!keystore
        .is_dek_extractable("non_extractable")
        .expect("Failed to check"));

    let result = keystore.get_dek("non_extractable", LOCAL);
    assert!(matches!(result, Err(LockstoreError::NotExtractable(_))));

    keystore.close();
}

#[test]
fn test_create_dek_with_aes256gcm() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek_with_cipher("aes_col", LOCAL, true, CipherSuite::Aes256Gcm)
        .expect("Failed to create DEK");

    let (_key, cipher_suite) = keystore
        .get_dek("aes_col", LOCAL)
        .expect("Failed to get DEK");
    assert_eq!(cipher_suite, CipherSuite::Aes256Gcm);

    keystore.close();
}

#[test]
fn test_create_dek_with_chacha20() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek_with_cipher("chacha_col", LOCAL, true, CipherSuite::ChaCha20Poly1305)
        .expect("Failed to create DEK");

    let (_key, cipher_suite) = keystore
        .get_dek("chacha_col", LOCAL)
        .expect("Failed to get DEK");
    assert_eq!(cipher_suite, CipherSuite::ChaCha20Poly1305);

    keystore.close();
}

#[test]
fn test_get_dek_returns_correct_data() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("get_test", LOCAL, true)
        .expect("Failed to create DEK");

    let (key, cipher_suite) = keystore
        .get_dek("get_test", LOCAL)
        .expect("Failed to get DEK");

    assert_eq!(key.len(), cipher_suite.key_size());
    assert_eq!(cipher_suite, CipherSuite::Aes256Gcm);

    keystore.close();
}

#[test]
fn test_list_collections_empty() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    let collections = keystore.list_collections().expect("Failed to list");
    assert!(collections.is_empty());

    keystore.close();
}

#[test]
fn test_list_collections_single() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("only", LOCAL, true)
        .expect("Failed to create DEK");

    let collections = keystore.list_collections().expect("Failed to list");
    assert_eq!(collections, vec!["only"]);

    keystore.close();
}

#[test]
fn test_list_collections_multiple() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("alpha", LOCAL, true)
        .expect("Failed to create DEK");
    keystore
        .create_dek("beta", LOCAL, false)
        .expect("Failed to create DEK");
    keystore
        .create_dek("gamma", LOCAL, true)
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
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("a", LOCAL, true)
        .expect("Failed to create DEK");
    keystore
        .create_dek("b", LOCAL, true)
        .expect("Failed to create DEK");

    keystore.delete_dek("a").expect("Failed to delete");

    let collections = keystore.list_collections().expect("Failed to list");
    assert_eq!(collections, vec!["b"]);

    keystore.close();
}

#[test]
fn test_list_collection_keks_after_create_dek() {
    let keystore = Keystore::new_in_memory().unwrap();
    keystore.create_dek("col", LOCAL, true).unwrap();

    let refs = keystore.list_collection_keks("col").unwrap();
    assert_eq!(refs, vec![LOCAL.to_string()]);

    keystore.close();
}

#[test]
fn test_list_collection_keks_after_add_kek() {
    let keystore = Keystore::new_in_memory().unwrap();
    keystore.create_dek("col", LOCAL, true).unwrap();
    keystore.add_kek("col", LOCAL, TEST_LEVEL).unwrap();

    let refs = keystore.list_collection_keks("col").unwrap();
    assert_eq!(refs.len(), 2);
    assert!(refs.contains(&LOCAL.to_string()));
    assert!(refs.contains(&TEST_LEVEL.to_string()));

    keystore.close();
}

#[test]
fn test_list_collection_keks_after_remove_kek() {
    let keystore = Keystore::new_in_memory().unwrap();
    keystore.create_dek("col", LOCAL, true).unwrap();
    keystore.add_kek("col", LOCAL, TEST_LEVEL).unwrap();
    keystore.remove_kek("col", LOCAL).unwrap();

    let refs = keystore.list_collection_keks("col").unwrap();
    assert_eq!(refs, vec![TEST_LEVEL.to_string()]);

    keystore.close();
}

#[test]
fn test_list_collection_keks_unknown_collection() {
    let keystore = Keystore::new_in_memory().unwrap();
    let result = keystore.list_collection_keks("nonexistent");
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_get_dek_missing_collection() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    let result = keystore.get_dek("nonexistent", LOCAL);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_is_dek_extractable_missing_collection() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    let result = keystore.is_dek_extractable("nonexistent");
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_close() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore.close();
}

#[test]
fn test_new_on_disk() {
    let dir = tempdir().expect("Failed to create temp dir");
    let path = dir.path().join("keystore.sqlite");

    let keystore = Keystore::get(path).expect("Failed to create on-disk keystore");
    keystore
        .create_dek("col1", LOCAL, true)
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
        let keystore = Keystore::get(path.clone()).expect("Failed to create on-disk keystore");
        keystore
            .create_dek("persist", LOCAL, true)
            .expect("Failed to create DEK");
        let (key, _cs) = keystore
            .get_dek("persist", LOCAL)
            .expect("Failed to get DEK");
        key_material = key;
        keystore.close();
    }

    let keystore = Keystore::get(path).expect("Failed to reopen keystore");
    let (key, cipher_suite) = keystore
        .get_dek("persist", LOCAL)
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
        let keystore = Keystore::get(path.clone()).expect("Failed to create on-disk keystore");
        keystore
            .create_dek("alpha", LOCAL, true)
            .expect("Failed to create DEK");
        keystore
            .create_dek("beta", LOCAL, false)
            .expect("Failed to create DEK");
        keystore
            .create_dek("gamma", LOCAL, true)
            .expect("Failed to create DEK");
        keystore.close();
    }

    let keystore = Keystore::get(path).expect("Failed to reopen keystore");
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
        let keystore = Keystore::get(path.clone()).expect("Failed to create on-disk keystore");
        keystore
            .create_dek("to_delete", LOCAL, true)
            .expect("Failed to create DEK");
        keystore
            .delete_dek("to_delete")
            .expect("Failed to delete DEK");
        keystore.close();
    }

    let keystore = Keystore::get(path).expect("Failed to reopen keystore");
    let result = keystore.get_dek("to_delete", LOCAL);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    let collections = keystore.list_collections().expect("Failed to list");
    assert!(collections.is_empty());

    keystore.close();
}

#[test]
fn test_add_kek() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", LOCAL, true)
        .expect("Failed to create DEK");

    keystore
        .add_kek("col", LOCAL, TEST_LEVEL)
        .expect("Failed to add security level");

    let (key_local, _) = keystore
        .get_dek("col", LOCAL)
        .expect("Failed to get via LocalKey");
    let (key_test, _) = keystore
        .get_dek("col", TEST_LEVEL)
        .expect("Failed to get via Test");

    assert_eq!(
        key_local, key_test,
        "both levels should decrypt to the same DEK"
    );

    keystore.close();
}

#[test]
fn test_add_duplicate_kek_fails() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", LOCAL, true)
        .expect("Failed to create DEK");

    let result = keystore.add_kek("col", LOCAL, LOCAL);
    assert!(matches!(
        result,
        Err(LockstoreError::InvalidConfiguration(_))
    ));

    keystore.close();
}

#[test]
fn test_add_kek_missing_source_fails() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", LOCAL, true)
        .expect("Failed to create DEK");

    let result = keystore.add_kek("col", TEST_LEVEL, LOCAL);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_remove_kek() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", LOCAL, true)
        .expect("Failed to create DEK");
    keystore
        .add_kek("col", LOCAL, TEST_LEVEL)
        .expect("Failed to add security level");

    keystore
        .remove_kek("col", TEST_LEVEL)
        .expect("Failed to remove security level");

    let result = keystore.get_dek("col", TEST_LEVEL);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    let (key, _) = keystore
        .get_dek("col", LOCAL)
        .expect("LocalKey should still work");
    assert!(!key.is_empty());

    keystore.close();
}

#[test]
fn test_remove_last_kek_fails() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", LOCAL, true)
        .expect("Failed to create DEK");

    let result = keystore.remove_kek("col", LOCAL);
    assert!(matches!(
        result,
        Err(LockstoreError::InvalidConfiguration(_))
    ));

    keystore.close();
}

#[test]
fn test_remove_kek_authenticates() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", LOCAL, true)
        .expect("Failed to create DEK");
    keystore
        .add_kek("col", LOCAL, TEST_LEVEL)
        .expect("Failed to add security level");

    keystore
        .remove_kek("col", TEST_LEVEL)
        .expect("Should authenticate and remove successfully");

    keystore.close();
}

#[test]
fn test_remove_nonexistent_kek_fails() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", LOCAL, true)
        .expect("Failed to create DEK");
    keystore
        .add_kek("col", LOCAL, TEST_LEVEL)
        .expect("Failed to add security level");

    let result = keystore.remove_kek("missing_col", LOCAL);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_invalid_kek_ref() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    let result = keystore.create_dek("col", "invalid::ref", true);
    assert!(matches!(result, Err(LockstoreError::InvalidKekRef(_))));

    keystore.close();
}

#[test]
fn test_encrypt_decrypt_roundtrip() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, false)
        .expect("Failed to create DEK");

    let plaintext = b"hello, lockstore";
    let blob = keystore
        .encrypt("col", LOCAL, plaintext)
        .expect("Failed to encrypt");
    assert_ne!(blob.as_slice(), &plaintext[..]);
    let round = keystore
        .decrypt("col", LOCAL, &blob)
        .expect("Failed to decrypt");
    assert_eq!(round, plaintext);

    keystore.close();
}

#[test]
fn test_encrypt_empty_plaintext() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, false)
        .expect("Failed to create DEK");

    let blob = keystore.encrypt("col", LOCAL, b"").expect("encrypt empty");
    let round = keystore
        .decrypt("col", LOCAL, &blob)
        .expect("decrypt empty");
    assert!(round.is_empty());

    keystore.close();
}

#[test]
fn test_encrypt_produces_unique_ciphertexts() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, false)
        .expect("Failed to create DEK");

    let a = keystore.encrypt("col", LOCAL, b"same").expect("encrypt a");
    let b = keystore.encrypt("col", LOCAL, b"same").expect("encrypt b");
    assert_ne!(
        a, b,
        "two encryptions of the same plaintext must differ (nonce randomness)"
    );

    keystore.close();
}

#[test]
fn test_encrypt_bypasses_extractability() {
    // encrypt/decrypt must work on a non-extractable DEK even though get_dek refuses.
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, false)
        .expect("Failed to create DEK");

    assert!(matches!(
        keystore.get_dek("col", LOCAL),
        Err(LockstoreError::NotExtractable(_))
    ));

    let blob = keystore.encrypt("col", LOCAL, b"abc").expect("encrypt");
    let round = keystore.decrypt("col", LOCAL, &blob).expect("decrypt");
    assert_eq!(round, b"abc");

    keystore.close();
}

#[test]
fn test_encrypt_missing_collection() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    let err = keystore.encrypt("nosuch", LOCAL, b"x").unwrap_err();
    assert!(matches!(err, LockstoreError::NotFound(_)));
    keystore.close();
}

#[test]
fn test_encrypt_unknown_kek_ref_on_existing_collection() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, false)
        .expect("Failed to create DEK");

    let err = keystore.encrypt("col", TEST_LEVEL, b"x").unwrap_err();
    assert!(matches!(err, LockstoreError::NotFound(_)));
    keystore.close();
}

#[test]
fn test_encrypt_invalid_kek_ref() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, false)
        .expect("Failed to create DEK");

    let err = keystore.encrypt("col", "bogus::ref", b"x").unwrap_err();
    assert!(matches!(err, LockstoreError::InvalidKekRef(_)));
    keystore.close();
}

#[test]
fn test_decrypt_tampered_ciphertext_fails() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, false)
        .expect("Failed to create DEK");

    let mut blob = keystore.encrypt("col", LOCAL, b"hello").expect("encrypt");
    // Flip a byte past the cipher-suite prefix and nonce so the AEAD tag rejects.
    let last = blob.len() - 1;
    blob[last] ^= 0x01;
    let err = keystore.decrypt("col", LOCAL, &blob).unwrap_err();
    assert!(matches!(err, LockstoreError::Decryption(_)));

    keystore.close();
}

#[test]
fn test_decrypt_empty_ciphertext_fails() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, false)
        .expect("Failed to create DEK");

    let err = keystore.decrypt("col", LOCAL, &[]).unwrap_err();
    assert!(matches!(err, LockstoreError::Decryption(_)));
    keystore.close();
}

#[test]
fn test_decrypt_tampered_cipher_suite_prefix_fails() {
    // The cipher-suite id is the blob's leading byte. Flipping it to
    // point at a different (still-valid) suite must be rejected before
    // AEAD even runs, because the DEK was created under a known suite.
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek_with_cipher("col", LOCAL, false, CipherSuite::Aes256Gcm)
        .expect("create DEK");
    let mut blob = keystore.encrypt("col", LOCAL, b"hello").expect("encrypt");
    // Aes256Gcm = 0, ChaCha20Poly1305 = 1. Flip to the other one.
    assert_eq!(blob[0], 0, "fresh blob carries the Aes256Gcm id");
    blob[0] = 1;
    let err = keystore.decrypt("col", LOCAL, &blob).unwrap_err();
    match err {
        LockstoreError::Decryption(msg) => {
            assert!(
                msg.contains("cipher-suite mismatch"),
                "expected cipher-suite mismatch message, got: {}",
                msg
            );
        }
        other => panic!(
            "expected Decryption(cipher-suite mismatch), got {:?}",
            other
        ),
    }
    keystore.close();
}

#[test]
fn test_decrypt_unknown_cipher_suite_prefix_fails() {
    // An unknown cipher-suite id (any byte not in the supported set)
    // must be rejected at parse time with `Decryption("Unknown cipher
    // suite id: …")`.
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, false)
        .expect("create DEK");
    let mut blob = keystore.encrypt("col", LOCAL, b"hello").expect("encrypt");
    blob[0] = 0xff;
    let err = keystore.decrypt("col", LOCAL, &blob).unwrap_err();
    match err {
        LockstoreError::Decryption(msg) => {
            assert!(
                msg.contains("Unknown cipher suite id"),
                "expected unknown-id message, got: {}",
                msg
            );
        }
        other => panic!(
            "expected Decryption(Unknown cipher suite id), got {:?}",
            other
        ),
    }
    keystore.close();
}

#[test]
fn test_decrypt_truncated_ciphertext_fails() {
    // Drop the trailing AEAD tag → the AEAD layer must reject. Distinct
    // from byte-flipping in the middle: this exercises the
    // length-too-short or tag-missing path inside NSS's AEAD.
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, false)
        .expect("create DEK");
    let blob = keystore.encrypt("col", LOCAL, b"hello").expect("encrypt");
    // AES-GCM and ChaCha20-Poly1305 both use a 16-byte tag.
    assert!(blob.len() > 16, "blob should be > tag size");
    let truncated = &blob[..blob.len() - 16];
    let err = keystore.decrypt("col", LOCAL, truncated).unwrap_err();
    assert!(matches!(err, LockstoreError::Decryption(_)));
    keystore.close();
}

#[test]
fn test_decrypt_with_wrong_dek_fails() {
    // Two distinct DEKs encrypt-decrypt independently. A ciphertext
    // produced under DEK A must not decrypt under DEK B (different
    // collection ⇒ different random DEK).
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore.create_dek("a", LOCAL, false).expect("create A");
    keystore.create_dek("b", LOCAL, false).expect("create B");
    let blob = keystore.encrypt("a", LOCAL, b"hello").expect("encrypt A");
    // Decrypt under collection "b" — DEK mismatch, AEAD tag fails.
    let err = keystore.decrypt("b", LOCAL, &blob).unwrap_err();
    assert!(matches!(err, LockstoreError::Decryption(_)));
    keystore.close();
}

#[test]
fn test_encrypt_decrypt_across_keks_share_dek() {
    // After add_kek, a ciphertext produced at one level must decrypt
    // at another — they wrap the same underlying DEK.
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");
    keystore
        .create_dek("col", LOCAL, true)
        .expect("Failed to create DEK");
    keystore
        .add_kek("col", LOCAL, TEST_LEVEL)
        .expect("Failed to add level");

    let blob = keystore
        .encrypt("col", LOCAL, b"cross-level")
        .expect("encrypt at local");
    let round = keystore
        .decrypt("col", TEST_LEVEL, &blob)
        .expect("decrypt at test");
    assert_eq!(round, b"cross-level");

    keystore.close();
}

// ---------------------------------------------------------------------------
// Process-wide shared keystore accessor (`Keystore::get`).
// ---------------------------------------------------------------------------

#[test]
fn test_lockstore_keystore_get_returns_same_arc() {
    use std::sync::Arc;

    let dir = tempdir().expect("Failed to create temp dir");
    let path = dir.path().join("lockstore.keys.sqlite");

    let a = Keystore::get(path.clone()).expect("first open");
    let b = Keystore::get(path.clone()).expect("second open");
    assert!(
        Arc::ptr_eq(&a, &b),
        "two calls with the same path must return the same Arc"
    );
}

#[test]
fn test_lockstore_keystore_get_distinct_paths() {
    use std::sync::Arc;

    let dir_a = tempdir().expect("Failed to create temp dir A");
    let dir_b = tempdir().expect("Failed to create temp dir B");
    let path_a = dir_a.path().join("lockstore.keys.sqlite");
    let path_b = dir_b.path().join("lockstore.keys.sqlite");

    let a = Keystore::get(path_a).expect("open A");
    let b = Keystore::get(path_b).expect("open B");
    assert!(
        !Arc::ptr_eq(&a, &b),
        "different paths must yield distinct Arcs"
    );
}

#[test]
fn test_lockstore_keystore_get_state_visible_across_handles() {
    // Behavioural invariant: writes through one Arc are visible through
    // any other Arc returned by `Keystore::get` for the same
    // path, because there's only one underlying handle.

    let dir = tempdir().expect("Failed to create temp dir");
    let path = dir.path().join("lockstore.keys.sqlite");

    let a = Keystore::get(path.clone()).expect("first open");
    a.create_dek("shared-state", LOCAL, true)
        .expect("create DEK via first handle");

    let b = Keystore::get(path).expect("second open");
    let collections = b.list_collections().expect("list via second handle");
    assert!(
        collections.contains(&"shared-state".to_string()),
        "DEK created via the first handle must be visible via the second"
    );
}

#[test]
fn test_import_dek_local_key() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    let dek = [7u8; 32];
    keystore
        .import_dek("imported", LOCAL, &dek, true)
        .expect("Failed to import DEK");

    let (round, suite) = keystore
        .get_dek("imported", LOCAL)
        .expect("Failed to get imported DEK");
    assert_eq!(round, dek, "round-tripped DEK matches imported bytes");
    assert_eq!(suite, CipherSuite::Aes256Gcm);

    // Sanity: encrypt/decrypt under the imported DEK.
    let ct = keystore
        .encrypt("imported", LOCAL, b"payload")
        .expect("encrypt");
    let pt = keystore.decrypt("imported", LOCAL, &ct).expect("decrypt");
    assert_eq!(pt, b"payload");

    keystore.close();
}

#[test]
fn test_import_dek_rejects_wrong_length() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    let short = [9u8; 16];
    let result = keystore.import_dek("short", LOCAL, &short, true);
    assert!(matches!(
        result,
        Err(LockstoreError::InvalidConfiguration(_))
    ));

    keystore.close();
}

#[test]
fn test_import_dek_rejects_existing_collection() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    let dek = [3u8; 32];
    keystore
        .import_dek("dup", LOCAL, &dek, true)
        .expect("first import");

    let result = keystore.import_dek("dup", LOCAL, &dek, true);
    assert!(matches!(
        result,
        Err(LockstoreError::InvalidConfiguration(_))
    ));

    keystore.close();
}

#[test]
fn test_import_dek_non_extractable() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    let dek = [11u8; 32];
    keystore
        .import_dek("hidden", LOCAL, &dek, false)
        .expect("import");

    assert!(!keystore
        .is_dek_extractable("hidden")
        .expect("query extractability"));

    let result = keystore.get_dek("hidden", LOCAL);
    assert!(matches!(result, Err(LockstoreError::NotExtractable(_))));

    // encrypt/decrypt still works — the bytes never need to leave the keystore.
    let ct = keystore
        .encrypt("hidden", LOCAL, b"opaque")
        .expect("encrypt");
    let pt = keystore.decrypt("hidden", LOCAL, &ct).expect("decrypt");
    assert_eq!(pt, b"opaque");

    keystore.close();
}

#[test]
fn test_switch_kek_local_to_test() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore
        .create_dek("col", LOCAL, true)
        .expect("Failed to create DEK");
    let (before, _) = keystore.get_dek("col", LOCAL).expect("get DEK before");

    keystore
        .switch_kek("col", LOCAL, TEST_LEVEL)
        .expect("Failed to switch KEK");

    let keks = keystore.list_collection_keks("col").expect("list keks");
    assert_eq!(
        keks,
        vec![TEST_LEVEL.to_string()],
        "only the new kek_ref should wrap the collection after switch"
    );

    let (after, _) = keystore
        .get_dek("col", TEST_LEVEL)
        .expect("get DEK via new kek_ref");
    assert_eq!(before, after, "DEK bytes are unchanged across switch");

    let missing = keystore.get_dek("col", LOCAL);
    assert!(
        matches!(missing, Err(LockstoreError::NotFound(_))),
        "old kek_ref no longer wraps the collection"
    );

    keystore.close();
}

#[test]
fn test_switch_kek_rejects_same_ref() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore.create_dek("col", LOCAL, true).expect("create");
    let result = keystore.switch_kek("col", LOCAL, LOCAL);
    assert!(matches!(
        result,
        Err(LockstoreError::InvalidConfiguration(_))
    ));

    keystore.close();
}

#[test]
fn test_switch_kek_rejects_new_already_wraps() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore.create_dek("col", LOCAL, true).expect("create");
    keystore
        .add_kek("col", LOCAL, TEST_LEVEL)
        .expect("add second KEK");

    // Both LOCAL and TEST_LEVEL wrap "col"; switching LOCAL → TEST_LEVEL
    // would duplicate the new wrapping.
    let result = keystore.switch_kek("col", LOCAL, TEST_LEVEL);
    assert!(matches!(
        result,
        Err(LockstoreError::InvalidConfiguration(_))
    ));

    keystore.close();
}

#[test]
fn test_switch_kek_rejects_missing_old() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore.create_dek("col", LOCAL, true).expect("create");
    let result = keystore.switch_kek("col", TEST_LEVEL, LOCAL);
    assert!(matches!(result, Err(LockstoreError::NotFound(_))));

    keystore.close();
}

#[test]
fn test_switch_kek_preserves_ciphertext() {
    let keystore = Keystore::new_in_memory().expect("Failed to create keystore");

    keystore.create_dek("col", LOCAL, false).expect("create");
    let ct = keystore
        .encrypt("col", LOCAL, b"pre-switch")
        .expect("encrypt before switch");

    keystore
        .switch_kek("col", LOCAL, TEST_LEVEL)
        .expect("switch");

    // The same ciphertext must still decrypt under the new kek_ref:
    // switch_kek changes only the wrapping, not the DEK itself.
    let pt = keystore
        .decrypt("col", TEST_LEVEL, &ct)
        .expect("decrypt after switch");
    assert_eq!(pt, b"pre-switch");

    keystore.close();
}
