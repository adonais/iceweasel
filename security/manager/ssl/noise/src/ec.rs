/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! EC helper functions.

use crate::{Error, Result};
#[cfg(feature = "xpcom")]
use nss_rs::ec::{convert_to_public, EcdhKeypair, EcdhPrivateKey};
use nss_rs::{der, ec::EcdhPublicKey, p11::KeyType_ecKey};

pub const P256_X962_LENGTH: usize = 65;
const P256_X962_DER_LENGTH: usize = SECP256R1_DER_PUBKEY_HEADER.len() + P256_X962_LENGTH;

/// Static DER header for an uncompressed SEC.1 P-256 point in DER format.
// TODO: rewrite with `concat_bytes!` once stable
const SECP256R1_DER_PUBKEY_HEADER: [u8; 26] = [
    // SubjectPublicKeyInfo
    der::TAG_SEQUENCE,
    (24 + P256_X962_LENGTH) as u8,
    // algorithm: AlgorithmIdentifier
    der::TAG_SEQUENCE,
    0x13,
    // algorithm
    der::TAG_OBJECT_ID,
    0x07,
    // OID_EC_PUBLIC_KEY_BYTES
    0x2a,
    0x86,
    0x48,
    0xce,
    0x3d,
    0x02,
    0x01,
    // parameters
    der::TAG_OBJECT_ID,
    0x08,
    // OID_SECP256R1_BYTES
    0x2a,
    0x86,
    0x48,
    0xce,
    0x3d,
    0x03,
    0x01,
    0x07,
    // subjectPublicKey
    der::TAG_BIT_STRING,
    (P256_X962_LENGTH + 1) as u8,
    0x00,
];

/// Static DER octet string header for an uncompressed key returned by `key_data_alt`.
const SECP256R1_DER_ALT_BYTES: [u8; 3] = [der::TAG_OCTET_STRING, P256_X962_LENGTH as u8, 4];
const P256_X962_DER_ALT_LENGTH: usize = P256_X962_LENGTH + 2;

pub const P256_X962_COMPRESSED_LENGTH: usize = 33;

#[cfg(feature = "xpcom")]
/// Convert an [`EcdhPrivateKey`] into an [`EcdhKeypair`].
pub fn convert_to_keypair(private: EcdhPrivateKey) -> Result<EcdhKeypair> {
    let public = convert_to_public(&private)?;
    Ok(EcdhKeypair { private, public })
}

/// Convert an uncompressed SEC.1 P-256 point into DER format for NSS.
pub fn sec1_ec2_key_to_der(key: &[u8; P256_X962_LENGTH]) -> Result<Vec<u8>> {
    if key[0] != 0x04 {
        // incorrect format
        return Err(Error::InvalidArgument);
    }

    let mut o = Vec::with_capacity(P256_X962_DER_LENGTH);
    o.extend_from_slice(&SECP256R1_DER_PUBKEY_HEADER);
    o.extend_from_slice(key);

    Ok(o)
}

/// Convert a P-256 [`EcdhPublicKey`] to uncompressed SEC.1 bytes.
///
/// This returns [`P256_X962_LENGTH`] bytes.
pub fn ec2_pubkey_to_uncompressed_sec1(key: &EcdhPublicKey) -> Result<[u8; P256_X962_LENGTH]> {
    // TODO: Replace with a proper API https://github.com/mozilla/nss-rs/issues/140 / Bug 2070803
    //
    // `key_data()` returns the original form the key was imported in,
    // `key_data_alt()` always returns uncompressed: https://github.com/mozilla/nss-rs/issues/136
    //
    // ...but if you import a private key, and then `convert_to_public()` (as we do with
    // `newQrInitiatedInitiatorHandshake`), `key_data_alt()` fails with
    // `SEC_ERROR_UNKNOWN_OBJECT_TYPE`: https://github.com/mozilla/nss-rs/issues/139
    //
    // `key_data()` works for any key from `convert_to_public()`, because they're uncompressed.
    let ptr = unsafe { key.as_ref() }.ok_or(Error::InvalidArgument)?;
    // key_data() allows ecKey and ecMontKey, because these are valid for HPKE.
    if ptr.keyType != KeyType_ecKey {
        return Err(Error::InvalidArgument);
    }

    if let Ok(pub_bytes) = key.key_data() {
        if pub_bytes.len() == P256_X962_LENGTH && pub_bytes[0] == 4 {
            // Already in uncompressed form.
            return pub_bytes.try_into().map_err(|_| Error::Internal);
        } else if pub_bytes.len() != P256_X962_COMPRESSED_LENGTH
            || pub_bytes.is_empty()
            || (pub_bytes[0] != 2 && pub_bytes[0] != 3)
        {
            // Other key type that is not the compressed form.
            return Err(Error::InvalidArgument);
        }
    }

    // `key_data()` returned a compressed P-256 key. We want uncompressed.
    let pub_bytes = key.key_data_alt()?;
    if pub_bytes.len() != P256_X962_DER_ALT_LENGTH || pub_bytes[..3] != SECP256R1_DER_ALT_BYTES {
        // Other key type that is not the uncompressed form.
        return Err(Error::InvalidArgument);
    }

    // Uncompressed SEC.1 bytes wrapped in a DER octet string.
    pub_bytes[2..].try_into().map_err(|_| Error::Internal)
}
