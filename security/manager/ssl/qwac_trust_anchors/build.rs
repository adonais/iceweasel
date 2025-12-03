/* -*- Mode: rust; rust-indent-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use base64::prelude::BASE64_STANDARD;
use base64::Engine;
use std::cmp::Ordering;
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;

#[derive(Eq, PartialEq)]
struct TrustAnchor {
    bytes: Vec<u8>,
    subject: Vec<u8>,
    subject_start: u16,
    subject_len: u8,
}

impl PartialOrd for TrustAnchor {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        self.subject.partial_cmp(&other.subject)
    }
}

impl TrustAnchor {
    fn new(bytes: Vec<u8>) -> TrustAnchor {
        let (_, _, subject) =
            rsclientcerts_util::read_encoded_certificate_identifiers(bytes.as_slice())
                .expect("Couldn't decode certificate.");
        let subject_start = bytes
            .windows(subject.len())
            .position(|s| s == subject)
            .expect("subject should appear in bytes");
        let subject_start: u16 = subject_start
            .try_into()
            .expect("subject start hopefully fits in u16");
        let subject_len = subject
            .len()
            .try_into()
            .expect("subject length hopefully fits in u8");
        TrustAnchor {
            bytes,
            subject,
            subject_start,
            subject_len,
        }
    }
}

fn read_trust_anchors(trust_anchors_file: &File) -> Vec<TrustAnchor> {
    let reader = BufReader::new(trust_anchors_file);
    let mut maybe_current_trust_anchor: Option<Vec<String>> = None;
    let mut trust_anchors = Vec::new();
    for line in reader.lines() {
        let line = line.expect("Couldn't read contents of trust anchors file.");
        match line.as_str() {
            "-----BEGIN CERTIFICATE-----" => {
                maybe_current_trust_anchor.replace(Vec::new());
            }
            "-----END CERTIFICATE-----" => {
                let current_trust_anchor = maybe_current_trust_anchor
                    .take()
                    .expect("END CERTIFICATE without BEGIN CERTIFICATE?");
                let base64 = current_trust_anchor.join("");
                let bytes = BASE64_STANDARD
                    .decode(base64)
                    .expect("Couldn't base64-decode trust anchor.");
                let trust_anchor = TrustAnchor::new(bytes);
                trust_anchors.push(trust_anchor);
            }
            _ => {
                if let Some(current_trust_anchor) = maybe_current_trust_anchor.as_mut() {
                    current_trust_anchor.push(line);
                }
            }
        }
    }
    trust_anchors.sort_by_cached_key(|trust_anchor| trust_anchor.subject.clone());
    trust_anchors
}

fn emit_trust_anchors(
    out: &mut dyn Write,
    prefix: &str,
    trust_anchors_filename: &str,
) -> std::io::Result<()> {
    let trust_anchors_file = File::open(trust_anchors_filename)?;
    let trust_anchors = read_trust_anchors(&trust_anchors_file);
    for (index, trust_anchor) in trust_anchors.iter().enumerate() {
        writeln!(
            out,
            "static {prefix}TRUST_ANCHOR_{index:0>4}_BYTES: &[u8] = &{:?};",
            trust_anchor.bytes
        )?;
    }

    writeln!(
        out,
        "pub (crate) static {prefix}TRUST_ANCHORS: [TrustAnchor; {num_trust_anchors}] = [",
        num_trust_anchors = trust_anchors.len()
    )?;
    for (index, trust_anchor) in trust_anchors.iter().enumerate() {
        writeln!(out, "    TrustAnchor {{")?;
        writeln!(
            out,
            "        bytes: {prefix}TRUST_ANCHOR_{index:0>4}_BYTES,"
        )?;
        writeln!(
            out,
            "        subject: ({}, {}),",
            trust_anchor.subject_start, trust_anchor.subject_len
        )?;
        writeln!(out, "    }},")?;
    }
    writeln!(out, "];")?;
    Ok(())
}

fn main() -> std::io::Result<()> {
    let trust_anchors = "trust_anchors.pem";
    let test_trust_anchors = "test_trust_anchors.pem";
    println!("cargo:rerun-if-changed={}", trust_anchors);
    println!("cargo:rerun-if-changed={}", test_trust_anchors);

    let out_path = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR should be set in env."));
    let mut out = BufWriter::new(
        File::create(out_path.join("trust_anchors.rs")).expect("Could not write trust_anchors.rs."),
    );

    emit_trust_anchors(&mut out, "", trust_anchors)?;
    emit_trust_anchors(&mut out, "TEST_", test_trust_anchors)?;

    Ok(())
}
