/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! caBLE discovery and XPCOM bindings.

use crate::Sha256;
use sha2::Digest;

const KNOWN_TUNNEL_SERVER_DOMAINS: [&str; 2] = ["cable.ua5v.com", "cable.auth.com"];

/// Decode a tunnel server ID into a domain name.
///
/// Returns `None` for invalid or unknown tunnel server IDs.
pub fn decode_tunnel_server_id(tunnel_server_id: u16) -> Option<String> {
    const TUNNEL_SERVER_SALT: &[u8; 28] = b"caBLEv2 tunnel server domain";
    const TUNNEL_SERVER_TLDS: [&str; 4] = [".com", ".org", ".net", ".info"];
    const BASE32_CHARS: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";

    if tunnel_server_id < 256 {
        return KNOWN_TUNNEL_SERVER_DOMAINS
            .get(usize::from(tunnel_server_id))
            .map(|d| d.to_string());
    }

    let mut hasher = Sha256::new();
    hasher.update(TUNNEL_SERVER_SALT);
    hasher.update(&tunnel_server_id.to_le_bytes());
    hasher.update([0]);
    let hash = hasher.finalize();

    let mut v = u64::from_le_bytes(hash[..8].try_into().ok()?);
    let tld = TUNNEL_SERVER_TLDS[(v & 3) as usize];
    v >>= 2;

    // 24 = 6 + 5 + 62.div_ceil(5)
    let mut r = String::with_capacity(24);
    r.push_str("cable.");

    while v != 0 {
        let c = char::from_u32(BASE32_CHARS[(v & 31) as usize] as u32)?;
        r.push(c);
        v >>= 5;
    }

    r.push_str(tld);

    Some(r)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn tunnel_server() {
        assert_eq!("cable.ua5v.com", decode_tunnel_server_id(0).unwrap());
        assert_eq!("cable.auth.com", decode_tunnel_server_id(1).unwrap());
        assert_eq!(
            "cable.qz2ekwmnd332c.info",
            decode_tunnel_server_id(256).unwrap()
        );
        for s in 2..=255 {
            assert!(
                decode_tunnel_server_id(s).is_none(),
                "tunnel server {s} should be invalid"
            );
        }
    }
}
