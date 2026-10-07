/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

pub fn assert_de<T>(data: &T, json: serde_json::Value)
where
    T: std::fmt::Debug,
    T: std::cmp::PartialEq,
    T: serde::de::DeserializeOwned,
{
    assert_eq!(data, &serde_json::from_value::<T>(json).unwrap());
}

/// Build a ZIP archive in memory with the given entry name -> content pairs.
pub fn build_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut buf = Cursor::new(Vec::new());
    {
        let mut writer = ZipWriter::new(&mut buf);
        let opts = SimpleFileOptions::default();
        for &(name, content) in entries {
            writer.start_file(name, opts).unwrap();
            writer.write_all(content).unwrap();
        }
        writer.finish().unwrap();
    }
    buf.into_inner()
}
