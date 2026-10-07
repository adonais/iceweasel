/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Noise hash functions
//!
//! <https://noiseprotocol.org/noise.html#hash-functions>

use crate::{handshake::HandshakeType, Error, Result};
use nss_rs::hkdf::{Hkdf, HkdfAlgorithm};
use sha2::Digest;
pub use sha2::Sha256;

/// [Noise Hash trait][0].
///
/// This is a wrapper for RustCrypto's [`Digest`] trait, but uses NSS for HKDF operations.
/// RustCrypto provides richer type information than `nss-rs` (so we can avoid `Vec<u8>`), and can
/// hash data incrementally.
///
/// This currently only supports SHA256.
///
/// [0]: https://noiseprotocol.org/noise.html#hash-functions
pub trait Hash: Digest {
    /// NSS HKDF algorithm for the hash.
    const HKDF_ALGORITHM: HkdfAlgorithm;

    /// A constant specifying the size in bytes of the hash output. Must be either 32 or 64 bytes.
    fn hash_len() -> usize {
        <Self as Digest>::output_size()
    }

    /// Get a Noise protocol name identifier for the handshake. This always uses
    /// `P256_AESGCM_SHA256`, as it is the only construction used by caBLE.
    fn protocol_name(ht: HandshakeType) -> &'static [u8];

    /// Noise version of `HKDF(chaining_key, ikm, num_outputs)`.
    ///
    /// `num_outputs` is the number of keys (outputs) to derive.
    ///
    /// Returns a buffer of `Hash::HASHLEN * num_outputs` bytes.
    fn hkdf(salt: &[u8], ikm: &[u8], num_outputs: usize) -> Result<Vec<u8>> {
        let len = num_outputs * Self::hash_len();
        Self::hkdf_bytes(salt, ikm, &[], len)
    }

    /// Derive `len` bytes of key material using HKDF.
    ///
    /// Returns a buffer of `len` bytes.
    fn hkdf_bytes(salt: &[u8], ikm: &[u8], info: &[u8], len: usize) -> Result<Vec<u8>> {
        let hkdf = Hkdf::new(Self::HKDF_ALGORITHM);
        let ikm = hkdf.import_secret(ikm)?;
        let prk = hkdf.extract(salt, &ikm)?;
        let r = hkdf.expand_data(&prk, info, len)?;

        if r.len() != len {
            Err(Error::Internal)
        } else {
            Ok(r)
        }
    }
}

impl Hash for Sha256 {
    const HKDF_ALGORITHM: HkdfAlgorithm = HkdfAlgorithm::HKDF_SHA2_256;

    fn protocol_name(ht: HandshakeType) -> &'static [u8] {
        match ht {
            HandshakeType::KNpsk0 => b"Noise_KNpsk0_P256_AESGCM_SHA256",
            HandshakeType::NKpsk0 => b"Noise_NKpsk0_P256_AESGCM_SHA256",
        }
    }
}
