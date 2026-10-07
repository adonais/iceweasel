/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Padding functions.

use crate::{Error, Result};

const PADDING_MUL: usize = 32;

pub const fn padding_len(len: usize) -> usize {
    let o = len - (len % PADDING_MUL) + PADDING_MUL;
    debug_assert!(o > len);
    o
}

/// Pad `buf` to a multiple of [`PADDING_MUL`] bytes, putting the number of padding bytes added
/// minus one in the final byte.
///
/// If `buf` is already a multiple of [`PADDING_MUL`] bytes, this adds [`PADDING_MUL`] bytes.
pub fn pad(buf: &mut Vec<u8>) {
    let len = buf.len();
    let padded_len = padding_len(len);
    let padding_len = (padded_len - len - 1) as u8;

    buf.resize_with(padded_len, Default::default);
    if let Some(l) = buf.last_mut() {
        *l = padding_len;
    }
}

/// Make a copy of `buf`, [padded][pad] to [`PADDING_MUL`] bytes.
///
/// If `src` is a `&mut Vec<u8>`, use [`pad`] instead.
pub fn pad_into_vec(src: &[u8]) -> Vec<u8> {
    let mut o = Vec::with_capacity(padding_len(src.len()));
    o.extend(src);
    pad(&mut o);
    o
}

/// Unpad a [padded][pad] `buf`.
///
/// Returns [`Error::InvalidArgument`] if `buf` is empty, the final byte is greater than
/// [PADDING_MUL], or the final byte is greater than the length of `buf`.
pub fn unpad(buf: &mut Vec<u8>) -> Result {
    let padded_len = buf.len();
    let padding_len = buf.last().copied().ok_or(Error::InvalidArgument)? as usize + 1;
    if padding_len > padded_len || padding_len > PADDING_MUL {
        // Incorrect padding length
        return Err(Error::InvalidArgument);
    }

    buf.truncate(padded_len - padding_len);
    Ok(())
}
