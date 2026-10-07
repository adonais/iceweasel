/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Noise handshake tests.

use noise::*;
use nss_rs::ec::{ecdh_keygen, EcCurve};

/// Test KNpsk0 flow (QR-initiated transaction)
#[test]
fn qr_initiated() {
    nss_rs::init().expect("nss_rs::init");

    let initiator_identity = ecdh_keygen(&EcCurve::P256).expect("initiator_identity");
    let initiator_pub = initiator_identity.public.key_data().expect("initiator_pub");
    assert_eq!(65, initiator_pub.len());
    assert_eq!(4, initiator_pub[0]);
    let psk = nss_rs::random();

    let initiator_hs = InitiatorHandshake::new_qr_initiated(&psk, initiator_identity)
        .expect("initial_handshake_message");

    let mut responder = Responder::new_qr_initiated(
        &psk,
        initiator_pub.as_slice().try_into().unwrap(),
        initiator_hs.initial_message(),
    )
    .expect("build_responder");

    let mut initiator = initiator_hs
        .process_handshake_response(&responder.response_message)
        .expect("process_handshake_response");

    assert_eq!(responder.handshake_hash, initiator.handshake_hash);

    // responder -> initiator
    let msg = b"Hi initiator!";
    let ct = responder.encrypt(msg).unwrap();
    assert_ne!(msg, ct.as_slice());

    let pt = initiator.decrypt(&ct).unwrap();
    assert_eq!(msg, pt.as_slice());

    // Decrypting the responder's message again should fail
    assert!(initiator.decrypt(&ct).is_err());

    // initiator -> responder
    let msg = b"G'day, responder!";
    let ct = initiator.encrypt(msg).unwrap();
    assert_ne!(msg, ct.as_slice());

    let pt = responder.decrypt(&ct).unwrap();
    assert_eq!(msg, pt.as_slice());

    // Decrypting the initiator's message again should fail
    assert!(responder.decrypt(&ct).is_err());
}

/// Test NKpsk0 flow (state-assisted transaction)
#[test]
fn state_assisted() {
    nss_rs::init().expect("nss_rs::init");

    let initiator_identity = ecdh_keygen(&EcCurve::P256).expect("initiator_identity");
    let initiator_pub = initiator_identity.public.key_data().expect("initiator_pub");
    assert_eq!(65, initiator_pub.len());
    assert_eq!(4, initiator_pub[0]);

    let responder_identity = ecdh_keygen(&EcCurve::P256).expect("responder_identity");
    let responder_pub = responder_identity.public.key_data().expect("responder_pub");
    assert_eq!(65, responder_pub.len());
    assert_eq!(4, responder_pub[0]);

    let psk = nss_rs::random();

    let initiator_hs =
        InitiatorHandshake::new_state_assisted(&psk, responder_pub.as_slice().try_into().unwrap())
            .expect("initial_handshake_message");

    let mut responder =
        Responder::new_state_assisted(&psk, responder_identity, initiator_hs.initial_message())
            .expect("build_responder");

    let mut initiator = initiator_hs
        .process_handshake_response(&responder.response_message)
        .expect("process_handshake_response");

    assert_eq!(responder.handshake_hash, initiator.handshake_hash);

    // responder -> initiator
    let msg = b"Hi initiator!";
    let ct = responder.encrypt(msg).unwrap();
    assert_ne!(msg, ct.as_slice());

    let pt = initiator.decrypt(&ct).unwrap();
    assert_eq!(msg, pt.as_slice());

    // initiator -> responder
    let msg = b"G'day, responder!";
    let ct = initiator.encrypt(msg).unwrap();
    assert_ne!(msg, ct.as_slice());

    let pt = responder.decrypt(&ct).unwrap();
    assert_eq!(msg, pt.as_slice());
}

/// Test incorrect psk flows
#[test]
fn errors() {
    nss_rs::init().expect("nss_rs::init");

    let initiator_identity = ecdh_keygen(&EcCurve::P256).expect("initiator_identity");
    let initiator_pub: [u8; 65] = initiator_identity
        .public
        .key_data()
        .expect("initiator_pub")
        .try_into()
        .unwrap();
    assert_eq!(4, initiator_pub[0]);

    let responder_identity = ecdh_keygen(&EcCurve::P256).expect("responder_identity");
    let responder_pub: [u8; 65] = responder_identity
        .public
        .key_data()
        .expect("responder_pub")
        .try_into()
        .unwrap();
    assert_eq!(4, responder_pub[0]);

    let psk = nss_rs::random();

    let initiator_hs = InitiatorHandshake::new_qr_initiated(&psk, initiator_identity)
        .expect("initial_handshake_message");

    // Invalid initiator message
    assert_eq!(
        true,
        Responder::new_qr_initiated(&psk, &initiator_pub, &initiator_hs.initial_message()[..64],)
            .is_err()
    );

    // Set invalid point form
    let mut initiator_msg = initiator_hs.initial_message().clone();
    assert_eq!(4, initiator_msg[0]);
    initiator_msg[0] = 1;
    assert_eq!(
        true,
        Responder::new_qr_initiated(&psk, &initiator_pub, &initiator_msg).is_err()
    );

    // Reset point form
    initiator_msg[0] = 4;
    let responder =
        Responder::new_qr_initiated(&psk, &initiator_pub, &initiator_msg).expect("build_responder");

    // Return an incorrect responder message.
    // We can only do this once, because process_handshake_response mutates internal state.
    let mut responder_msg = responder.response_message.clone();

    // Set invalid point form
    assert_eq!(4, responder_msg[0]);
    responder_msg[0] = 1;
    assert_eq!(
        true,
        initiator_hs
            .process_handshake_response(&responder_msg)
            .is_err()
    );
}
