/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! caBLE Base10 encode/decode.
//!
//! <https://fidoalliance.org/specs/fido-v2.3-ps-20260226/fido-client-to-authenticator-protocol-v2.3-ps-20260226.html#~:text=func-,digitEncode>

use crate::{Error, Result};

/// Chunk size for input/decoded data
const CHUNK_SIZE: usize = 7;

/// Chunk size for output/encoded data
const CHUNK_DIGITS: usize = 17;

/// The length of Base10 encoding a buffer of `len` bytes.
pub const fn encoded_size(len: usize) -> usize {
    // Length of partial chunks.
    let r = (5 * (len % CHUNK_SIZE)).div_ceil(2);

    // Length of complete chunks.
    let c = len / CHUNK_SIZE * CHUNK_DIGITS;

    c + r
}

/// The length of decoding a Base10-encoded buffer of `len` bytes.
///
/// Returns `None` if `len` is invalid for Base10 encoding.
pub const fn decoded_size(len: usize) -> Option<usize> {
    /// Each 3 bits is the number of digits the remainder of each chunk decodes into, from 16 bytes
    /// down to 0. Invalid lengths are marked as 7.
    ///
    /// This requires 51 bits, so we can't use usize on 32-bit systems like [`encoded_size`]. On
    /// 64-bit systems, this still compiles into the same assembly as writing everything with usize.
    const PARTIAL_DIGITS_CHUNK: u64 = 0o76_757_747_377_271_770;

    // Length of the digit remainder of the chunk. Always less than CHUNK_DIGITS, CHUNK_DIGITS * 3
    // is less than u64::MAX, so it's safe to cast if usize is wider.
    //
    // This could be a u8, but the compiler may make this a u64 anyway.
    let rd = (len % CHUNK_DIGITS) as u64;

    // Find the length of the remainder digit in bytes.
    let r = 0o7 & (PARTIAL_DIGITS_CHUNK >> (3 * rd));

    if r == 0o7 {
        // Invalid!
        return None;
    }

    // When we get here, r is less than 7, so it's safe to cast to usize, even if narrower than u64.
    // This is effectively a no-op on 64-bit systems.
    let r = r as usize;

    // Add the length of complete chunks to the remainder.
    Some(r + (len / CHUNK_DIGITS * CHUNK_SIZE))
}

/// Encodes `i` using Base10 encoding (`digitEncode`).
pub fn encode(i: &[u8]) -> Vec<u8> {
    let mut o = Vec::with_capacity(encoded_size(i.len()));
    let (chunks, remainder) = i.as_chunks::<CHUNK_SIZE>();
    for c in chunks {
        let mut chunk = [0; 8];
        chunk[..CHUNK_SIZE].copy_from_slice(c);
        let v = format!("{:0CHUNK_DIGITS$}", u64::from_le_bytes(chunk));
        o.extend_from_slice(v.as_bytes());
    }

    if !remainder.is_empty() {
        let s = encoded_size(remainder.len());
        let mut chunk = [0; 8];
        chunk[..remainder.len()].copy_from_slice(remainder);
        let v = format!("{:0s$}", u64::from_le_bytes(chunk));
        o.extend_from_slice(v.as_bytes());
    }

    o
}

/// Decodes `i` using Base10 decoding.
///
/// `i` must only contain ASCII digits, and of a [valid length][decoded_size].
pub fn decode(i: &[u8]) -> Result<Vec<u8>> {
    if i.is_empty() {
        return Ok(vec![]);
    }

    let s = decoded_size(i.len()).ok_or(Error::InvalidArgument)?;

    if i.iter().any(|&c| !c.is_ascii_digit()) {
        return Err(Error::InvalidArgument);
    }

    let mut o = Vec::with_capacity(s);
    let (chunks, remainder) = i.as_chunks::<CHUNK_DIGITS>();
    for c in chunks {
        // TODO: replace with u64::from_ascii_bytes when stable
        // https://github.com/rust-lang/rust/issues/134821
        let c = str::from_utf8(c).map_err(|_| Error::Internal)?;
        let v = c.parse::<u64>().map_err(|_| Error::Internal)?;
        if v >> (CHUNK_SIZE * 8) != 0 {
            // Decimal value is too high.
            return Err(Error::InvalidArgument);
        }
        o.extend_from_slice(&v.to_le_bytes()[..CHUNK_SIZE]);
    }

    if !remainder.is_empty() {
        let s = decoded_size(remainder.len()).ok_or(Error::Internal)?;
        let c = str::from_utf8(remainder).map_err(|_| Error::Internal)?;
        let v = c.parse::<u64>().map_err(|_| Error::Internal)?;
        if v >> (s * 8) != 0 {
            // Decimal value is too high.
            return Err(Error::InvalidArgument);
        }

        o.extend_from_slice(&v.to_le_bytes()[..s]);
    }

    Ok(o)
}
