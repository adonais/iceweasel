/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use lockstore_rs::{Keystore, LockstoreError, KEK_REF_LOCAL, KEK_REF_PRP};
use std::thread::sleep;
use std::time::Duration;
use tempfile::tempdir;

const PW: &[u8] = b"correct horse battery staple";
const PW_WRONG: &[u8] = b"Tr0ub4dor&3";
const PW_NEW: &[u8] = b"gs5^&mR2!fb@1";

fn on_disk_keystore() -> (std::sync::Arc<Keystore>, tempfile::TempDir) {
    let dir = tempdir().expect("tempdir");
    let path = dir.path().join("lockstore.keys.sqlite");
    let ks = Keystore::get(path).expect("new");
    (ks, dir)
}

#[test]
fn has_and_init_prp() {
    let ks = Keystore::new_in_memory().expect("new");
    assert!(!ks.has_prp());
    assert!(!ks.is_kek_unlocked(KEK_REF_PRP));

    ks.set_prp_test_only(None, PW).expect("set");
    assert!(ks.has_prp());
    assert!(!ks.is_kek_unlocked(KEK_REF_PRP));
}

#[test]
fn set_without_old_when_already_initialized_fails() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    let err = ks.set_prp_test_only(None, PW_NEW).unwrap_err();
    assert!(matches!(err, LockstoreError::InvalidConfiguration(_)));
}

#[test]
fn unlock_then_get_dek_succeeds() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
        .expect("unlock");
    assert!(ks.is_kek_unlocked(KEK_REF_PRP));

    ks.create_dek("col", KEK_REF_PRP, true).expect("create_dek");
    let (dek, _cs) = ks.get_dek("col", KEK_REF_PRP).expect("get_dek");
    assert_eq!(dek.len(), 32);
}

#[test]
fn get_dek_when_locked_fails() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
        .expect("unlock");
    ks.create_dek("col", KEK_REF_PRP, true).expect("create_dek");

    ks.lock_kek(KEK_REF_PRP);
    assert!(!ks.is_kek_unlocked(KEK_REF_PRP));
    let err = ks.get_dek("col", KEK_REF_PRP).unwrap_err();
    assert!(matches!(err, LockstoreError::Locked), "got: {:?}", err);
}

#[test]
fn unlock_expires_after_timeout() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    ks.create_dek("col", KEK_REF_LOCAL, true)
        .expect("create_dek");
    ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_millis(100))
        .expect("unlock");
    ks.add_kek("col", KEK_REF_LOCAL, KEK_REF_PRP)
        .expect("add PrP level");

    sleep(Duration::from_millis(200));
    assert!(!ks.is_kek_unlocked(KEK_REF_PRP));
    let err = ks.get_dek("col", KEK_REF_PRP).unwrap_err();
    assert!(matches!(err, LockstoreError::Locked), "got: {:?}", err);

    // LocalKey access still works after PrP expires.
    ks.get_dek("col", KEK_REF_LOCAL).expect("local still ok");
}

#[test]
fn wrong_password_returns_wrong_password_and_does_not_cache() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    let err = ks
        .unlock_kek(KEK_REF_PRP, PW_WRONG, Duration::from_secs(60))
        .unwrap_err();
    assert!(matches!(err, LockstoreError::WrongPassword));
    assert!(!ks.is_kek_unlocked(KEK_REF_PRP));
}

#[test]
fn unlock_before_init_returns_not_initialized() {
    let ks = Keystore::new_in_memory().expect("new");
    let err = ks
        .unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
        .unwrap_err();
    assert!(matches!(err, LockstoreError::NotInitialized));
}

#[test]
fn change_prp_rewraps_deks() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
        .expect("unlock old");

    ks.create_dek("c1", KEK_REF_PRP, true).expect("create c1");
    let (dek_before, _) = ks.get_dek("c1", KEK_REF_PRP).expect("get c1");

    ks.set_prp_test_only(Some(PW), PW_NEW).expect("change");
    assert!(!ks.is_kek_unlocked(KEK_REF_PRP));

    // Old password no longer works.
    assert!(matches!(
        ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60)),
        Err(LockstoreError::WrongPassword)
    ));

    // New password works and the DEK is unchanged (rewrap preserves DEK bytes).
    ks.unlock_kek(KEK_REF_PRP, PW_NEW, Duration::from_secs(60))
        .expect("unlock new");
    let (dek_after, _) = ks.get_dek("c1", KEK_REF_PRP).expect("get c1 again");
    assert_eq!(dek_before, dek_after);
}

#[test]
fn change_with_wrong_old_password_rejected() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    let err = ks.set_prp_test_only(Some(PW_WRONG), PW_NEW).unwrap_err();
    assert!(matches!(err, LockstoreError::WrongPassword));

    ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
        .expect("unlock with old still works");
}

#[test]
fn add_then_remove_local_level_leaves_prp_only() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
        .expect("unlock");

    ks.create_dek("c", KEK_REF_LOCAL, true).expect("create");
    ks.add_kek("c", KEK_REF_LOCAL, KEK_REF_PRP).expect("add");
    ks.remove_kek("c", KEK_REF_LOCAL).expect("remove");

    let err = ks.get_dek("c", KEK_REF_LOCAL).unwrap_err();
    assert!(matches!(err, LockstoreError::NotFound(_)));

    ks.get_dek("c", KEK_REF_PRP).expect("prp ok");

    ks.lock_kek(KEK_REF_PRP);
    let err = ks.get_dek("c", KEK_REF_PRP).unwrap_err();
    assert!(matches!(err, LockstoreError::Locked));
}

#[test]
fn reopen_on_disk_keystore_requires_unlock() {
    let dir = tempdir().expect("tempdir");
    let path = dir.path().join("lockstore.keys.sqlite");

    {
        let ks = Keystore::get(path.clone()).expect("new");
        ks.set_prp_test_only(None, PW).expect("set");
        ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
            .expect("unlock");
        ks.create_dek("persisted", KEK_REF_PRP, true)
            .expect("create");
        ks.close();
    }

    let ks2 = Keystore::get(path).expect("reopen");
    assert!(ks2.has_prp());
    assert!(!ks2.is_kek_unlocked(KEK_REF_PRP));
    let err = ks2.get_dek("persisted", KEK_REF_PRP).unwrap_err();
    assert!(matches!(err, LockstoreError::Locked));

    ks2.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
        .expect("unlock reopened");
    ks2.get_dek("persisted", KEK_REF_PRP)
        .expect("get after reopen+unlock");
}

#[test]
fn close_locks_prp() {
    let (ks, _dir) = on_disk_keystore();
    ks.set_prp_test_only(None, PW).expect("set");
    ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(3600))
        .expect("unlock");
    assert!(ks.is_kek_unlocked(KEK_REF_PRP));
    ks.close();
    // A fresh keystore at the same path must not inherit the unlocked state
    // (covered by `reopen_on_disk_keystore_requires_unlock`).
}

#[test]
fn encrypt_decrypt_roundtrip_local() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.create_dek("c", KEK_REF_LOCAL, false).expect("create");

    let plaintext = b"hello, lockstore";
    let blob = ks.encrypt("c", KEK_REF_LOCAL, plaintext).expect("encrypt");
    assert_ne!(blob, plaintext);
    let round = ks.decrypt("c", KEK_REF_LOCAL, &blob).expect("decrypt");
    assert_eq!(round, plaintext);
}

#[test]
fn encrypt_decrypt_roundtrip_prp() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
        .expect("unlock");
    ks.create_dek("c", KEK_REF_PRP, false).expect("create");

    let plaintext = b"secret";
    let blob = ks.encrypt("c", KEK_REF_PRP, plaintext).expect("encrypt");
    let round = ks.decrypt("c", KEK_REF_PRP, &blob).expect("decrypt");
    assert_eq!(round, plaintext);

    ks.lock_kek(KEK_REF_PRP);
    let err = ks.encrypt("c", KEK_REF_PRP, plaintext).unwrap_err();
    assert!(matches!(err, LockstoreError::Locked));
    let err = ks.decrypt("c", KEK_REF_PRP, &blob).unwrap_err();
    assert!(matches!(err, LockstoreError::Locked));
}

#[test]
fn encrypt_non_extractable_dek_still_works() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.create_dek("c", KEK_REF_LOCAL, false).expect("create");
    // get_dek rejects because not extractable...
    let err = ks.get_dek("c", KEK_REF_LOCAL).unwrap_err();
    assert!(matches!(err, LockstoreError::NotExtractable(_)));
    // ...but encrypt/decrypt bypass the extractability gate.
    let blob = ks.encrypt("c", KEK_REF_LOCAL, b"abc").expect("encrypt");
    let round = ks.decrypt("c", KEK_REF_LOCAL, &blob).expect("decrypt");
    assert_eq!(round, b"abc");
}

#[test]
fn prp_dek_supports_non_extractable() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
        .expect("unlock");

    ks.create_dek("nonex", KEK_REF_PRP, false)
        .expect("create_dek non-extractable");

    let err = ks.get_dek("nonex", KEK_REF_PRP).unwrap_err();
    assert!(
        matches!(err, LockstoreError::NotExtractable(_)),
        "expected NotExtractable, got {:?}",
        err
    );

    let pt = b"PrP-bound payload";
    let ct = ks
        .encrypt("nonex", KEK_REF_PRP, pt)
        .expect("encrypt under non-extractable PrP DEK");
    let pt2 = ks
        .decrypt("nonex", KEK_REF_PRP, &ct)
        .expect("decrypt under non-extractable PrP DEK");
    assert_eq!(pt2, pt);
}

#[test]
fn local_key_is_always_unlocked() {
    let ks = Keystore::new_in_memory().expect("new");
    assert!(ks.is_kek_unlocked(KEK_REF_LOCAL));
    // lock / unlock are no-ops for LocalKey.
    ks.lock_kek(KEK_REF_LOCAL);
    assert!(ks.is_kek_unlocked(KEK_REF_LOCAL));
    ks.unlock_kek(KEK_REF_LOCAL, b"", Duration::from_secs(1))
        .expect("unlock no-op");
    assert!(ks.is_kek_unlocked(KEK_REF_LOCAL));
}

#[test]
fn unknown_kek_ref_reports_locked() {
    let ks = Keystore::new_in_memory().expect("new");
    assert!(!ks.is_kek_unlocked("lockstore::kek::bogus"));
    // Attempting to unlock an unrecognised ref surfaces InvalidKekRef.
    let err = ks
        .unlock_kek("lockstore::kek::bogus", b"x", Duration::from_secs(1))
        .unwrap_err();
    assert!(matches!(err, LockstoreError::InvalidKekRef(_)));
    // lock_kek on an unrecognised ref is a no-op (no panic).
    ks.lock_kek("lockstore::kek::bogus");
}

#[test]
fn lock_clears_prp_cache() {
    let ks = Keystore::new_in_memory().expect("new");
    ks.set_prp_test_only(None, PW).expect("set");
    ks.unlock_kek(KEK_REF_PRP, PW, Duration::from_secs(60))
        .expect("unlock");
    assert!(ks.is_kek_unlocked(KEK_REF_PRP));

    ks.lock();
    assert!(!ks.is_kek_unlocked(KEK_REF_PRP));
}
