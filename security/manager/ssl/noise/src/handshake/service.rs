/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Noise XPCOM handshake service

use crate::{
    ec::convert_to_keypair,
    handshake::{initiator::CtapCableInitiatorHandshake, responder::CtapCableResponder},
    Error, InitiatorHandshake, Responder, Result,
};
use nserror::{nsresult, NS_OK};
use nss_rs::ec::import_ec_private_key_pkcs8;
use thin_vec::ThinVec;
use xpcom::{
    interfaces::{nsICtapCableInitiatorHandshake, nsICtapCableResponder},
    RefPtr,
};

/// Singleton for accessing [HandshakeState] methods
#[xpcom(implement(nsICtapCableHandshakeService), atomic)]
struct CtapCableHandshakeService {}

impl CtapCableHandshakeService {
    xpcom_method!(new_qr_initiated_initiator_handshake => NewQrInitiatedInitiatorHandshake(
        aPsk: *const ThinVec<u8>,
        aLocalIdentity: *const ThinVec<u8>
    ) -> *const nsICtapCableInitiatorHandshake);
    fn new_qr_initiated_initiator_handshake(
        &self,
        psk: &ThinVec<u8>,
        local_identity: &ThinVec<u8>,
    ) -> Result<RefPtr<nsICtapCableInitiatorHandshake>> {
        let psk: &[u8; 32] = psk
            .as_slice()
            .try_into()
            .map_err(|_| Error::InvalidArgument)?;

        // If local_identity is on the wrong curve, initial_handshake_message() will fail.
        let private =
            import_ec_private_key_pkcs8(local_identity).map_err(|_| Error::InvalidArgument)?;
        let local_identity = convert_to_keypair(private).map_err(|_| Error::InvalidArgument)?;

        let handshake = InitiatorHandshake::new_qr_initiated(psk, local_identity)?;

        let handshake: RefPtr<CtapCableInitiatorHandshake> = handshake.into();
        let handshake = handshake
            .query_interface::<nsICtapCableInitiatorHandshake>()
            .ok_or(Error::Internal)?;

        Ok(handshake)
    }

    xpcom_method!(new_qr_initiated_responder => NewQrInitiatedResponder(
        aPsk: *const ThinVec<u8>,
        aPeerPubKey: *const ThinVec<u8>,
        aInitialMessage: *const ThinVec<u8>
    ) -> *const nsICtapCableResponder);
    fn new_qr_initiated_responder(
        &self,
        psk: &ThinVec<u8>,
        peer_pub_key: &ThinVec<u8>,
        initial_message: &ThinVec<u8>,
    ) -> Result<RefPtr<nsICtapCableResponder>> {
        let psk = psk
            .as_slice()
            .try_into()
            .map_err(|_| Error::InvalidArgument)?;
        let peer_pub_key = peer_pub_key
            .as_slice()
            .try_into()
            .map_err(|_| Error::InvalidArgument)?;

        let responder = Responder::new_qr_initiated(psk, peer_pub_key, initial_message)?;
        let responder: RefPtr<CtapCableResponder> = responder.into();
        let responder = responder
            .query_interface::<nsICtapCableResponder>()
            .ok_or(Error::Internal)?;

        Ok(responder)
    }
}

/// Create a [CtapCableHandshakeService]-based `nsICtapCableHandshakeService`.
#[no_mangle]
pub unsafe extern "C" fn ctap_cable_handshake_service_constructor(
    iid: *const xpcom::nsIID,
    result: *mut *mut xpcom::reexports::libc::c_void,
) -> nserror::nsresult {
    let channel: RefPtr<CtapCableHandshakeService> =
        CtapCableHandshakeService::allocate(InitCtapCableHandshakeService {});
    unsafe { channel.QueryInterface(iid, result) }
}
