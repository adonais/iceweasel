/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! caBLE Base 10 encode / decode tests.

use noise::base10::*;

/// Test base10 encode/decode
#[test]
fn base10() {
    assert_eq!(8, encoded_size(3));
    assert_eq!(17, encoded_size(7));
    assert_eq!(20, encoded_size(8));

    assert_eq!(Some(0), decoded_size(0));
    assert_eq!(None, decoded_size(1));
    assert_eq!(None, decoded_size(2));
    assert_eq!(Some(1), decoded_size(3));
    assert_eq!(Some(3), decoded_size(8));

    // Test many sizes
    for l in 0..255 {
        let e = encoded_size(l);
        assert_eq!(Some(l), decoded_size(e));

        let r = l % 17;
        const VALID_REMAINDERS: [usize; 7] = [0, 3, 5, 8, 10, 13, 15];
        if let Some(d) = decoded_size(l) {
            assert!(VALID_REMAINDERS.contains(&r));
            assert_eq!(l, encoded_size(d));
        } else {
            assert_eq!(false, VALID_REMAINDERS.contains(&r));
        }
    }

    // Encoding shouldn't change
    let i: &[u8] = &[0x61, 0x62, 0xff];
    assert_eq!(b"16736865".as_slice(), encode(i));
    assert_eq!(i, decode(b"16736865").expect("decode 16736865"));

    // Encoding survives round-trips
    let i: Vec<u8> = (0..255).collect();
    for len in 0..i.len() {
        let i = &i[0..len];
        let e = encode(i);
        assert_eq!(encoded_size(len), e.len());
        assert_eq!(decoded_size(e.len()), Some(len));
        assert_eq!(Ok(i.to_vec()), decode(&e));
    }

    // Decoding non-numeric values
    for v in [
        b"12a".as_slice(),
        b"abc",
        b"a2b",
        b"abcde",
        // 5 full-width digits, encoded as 15 bytes
        b"\xef\xbc\x91\xef\xbc\x92\xef\xbc\x93\xef\xbc\x94\xef\xbc\x95",
        // Whitespace
        b" 123 ",
    ] {
        // Value should pass the size check
        assert!(decoded_size(v.len()).is_some());

        // But fail to decode
        assert!(decode(v).is_err());
    }

    // Decoding over-large integers
    let i: &[u8; 17] = b"99999999999999999";
    assert_eq!(Some(7), decoded_size(i.len()));
    assert!(decode(i).is_err());

    // Overlarge as a remainder
    let i: &[u8; 3] = b"999";
    assert_eq!(Some(1), decoded_size(i.len()));
    assert!(decode(i).is_err());
}
