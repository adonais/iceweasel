/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Noise [Channel][] implementation and XPCOM bindings.

use crate::{
    padding::{pad_into_vec, unpad},
    Error, Result, ALG,
};
#[cfg(feature = "xpcom")]
use nserror::{nsresult, NS_OK};
use nss_rs::{
    aead::{Aead, SequenceNumber, NONCE_LEN},
    Mode, SymKey,
};
#[cfg(feature = "xpcom")]
use std::sync::Mutex;
#[cfg(feature = "xpcom")]
use xpcom::RefPtr;

/// Noise post-handshake transport interface, built with a pair of `CipherState` objects (as
/// [`Aead`]s).
///
/// Messages must be decrypted in the same order that they were encrypted.
///
/// References:
///
/// * [Noise protocol: the `CipherState` object][0]
/// * [Noise protocol: the `SymmetricState` object][1]
///
/// [0]: https://noiseprotocol.org/noise.html#the-cipherstate-object
/// [1]: https://noiseprotocol.org/noise.html#the-symmetricstate-object
#[derive(Default)]
pub struct Channel {
    decrypter: Option<Aead>,
    encrypter: Option<Aead>,

    // `Aead::decrypt` is more like an `Aead::decrypt_with_seq`, it doesn't track nonces for us.
    decrypt_nonce: SequenceNumber,
}

impl Channel {
    /// Create a new transport channel, using a pair of `CipherState`s ([`Aead`]s) initialized
    /// with a pair of [`SymKey`s][SymKey] derived from a Noise handshake.
    ///
    /// The keys must be imported for use with AES-256 GCM
    /// (`Aead::import_key(AeadAlgorithms::Aes256Gcm, key)`).
    pub fn new(decrypt_key: &SymKey, encrypt_key: &SymKey) -> Result<Self> {
        let mut c = Self::default();
        c.initialize_keys(decrypt_key, encrypt_key)?;
        Ok(c)
    }

    /// Create a new transport channel, using a pair of `CipherState`s ([`Aead`]s) initialized
    /// with a pair of keys as raw bytes derived from a Noise handshake.
    pub fn new_with_key_bytes(decrypt_key: &[u8; 32], encrypt_key: &[u8; 32]) -> Result<Self> {
        let mut c = Self::default();
        c.initialize_keys_bytes(decrypt_key, encrypt_key)?;
        Ok(c)
    }

    /// Initialize this channel with a `decrypt_key` and `encrypt_key` (derived from a Noise handshake)
    /// as [`SymKey`][], and reset both nonces to 0.
    ///
    /// The keys must be imported for use with AES-256 GCM
    /// (`Aead::import_key(AeadAlgorithms::Aes256Gcm, key)`).
    pub fn initialize_keys(&mut self, decrypt_key: &SymKey, encrypt_key: &SymKey) -> Result {
        let decrypter = Aead::new(Mode::Decrypt, ALG, decrypt_key, [0; NONCE_LEN])
            .map_err(|_| Error::InvalidArgument)?;
        let encrypter = Aead::new(Mode::Encrypt, ALG, encrypt_key, [0; NONCE_LEN])
            .map_err(|_| Error::InvalidArgument)?;

        self.decrypter = Some(decrypter);
        self.encrypter = Some(encrypter);
        self.decrypt_nonce = 0;
        Ok(())
    }

    /// Initialize this channel with a `decrypt_key` and `encrypt_key` (derived from a Noise handshake)
    /// as raw bytes, and reset both nonces to 0.
    pub fn initialize_keys_bytes(
        &mut self,
        decrypt_key: &[u8; 32],
        encrypt_key: &[u8; 32],
    ) -> Result {
        let decrypt_key = Aead::import_key(ALG, decrypt_key).map_err(|_| Error::InvalidArgument)?;
        let encrypt_key = Aead::import_key(ALG, encrypt_key).map_err(|_| Error::InvalidArgument)?;
        self.initialize_keys(&decrypt_key, &encrypt_key)
    }

    /// Returns `true` if both reader and writer keys are set, allowing this channel to encrypt and
    /// decrypt data.
    pub fn has_keys(&self) -> bool {
        self.decrypter.is_some() && self.encrypter.is_some()
    }

    /// Encrypt `plaintext` using this channel's writer key and nonce, and then increment the writer
    /// nonce.
    ///
    /// Returns an error if the channel is missing keys.
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>> {
        let Some(encrypter) = &mut self.encrypter else {
            // The spec says to return plaintext, but this is dangerous.
            return Err(Error::InvalidState);
        };

        let pt = pad_into_vec(plaintext);
        encrypter.encrypt(&[], &pt).map_err(|_| Error::Internal)
    }

    /// Decrypt `ciphertext` using this channel's reader key and nonce, and then increment the
    /// reader nonce.
    ///
    /// Returns an error if the channel is missing keys, or the data cannot be decrypted.
    pub fn decrypt(&mut self, ciphertext: &[u8]) -> Result<Vec<u8>> {
        if self.decrypt_nonce == SequenceNumber::MAX {
            // Cannot increment nonce anymore.
            return Err(Error::InvalidState);
        }

        let Some(decrypter) = &mut self.decrypter else {
            // The spec says to return ciphertext, but this is dangerous.
            return Err(Error::InvalidState);
        };

        let mut pt = decrypter
            .decrypt(&[], self.decrypt_nonce, ciphertext)
            .map_err(|_| Error::InvalidArgument)?;
        unpad(&mut pt)?;
        self.decrypt_nonce += 1;

        Ok(pt)
    }

    /// Get the current reader nonce. This is only for tests.
    #[inline]
    pub fn decrypt_nonce(&self) -> SequenceNumber {
        self.decrypt_nonce
    }

    /// Set the reader nonce.
    #[inline]
    pub fn set_decrypt_nonce(&mut self, nonce: SequenceNumber) {
        self.decrypt_nonce = nonce
    }
}

#[cfg(feature = "xpcom")]
/// `nsICtapCableChannel`-compatible XPCOM wrapper for [`Channel`][].
#[xpcom(implement(nsICtapCableChannel), atomic)]
pub struct CtapCableChannel {
    inner: Mutex<Channel>,
}

#[cfg(feature = "xpcom")]
/// Implement `nsICtapCableChannel` on a type that dereferences to [`Channel`][].
macro_rules! xpcchannel_impl {
    ($base:ty, $xpc:ty) => {
        impl $xpc {
            fn get_self(&self) -> crate::Result<std::sync::MutexGuard<'_, $base>> {
                self.inner.lock().map_err(|_| crate::Error::Internal)
            }

            xpcom_method!(has_keys => GetHasKeys() -> bool);
            fn has_keys(&self) -> crate::Result<bool> {
                let guard = self.get_self()?;
                Ok(guard.has_keys())
            }

            xpcom_method!(initialize_keys => InitializeKeys(
                aDecryptKey: *const thin_vec::ThinVec<u8>, aEncryptKey: *const thin_vec::ThinVec<u8>));
            fn initialize_keys(&self, decrypt_key: &thin_vec::ThinVec<u8>, encrypt_key: &thin_vec::ThinVec<u8>) -> crate::Result {
                let decrypt_key = decrypt_key
                    .as_slice()
                    .try_into()
                    .map_err(|_| crate::Error::InvalidArgument)?;
                let encrypt_key = encrypt_key
                    .as_slice()
                    .try_into()
                    .map_err(|_| crate::Error::InvalidArgument)?;

                let mut guard = self.get_self()?;
                guard.initialize_keys_bytes(decrypt_key, encrypt_key)?;
                Ok(())
            }

            xpcom_method!(encrypt => Encrypt(aPlainText: *const thin_vec::ThinVec<u8>) -> thin_vec::ThinVec<u8>);
            fn encrypt(&self, plaintext: &thin_vec::ThinVec<u8>) -> crate::Result<thin_vec::ThinVec<u8>> {
                let mut guard = self.get_self()?;
                let ct = guard.encrypt(plaintext)?;
                Ok(thin_vec::ThinVec::from(ct))
            }

            xpcom_method!(decrypt => Decrypt(aCipherText: *const thin_vec::ThinVec<u8>) -> thin_vec::ThinVec<u8>);
            fn decrypt(&self, ciphertext: &thin_vec::ThinVec<u8>) -> crate::Result<thin_vec::ThinVec<u8>> {
                let mut guard = self.get_self()?;
                let ct = guard.decrypt(ciphertext)?;
                Ok(thin_vec::ThinVec::from(ct))
            }
        }
    };
}

#[cfg(feature = "xpcom")]
xpcchannel_impl!(Channel, CtapCableChannel);

#[cfg(feature = "xpcom")]
impl From<Channel> for RefPtr<CtapCableChannel> {
    fn from(value: Channel) -> Self {
        CtapCableChannel::allocate(InitCtapCableChannel {
            inner: Mutex::new(value),
        })
    }
}

#[cfg(feature = "xpcom")]
/// Create a new `nsICtapCableChannel`-compatible [`Channel`][], with no set keys.
#[no_mangle]
pub unsafe extern "C" fn ctap_cable_channel_constructor(
    iid: *const xpcom::nsIID,
    result: *mut *mut xpcom::reexports::libc::c_void,
) -> nserror::nsresult {
    if nss_rs::init().is_err() {
        return nserror::NS_ERROR_FAILURE;
    }

    let channel: RefPtr<CtapCableChannel> = Channel::default().into();
    unsafe { channel.QueryInterface(iid, result) }
}
