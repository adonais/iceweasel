/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Noise handshakes
mod initiator;
mod responder;
#[cfg(feature = "xpcom")]
mod service;

pub use self::{
    initiator::{Initiator, InitiatorHandshake},
    responder::Responder,
};

/// Length of a AEAD tag; copy of `nss_rs::aead::TAG_LEN`.
const TAG_LEN: usize = 16;

#[derive(Copy, Clone, PartialEq, Eq)]
pub enum HandshakeType {
    KNpsk0,
    NKpsk0,
}
