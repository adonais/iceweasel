/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Noise channel tests.

use noise::*;
use nss_rs::aead::Aead;

/// Test encryption and decryption with a pair of [`Channel`s][Channel], passing the keys as raw
/// bytes.
#[test]
fn encrypt_decrypt() {
    nss_rs::init().expect("nss_rs::init");

    let key0 = [42; 32];
    let key1 = [67; 32];

    let mut alice = Channel::new_with_key_bytes(&key0, &key1).expect("alice/new_with_key_bytes");
    let mut bob = Channel::new_with_key_bytes(&key1, &key0).expect("bob/new_with_key_bytes");
    let mut corrupted =
        Channel::new_with_key_bytes(&key1, &key0).expect("corrupted/new_with_key_bytes");

    for l in 0..512 {
        let msg = vec![0xff; l];

        // Synchronise the "corrupted" channel with "bob", such that it should
        // be able to decrypt the same messages (if they were valid).
        corrupted.set_decrypt_nonce(bob.decrypt_nonce());

        let mut crypted = alice.encrypt(&msg).unwrap();
        let decrypted = bob.decrypt(&crypted).unwrap();
        assert_eq!(msg.as_slice(), decrypted.as_slice());
        assert_ne!(msg.as_slice(), crypted.as_slice());

        // Output should have lengthened due to the AEAD tag (16 bytes) and at
        // least 1 byte of padding.
        assert!(crypted.len() > l + 16);

        if l > 0 {
            // Corrupt the message
            crypted[(l * 3) % l] ^= 1;
            assert!(corrupted.decrypt(&crypted).is_err());
        }
    }
}

/// Test that a [`Channel`] encrypts with consistent, known results, passing the keys as `SymKey`
#[test]
fn consistency() {
    nss_rs::init().expect("nss_rs::init");

    let key0 = Aead::import_key(ALG, &[42; 32]).expect("import_key/key0");
    let key1 = Aead::import_key(ALG, &[67; 32]).expect("import_key/key1");

    let mut alice = Channel::new(&key0, &key1).expect("alice/new");
    let mut bob = Channel::new(&key1, &key0).expect("bob/new");

    let msg = b"The quick brown fox jumps over the lazy dog.";
    let expected_crypted = [
        0xa4, 0x22, 0x1b, 0xbd, 0x65, 0xac, 0x9b, 0xd6, 0xda, 0x47, 0x2f, 0x1c, 0x4a, 0x93, 0x95,
        0x0d, 0xa1, 0x9e, 0xda, 0xcc, 0xbf, 0x61, 0xcd, 0x8e, 0x2f, 0xeb, 0xb6, 0x0d, 0xf5, 0xb2,
        0xae, 0x33, 0x4c, 0xab, 0xad, 0x4d, 0x74, 0x32, 0x1e, 0x56, 0x7b, 0x0d, 0x0c, 0x47, 0x04,
        0x29, 0xe0, 0xcb, 0xa7, 0x9c, 0x29, 0xa7, 0x9f, 0x61, 0x48, 0x77, 0x7c, 0xd0, 0x00, 0xe3,
        0x1d, 0xaa, 0x6e, 0xb7, 0x1d, 0xfe, 0x23, 0xc5, 0x9a, 0x96, 0xb2, 0xfe, 0x48, 0xc6, 0x2a,
        0x21, 0x20, 0x88, 0x21, 0xec,
    ];

    let crypted = alice.encrypt(msg).unwrap();
    assert_eq!(expected_crypted, crypted.as_slice());

    let decrypted = bob.decrypt(&crypted).unwrap();
    assert_eq!(msg, decrypted.as_slice());

    // Encrypting the same value again should use a different nonce, and thus different ciphertext.
    let expected_crypted2 = [
        0x15, 0xad, 0x06, 0x40, 0x3f, 0x68, 0xfc, 0xed, 0x80, 0x2b, 0x37, 0x09, 0xac, 0x2e, 0x9a,
        0xb5, 0xed, 0x40, 0x91, 0x71, 0xc7, 0xfc, 0x23, 0xc0, 0xc0, 0xad, 0x53, 0x72, 0x97, 0xb7,
        0x00, 0x19, 0x04, 0x2e, 0x73, 0x32, 0x1b, 0xdd, 0x4d, 0x03, 0x8f, 0xe0, 0x23, 0x74, 0x19,
        0x60, 0xfc, 0x82, 0x43, 0x82, 0xda, 0x53, 0x87, 0xd9, 0x3b, 0x42, 0x32, 0x72, 0x7b, 0x89,
        0xfc, 0x86, 0xac, 0x08, 0x9b, 0xc2, 0x95, 0xba, 0x14, 0x3a, 0x86, 0x79, 0x68, 0x44, 0x3b,
        0xe8, 0x54, 0x06, 0x73, 0xda,
    ];
    let crypted = alice.encrypt(msg).unwrap();
    assert_eq!(expected_crypted2, crypted.as_slice());

    let decrypted = bob.decrypt(&crypted).unwrap();
    assert_eq!(msg, decrypted.as_slice());
}
