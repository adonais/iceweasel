/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::{handshake::HandshakeType, hash::Hash, Channel, Error, Result, ALG};
use nss_rs::{
    aead::{Aead, SequenceNumber},
    Mode,
};
use sha2::{digest, Digest, Sha256};

/// [Noise `SymmetricState`][0] object.
///
/// [0]: https://noiseprotocol.org/noise.html#the-symmetric-object
#[derive(Default)]
pub struct SymmetricState {
    /// Cipher key (`CipherState.k`)
    k: Option<Aead>,

    /// Nonce (`CipherState.n`)
    n: SequenceNumber,

    /// Chaining key (`SymmetricState.ck`)
    ck: digest::Output<Sha256>,

    /// Hash output (`SymmetricState.h`)
    h: digest::Output<Sha256>,
}

impl SymmetricState {
    /// Creates a new [`SymmetricState`][] for a given `protocol`.
    pub fn initialize_symmetric(protocol: HandshakeType) -> Self {
        let name = Sha256::protocol_name(protocol);
        let h = if name.len() <= Sha256::hash_len() {
            // If protocol_name is less than or equal to Sha256LEN bytes in length, sets h equal to
            // protocol_name with zero bytes appended to make Sha256LEN bytes.
            let mut h: digest::Output<Sha256> = Default::default();
            h[..name.len()].copy_from_slice(name);
            h
        } else {
            // Otherwise sets h = Sha256(protocol_name).
            Sha256::digest(name)
        };

        Self {
            k: None,
            n: 0,
            ck: h,
            h,
        }
    }

    /// Sets `k = key`, `n = 0` (`CipherState.InitializeKey`)
    ///
    /// This takes an additional `mode` parameter, which sets the usage of the [`Aead`] key.
    fn initialize_key(&mut self, key: &[u8; 32], mode: Mode) -> Result {
        let key = Aead::import_key(ALG, key)?;
        self.k = Some(Aead::new(mode, ALG, &key, [0; 12])?);
        self.n = 0;
        Ok(())
    }

    /// Executes the following steps:
    ///
    /// * Sets [`ck, temp_k = HKDF(ck, input_key_material, 2)`][Hash::hkdf].
    /// * If `HASHLEN` is 64, then truncates `temp_k` to 32 bytes.
    /// * Calls [`InitializeKey(temp_k)`][Self::initialize_key].
    pub fn mix_key(&mut self, ikm: &[u8], mode: Mode) -> Result {
        let temp = Sha256::hkdf(&self.ck, ikm, 2)?;
        let (ck, temp_k) = temp.split_at(Sha256::hash_len());
        self.initialize_key(&temp_k[..32].try_into().map_err(|_| Error::Internal)?, mode)?;
        self.ck.copy_from_slice(ck);
        Ok(())
    }

    /// Sets `h = Sha256(h || data)`.
    pub fn mix_hash(&mut self, data: &[u8]) {
        let mut hasher = Sha256::new();
        hasher.update(self.h);
        hasher.update(data);
        self.h = hasher.finalize();
    }

    /// This function is used for handling pre-shared symmetric keys, as described in
    /// [Section 9][0]. It executes the following steps:
    ///
    /// * Sets [`ck, temp_h, temp_k = HKDF(ck, input_key_material, 3)`][Hash::hkdf].
    /// * Calls [`MixHash(temp_h)`][Self::mix_hash].
    /// * If `HASHLEN` is 64, then truncates `temp_k` to 32 bytes.
    /// * Calls [`InitializeKey(temp_k)`][Self::initialize_key].
    ///
    /// [0]: https://noiseprotocol.org/noise.html#pre-shared-symmetric-keys
    pub fn mix_key_and_hash(&mut self, ikm: &[u8], mode: Mode) -> Result {
        let temp = Sha256::hkdf(&self.ck, ikm, 3)?;
        let (ck, temp) = temp.split_at(Sha256::hash_len());
        let (temp_h, temp_k) = temp.split_at(Sha256::hash_len());
        self.initialize_key(&temp_k[..32].try_into().map_err(|_| Error::Internal)?, mode)?;
        self.ck.copy_from_slice(ck);
        self.mix_hash(temp_h);
        Ok(())
    }

    /// Returns `h`.
    ///
    /// This function should only be called at the end of a handshake, i.e. after the
    /// [`Split()`][Self::split] function has been called.
    ///
    /// This function is used for channel binding, as described in [Section 11.2][0].
    ///
    /// [0]: https://noiseprotocol.org/noise.html#channel-binding
    pub fn get_handshake_hash(&self) -> &digest::Output<Sha256> {
        &self.h
    }

    /// Sets `ciphertext = EncryptWithAd(h, plaintext)`, calls
    /// [`MixHash(ciphertext)`][Self::mix_hash], and returns `ciphertext`.
    ///
    /// **Unlike** the Noise specification, this returns an error if `k` is empty, to prevent
    /// unintentional leakage of plaintext.
    ///
    /// # Panics
    ///
    /// If the last call to [`mix_key()`][] or [`mix_key_and_hash()`][] did not use
    /// [`Mode::Encrypt`]: <https://github.com/mozilla/nss-rs/issues/128>
    ///
    /// [`mix_key()`]: Self::mix_key
    /// [`mix_key_and_hash()`]: Self::mix_key_and_hash
    pub fn encrypt_and_hash(&mut self, pt: &[u8]) -> Result<Vec<u8>> {
        if self.n == SequenceNumber::MAX {
            return Err(Error::InvalidState);
        }

        let Some(cs) = &mut self.k else {
            return Err(Error::InvalidState);
        };

        let ct = cs.encrypt_with_seq(&self.h, self.n, pt)?;
        self.n += 1;
        self.mix_hash(&ct);
        Ok(ct)
    }

    /// Sets `plaintext = DecryptWithAd(h, plaintext)`, calls
    /// [`MixHash(ciphertext)`][Self::mix_hash], and returns `plaintext`.
    ///
    /// **Unlike** the Noise specification, this returns an error if `k` is empty, to prevent
    /// unintentional usage of unencrypted and unauthenticated data.
    ///
    /// # Panics
    ///
    /// If the last call to [`mix_key()`][Self::mix_key] or
    /// [`mix_key_and_hash()`][Self::mix_key_and_hash] did not use [`Mode::Decrypt`]:
    /// <https://github.com/mozilla/nss-rs/issues/128>
    pub fn decrypt_and_hash(&mut self, ct: &[u8]) -> Result<Vec<u8>> {
        if self.n == SequenceNumber::MAX {
            return Err(Error::InvalidState);
        }

        let Some(cs) = &mut self.k else {
            return Err(Error::InvalidState);
        };

        let pt = cs.decrypt(&self.h, self.n, ct)?;
        self.n += 1;
        self.mix_hash(ct);
        Ok(pt)
    }

    /// Return a [`Channel`] for encrypting post-handshake transport messages.
    ///
    /// This is equivalent to [`SymmetricState.Split()`][0].
    ///
    /// # Arguments
    ///
    /// * `initiator`: `true` if the caller is the initating party, `false` if it is the responder.
    ///
    ///   The initiator's [Channel] uses `temp_k2` as its decryption key and `temp_k1` as its
    ///   encryption key. The responder's [Channel] swaps these.
    ///
    /// [0]: https://noiseprotocol.org/noise.html#the-symmetricstate-object
    pub fn split(&self, initiator: bool) -> Result<Channel> {
        let temp = Sha256::hkdf(&self.ck, &[], 2)?;
        let (temp_k1, temp_k2) = temp.split_at(Sha256::hash_len());
        let temp_k1 = temp_k1[..32].try_into().map_err(|_| Error::Internal)?;
        let temp_k2 = temp_k2[..32].try_into().map_err(|_| Error::Internal)?;

        if initiator {
            Channel::new_with_key_bytes(temp_k2, temp_k1)
        } else {
            Channel::new_with_key_bytes(temp_k1, temp_k2)
        }
    }
}
