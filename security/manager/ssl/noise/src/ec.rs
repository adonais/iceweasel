/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! EC helper functions.

use crate::{Error, Result};
use nss_rs::der;
#[cfg(feature = "xpcom")]
use nss_rs::ec::{convert_to_public, EcdhKeypair, EcdhPrivateKey};

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
