/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Noise responder handshake

use crate::{
    ec::{ec2_pubkey_to_uncompressed_sec1, sec1_ec2_key_to_der, P256_X962_LENGTH},
    handshake::{HandshakeType, TAG_LEN},
    Channel, Error, Result, SymmetricState,
};
#[cfg(feature = "xpcom")]
use nserror::{nsresult, NS_OK};
use nss_rs::{
    aead::Mode,
    ec::{ecdh, ecdh_keygen, import_ec_public_key_from_spki, EcCurve, EcdhKeypair},
    PublicKey,
};
use sha2::{digest, Sha256};
use std::ops::{Deref, DerefMut};
#[cfg(feature = "xpcom")]
use std::sync::Mutex;
#[cfg(feature = "xpcom")]
use thin_vec::ThinVec;
#[cfg(feature = "xpcom")]
use xpcom::RefPtr;

/// Noise handshake responder
///
/// This only implements [Noise `KNpsk0` and `NKpsk0` handshakes][1].
///
/// [1]: https://noiseprotocol.org/noise.html#pre-shared-symmetric-keys
pub struct Responder {
    /// [`Channel`] for post-handshake communication.
    pub channel: Channel,

    /// [Noise handshake hash][SymmetricState::get_handshake_hash].
    pub handshake_hash: digest::Output<Sha256>,

    /// Response message [to send to the initiator][0].
    ///
    /// [0]: super::initiator::InitiatorHandshake::process_handshake_response
    pub response_message: [u8; Responder::RESPONSE_LENGTH],
}

impl Responder {
    pub const RESPONSE_LENGTH: usize = P256_X962_LENGTH + TAG_LEN;

    /// Complete a caBLE [QR-initiated handshake][0] (`KNpsk0`) as the responding party
    /// (authenticator).
    ///
    /// # Arguments
    ///
    /// * `psk`: pre-shared key, negotiated out-of-band
    /// * `peer_pub`: remote peer's public key
    /// * `message`: [initial message from the initiator][Self::initial_handshake_message]. Must be
    ///   at least [`P256_X962_LENGTH`] bytes.
    ///
    /// [0]: https://fidoalliance.org/specs/fido-v2.3-ps-20260226/fido-client-to-authenticator-protocol-v2.3-ps-20260226.html#hybrid-qr-initiated
    pub fn new_qr_initiated(
        psk: &[u8; 32],
        peer_identity: &PublicKey,
        message: &[u8],
    ) -> Result<Self> {
        let peer_bytes = ec2_pubkey_to_uncompressed_sec1(peer_identity)?;
        let mut ss = SymmetricState::initialize_symmetric(HandshakeType::KNpsk0);
        ss.mix_hash(&[1]);
        ss.mix_hash(&peer_bytes);

        Self::new(ss, psk, None, Some(peer_identity), message)
    }

    /// Complete a caBLE [state-assisted transaction][0] (`NKpsk0`) as the responding party
    /// (authenticator).
    ///
    /// # Arguments
    ///
    /// * `psk`: pre-shared key, negotiated out-of-band
    /// * `local_identity`: local keypair
    /// * `message`: [initial message from the initiator][Self::initial_handshake_message]. Must be
    ///   at least [`P256_X962_LENGTH`] bytes.
    ///
    /// [0]: https://fidoalliance.org/specs/fido-v2.3-ps-20260226/fido-client-to-authenticator-protocol-v2.3-ps-20260226.html#hybrid-state-assisted
    pub fn new_state_assisted(
        psk: &[u8; 32],
        local_identity: EcdhKeypair,
        message: &[u8],
    ) -> Result<Self> {
        let mut ss = SymmetricState::initialize_symmetric(HandshakeType::NKpsk0);
        ss.mix_hash(&[0]);
        ss.mix_hash(&ec2_pubkey_to_uncompressed_sec1(&local_identity.public)?);

        Self::new(ss, psk, Some(local_identity), None, message)
    }

    fn new(
        mut ss: SymmetricState,
        psk: &[u8; 32],
        local_identity: Option<EcdhKeypair>,
        peer_identity: Option<&PublicKey>,
        message: &[u8],
    ) -> Result<Self> {
        if local_identity.is_some() == peer_identity.is_some() {
            return Err(Error::InvalidArgument);
        }
        let Some((peer_point_bytes, ct)) = message.split_at_checked(P256_X962_LENGTH) else {
            return Err(Error::InvalidArgument);
        };
        if ct.len() != TAG_LEN {
            return Err(Error::InvalidArgument);
        }

        let peer_key_der = sec1_ec2_key_to_der(
            peer_point_bytes
                .try_into()
                .map_err(|_| Error::InvalidArgument)?,
        )?;
        let peer_key = import_ec_public_key_from_spki(&peer_key_der)?;

        ss.mix_key_and_hash(psk, Mode::Decrypt)?;
        ss.mix_hash(peer_point_bytes);
        ss.mix_key(peer_point_bytes, Mode::Decrypt)?;

        if let Some(local_identity) = local_identity {
            let es_key = ecdh(&local_identity.private, &peer_key)?;
            ss.mix_key(&es_key, Mode::Decrypt)?;
        }

        let pt = ss.decrypt_and_hash(ct)?;
        if !pt.is_empty() {
            return Err(Error::InvalidArgument);
        }

        let ephemeral_key = ecdh_keygen(&EcCurve::P256)?;
        let ephemeral_key_bytes = ec2_pubkey_to_uncompressed_sec1(&ephemeral_key.public)?;

        ss.mix_hash(&ephemeral_key_bytes);
        ss.mix_key(&ephemeral_key_bytes, Mode::Encrypt)?;

        let shared_key_ee = ecdh(&ephemeral_key.private, &peer_key)?;
        ss.mix_key(&shared_key_ee, Mode::Encrypt)?;

        if let Some(peer_identity) = peer_identity {
            let shared_key_se = ecdh(&ephemeral_key.private, peer_identity)?;
            ss.mix_key(&shared_key_se, Mode::Encrypt)?;
        }

        let ct = ss.encrypt_and_hash(&[])?;
        if ct.len() != TAG_LEN {
            return Err(Error::Internal);
        }

        let mut response_message = [0; Self::RESPONSE_LENGTH];
        response_message[..P256_X962_LENGTH].copy_from_slice(&ephemeral_key_bytes);
        response_message[P256_X962_LENGTH..].copy_from_slice(&ct);

        Ok(Self {
            channel: ss.split(false)?,
            handshake_hash: *ss.get_handshake_hash(),
            response_message,
        })
    }
}

impl Deref for Responder {
    type Target = Channel;

    fn deref(&self) -> &Self::Target {
        &self.channel
    }
}

impl DerefMut for Responder {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.channel
    }
}

#[cfg(feature = "xpcom")]
/// `nsICtapCableResponder`-compatible XPCOM wrapper for [`Responder`][].
#[xpcom(implement(nsICtapCableResponder), atomic)]
pub struct CtapCableResponder {
    inner: Mutex<Responder>,
}

#[cfg(feature = "xpcom")]
impl From<Responder> for RefPtr<CtapCableResponder> {
    fn from(value: Responder) -> Self {
        CtapCableResponder::allocate(InitCtapCableResponder {
            inner: Mutex::new(value),
        })
    }
}

#[cfg(feature = "xpcom")]
xpcchannel_impl!(Responder, CtapCableResponder);

#[cfg(feature = "xpcom")]
impl CtapCableResponder {
    xpcom_method!(get_handshake_hash => GetHandshakeHash() -> ThinVec<u8>);
    fn get_handshake_hash(&self) -> Result<ThinVec<u8>> {
        let guard: std::sync::MutexGuard<'_, Responder> = self.get_self()?;
        Ok(ThinVec::from(guard.handshake_hash.as_slice()))
    }

    xpcom_method!(get_response_message => GetResponseMessage() -> ThinVec<u8>);
    fn get_response_message(&self) -> Result<ThinVec<u8>> {
        let guard = self.get_self()?;
        Ok(ThinVec::from(guard.response_message.as_slice()))
    }
}
