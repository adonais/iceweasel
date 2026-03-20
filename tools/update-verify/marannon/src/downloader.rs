/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::fs::File;
use std::io::copy;

use ureq;

/// A simple trait to facilitate unit testing of functions that download files.
pub(crate) trait FileDownloader {
    fn fetch(&self, url: &str, dest: &str) -> Result<(), Box<dyn std::error::Error>>;
}

pub(crate) struct UreqDownloader;

impl FileDownloader for UreqDownloader {
    fn fetch(&self, url: &str, dest: &str) -> Result<(), Box<dyn std::error::Error>> {
        println!("Downloading {} to {}", url, dest);
        let mut response = ureq::get(url).call()?.into_body().into_reader();
        let mut dest_file = File::create(dest)?;
        copy(&mut response, &mut dest_file)?;
        return Ok(());
    }
}
