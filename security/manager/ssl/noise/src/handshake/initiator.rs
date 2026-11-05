/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Noise initiator handshake

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
use std::sync::{Mutex, MutexGuard};
#[cfg(feature = "xpcom")]
use thin_vec::ThinVec;
#[cfg(feature = "xpcom")]
use xpcom::{interfaces::nsICtapCableInitiator, RefPtr};

/// Noise initiator channel, after the handshake has completed.
pub struct Initiator {
    /// [`Channel`] for post-handshake communication with the responder.
    pub channel: Channel,

    /// [Noise handshake hash][SymmetricState::get_handshake_hash].
    pub handshake_hash: digest::Output<Sha256>,
}

/// [Noise `HandshakeState`][0] object for the initiator.
///
/// This only implements Noise `KNpsk0` and `NKpsk0` handshakes,
/// [which follow a different process][1].
///
/// [0]: https://noiseprotocol.org/noise.html#the-handshakestate-object
/// [1]: https://noiseprotocol.org/noise.html#pre-shared-symmetric-keys
pub struct InitiatorHandshake {
    ss: SymmetricState,
    local_identity: Option<EcdhKeypair>,
    ephemeral_key: EcdhKeypair,
    initial_message: [u8; InitiatorHandshake::INITIAL_MESSAGE_LENGTH],
}

impl InitiatorHandshake {
    pub const INITIAL_MESSAGE_LENGTH: usize = P256_X962_LENGTH + TAG_LEN;

    /// Initial message to [send to the responder][super::Responder::build].
    #[must_use]
    pub fn initial_message(&self) -> &[u8; Self::INITIAL_MESSAGE_LENGTH] {
        &self.initial_message
    }

    /// Start a caBLE [QR-initiated handshake][0] (`KNpsk0`) as the initiating party.
    ///
    /// # Arguments
    ///
    /// * `psk`: pre-shared key, negotiated out-of-band
    /// * `local_identity`: local keypair
    ///
    /// [0]: https://fidoalliance.org/specs/fido-v2.3-ps-20260226/fido-client-to-authenticator-protocol-v2.3-ps-20260226.html#hybrid-qr-initiated
    pub fn new_qr_initiated(psk: &[u8; 32], local_identity: EcdhKeypair) -> Result<Self> {
        let local_pub = ec2_pubkey_to_uncompressed_sec1(&local_identity.public)?;

        let mut ss = SymmetricState::initialize_symmetric(HandshakeType::KNpsk0);
        ss.mix_hash(&[1]);
        ss.mix_hash(&local_pub);

        Self::new(ss, psk, Some(local_identity), None)
    }

    /// Start a caBLE [state-assisted handshake][0] (`NKpsk0`) as the initiating party.
    ///
    /// # Arguments
    ///
    /// * `psk`: pre-shared key, negotiated out-of-band
    /// * `peer_identity`: remote peer's public key
    ///
    /// [0]: https://fidoalliance.org/specs/fido-v2.3-ps-20260226/fido-client-to-authenticator-protocol-v2.3-ps-20260226.html#hybrid-state-assisted
    pub fn new_state_assisted(
        psk: &[u8; 32],
        peer_identity: &[u8; P256_X962_LENGTH],
    ) -> Result<Self> {
        let peer_der = sec1_ec2_key_to_der(peer_identity)?;
        let peer_key = import_ec_public_key_from_spki(&peer_der)?;

        let mut ss = SymmetricState::initialize_symmetric(HandshakeType::NKpsk0);
        ss.mix_hash(&[0]);
        ss.mix_hash(peer_identity);

        Self::new(ss, psk, None, Some(&peer_key))
    }

    fn new(
        mut ss: SymmetricState,
        psk: &[u8; 32],
        local_identity: Option<EcdhKeypair>,
        peer_identity: Option<&PublicKey>,
    ) -> Result<Self> {
        if local_identity.is_some() == peer_identity.is_some() {
            return Err(Error::InvalidArgument);
        }
        ss.mix_key_and_hash(psk, Mode::Encrypt)?;

        let ephemeral_key = ecdh_keygen(&EcCurve::P256)?;
        let ephemeral_key_bytes: [u8; P256_X962_LENGTH] =
            ec2_pubkey_to_uncompressed_sec1(&ephemeral_key.public)?;

        ss.mix_hash(&ephemeral_key_bytes);
        ss.mix_key(&ephemeral_key_bytes, Mode::Encrypt)?;

        if let Some(peer_identity) = peer_identity {
            ss.mix_key(&ecdh(&ephemeral_key.private, peer_identity)?, Mode::Encrypt)?;
        }

        let ct = ss.encrypt_and_hash(&[])?;
        if ct.len() != TAG_LEN {
            return Err(Error::Internal);
        }

        let mut initial_message = [0; Self::INITIAL_MESSAGE_LENGTH];
        initial_message[..P256_X962_LENGTH].copy_from_slice(&ephemeral_key_bytes);
        initial_message[P256_X962_LENGTH..].copy_from_slice(&ct);

        Ok(Self {
            ss,
            local_identity,
            ephemeral_key,
            initial_message,
        })
    }

    /// Respond to an authenticator as an initiator.
    ///
    /// # Arguments
    ///
    /// * `peer_response_message`: [the remote peer's handshake message][Self::build_responder].
    ///   Must be at least [`P256_X962_LENGTH`] bytes.
    ///
    /// # Return value
    ///
    /// A [`Channel`] for further communication, and the handshake hash.
    pub fn process_handshake_response(mut self, peer_response_message: &[u8]) -> Result<Initiator> {
        let Some((peer_point_bytes, ct)) = peer_response_message.split_at_checked(P256_X962_LENGTH)
        else {
            return Err(Error::InvalidArgument);
        };
        if ct.len() != TAG_LEN {
            return Err(Error::InvalidArgument);
        }

        let peer_key_der =
            sec1_ec2_key_to_der(peer_point_bytes.try_into().map_err(|_| Error::Internal)?)?;
        let peer_key = import_ec_public_key_from_spki(&peer_key_der)?;

        self.ss.mix_hash(peer_point_bytes);
        self.ss.mix_key(peer_point_bytes, Mode::Decrypt)?;
        self.ss.mix_key(
            &ecdh(&self.ephemeral_key.private, &peer_key)?,
            Mode::Decrypt,
        )?;

        if let Some(local_identity) = &self.local_identity {
            self.ss
                .mix_key(&ecdh(&local_identity.private, &peer_key)?, Mode::Decrypt)?;
        }

        let pt = self.ss.decrypt_and_hash(ct)?;
        if !pt.is_empty() {
            return Err(Error::InvalidArgument);
        }

        Ok(Initiator {
            channel: self.ss.split(true)?,
            handshake_hash: *self.ss.get_handshake_hash(),
        })
    }
}

impl Deref for Initiator {
    type Target = Channel;

    fn deref(&self) -> &Self::Target {
        &self.channel
    }
}

impl DerefMut for Initiator {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.channel
    }
}

#[cfg(feature = "xpcom")]
/// `nsICtapCableInitiator`-compatible XPCOM wrapper for [`Initiator`][].
#[xpcom(implement(nsICtapCableInitiator), atomic)]
struct CtapCableInitiator {
    inner: Mutex<Initiator>,
}

#[cfg(feature = "xpcom")]
impl From<Initiator> for RefPtr<CtapCableInitiator> {
    fn from(value: Initiator) -> Self {
        CtapCableInitiator::allocate(InitCtapCableInitiator {
            inner: Mutex::new(value),
        })
    }
}

#[cfg(feature = "xpcom")]
xpcchannel_impl!(Initiator, CtapCableInitiator);

#[cfg(feature = "xpcom")]
impl CtapCableInitiator {
    xpcom_method!(get_handshake_hash => GetHandshakeHash() -> ThinVec<u8>);
    fn get_handshake_hash(&self) -> Result<ThinVec<u8>> {
        let guard = self.get_self()?;
        Ok(ThinVec::from(guard.handshake_hash.as_slice()))
    }
}

#[cfg(feature = "xpcom")]
/// `nsICtapCableInitiatorHandshake`-compatible XPCOM wrapper for [`InitiatorHandshake`][].
///
/// This can only be used once, after which point it is "consumed".
#[xpcom(implement(nsICtapCableInitiatorHandshake), atomic)]
pub struct CtapCableInitiatorHandshake {
    inner: Mutex<Option<InitiatorHandshake>>,
}

#[cfg(feature = "xpcom")]
impl CtapCableInitiatorHandshake {
    fn get_self(&self) -> Result<MutexGuard<'_, Option<InitiatorHandshake>>> {
        self.inner.lock().map_err(|_| Error::Internal)
    }

    xpcom_method!(is_consumed => GetConsumed() -> bool);
    fn is_consumed(&self) -> Result<bool> {
        let guard = self.get_self()?;
        Ok(guard.is_none())
    }

    xpcom_method!(get_initial_message => GetInitialMessage() -> ThinVec<u8>);
    fn get_initial_message(&self) -> Result<ThinVec<u8>> {
        let guard = self.get_self()?;
        guard
            .as_ref()
            .map(|h| ThinVec::from(h.initial_message().as_slice()))
            .ok_or(Error::InvalidState)
    }

    xpcom_method!(process_handshake_response => ProcessHandshakeResponse(
        aResponseMessage: *const ThinVec<u8>) -> *const nsICtapCableInitiator);
    fn process_handshake_response(
        &self,
        response_message: &ThinVec<u8>,
    ) -> Result<RefPtr<nsICtapCableInitiator>> {
        let mut guard = self.get_self()?;
        let guard = guard.take().ok_or(Error::InvalidState)?;
        let initiator = guard.process_handshake_response(response_message)?;

        let initiator: RefPtr<CtapCableInitiator> = initiator.into();
        let initiator = initiator
            .query_interface::<nsICtapCableInitiator>()
            .ok_or(Error::Internal)?;

        Ok(initiator)
    }
}

#[cfg(feature = "xpcom")]
impl From<InitiatorHandshake> for RefPtr<CtapCableInitiatorHandshake> {
    fn from(value: InitiatorHandshake) -> Self {
        CtapCableInitiatorHandshake::allocate(InitCtapCableInitiatorHandshake {
            inner: Mutex::new(Some(value)),
        })
    }
}
