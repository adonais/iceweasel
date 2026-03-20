/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::fs::File;
use std::io::{Error, ErrorKind};
use std::path::Path;
use std::process::Command;
use tar::Archive;
use xz::read::XzDecoder;

use crate::runner::CommandRunner;

/// Represents a certificate in an updater binary that should be replaced
/// if present.
#[derive(Clone)]
pub(crate) struct CertOverride {
    pub(crate) orig: String,
    pub(crate) replacement: String,
}

impl std::str::FromStr for CertOverride {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let parts: Vec<&str> = s.splitn(2, '|').collect();
        if parts.len() != 2 {
            return Err(format!("expected 'orig|replacement', got: {s}"));
        }
        Ok(CertOverride {
            orig: parts[0].to_string(),
            replacement: parts[1].to_string(),
        })
    }
}

/// Prepare an updater `pkg` for usage by unpacking it and replacing any requested certs in the
/// updater binary inside.
pub(crate) fn prepare_updater(
    pkg: &str,
    appname: &str,
    cert_replace_script: Option<&Path>,
    cert_dir: Option<&Path>,
    cert_overrides: &[CertOverride],
    output_dir: &Path,
    runner: &dyn CommandRunner,
) -> Result<String, Box<dyn std::error::Error>> {
    let updater = unpack_updater(pkg, appname, output_dir)?;
    if !cert_overrides.is_empty() {
        replace_certs(
            cert_replace_script.ok_or("cert_replace_script is required to override certs")?,
            cert_dir.ok_or("cert_dir is required to override certs")?,
            &updater,
            cert_overrides,
            runner,
        )?;
    }
    return Ok(updater);
}

fn unpack_updater(
    pkg: &str,
    appname: &str,
    output_dir: &Path,
) -> Result<String, Box<dyn std::error::Error>> {
    let compressed = File::open(pkg)?;
    let tar = XzDecoder::new(compressed);
    let mut archive = Archive::new(tar);
    archive.unpack(output_dir)?;
    let mut updater_binary = output_dir.to_path_buf();
    updater_binary.push(appname);
    updater_binary.push("updater");
    let updater_path = updater_binary
        .to_str()
        .ok_or("Couldn't parse updater binary path")?;
    if !updater_binary.exists() {
        return Err(Box::new(Error::new(
            ErrorKind::Other,
            format!("updater binary doesn't exist at {updater_path}"),
        )));
    }
    return Ok(updater_path.to_string());
}

fn replace_certs(
    cert_replace_script: &Path,
    cert_dir: &Path,
    updater: &str,
    overrides: &[CertOverride],
    runner: &dyn CommandRunner,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut command = Command::new("python3");
    command
        .arg(cert_replace_script)
        .arg(cert_dir)
        .arg(updater)
        .arg(updater);
    for cert_pair in overrides {
        command.arg(cert_pair.orig.clone());
        command.arg(cert_pair.replacement.clone());
    }
    if runner.run(&mut command)? == 0 {
        return Ok(());
    }
    return Err(Box::new(Error::new(
        ErrorKind::Other,
        "Failed to replace certs!",
    )));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;
    use tempfile::TempDir;

    fn make_tar_xz(appname: &str, output: &std::path::Path) {
        use tar::Header;
        use xz::write::XzEncoder;

        let file = File::create(output).unwrap();
        let enc = XzEncoder::new(file, 6);
        let mut builder = tar::Builder::new(enc);

        let content = b"#!/bin/sh\n";
        let mut header = Header::new_gnu();
        header.set_path(format!("{appname}/updater")).unwrap();
        header.set_size(content.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        builder.append(&header, &content[..]).unwrap();

        let enc = builder.into_inner().unwrap();
        enc.finish().unwrap();
    }

    struct FakeRunner(i32);
    impl CommandRunner for FakeRunner {
        fn run(&self, _: &mut Command) -> Result<i32, Box<dyn std::error::Error>> {
            Ok(self.0)
        }
    }

    #[test]
    fn cert_override_valid() {
        let c = CertOverride::from_str("a.der|b.der").unwrap();
        assert_eq!(c.orig, "a.der");
        assert_eq!(c.replacement, "b.der");
    }

    #[test]
    fn cert_override_missing_pipe() {
        assert!(CertOverride::from_str("nodivider").is_err());
    }

    #[test]
    fn cert_override_extra_pipes_preserved_in_replacement() {
        let c = CertOverride::from_str("a.der|b.der|extra").unwrap();
        assert_eq!(c.orig, "a.der");
        assert_eq!(c.replacement, "b.der|extra");
    }

    #[test]
    fn unpack_updater_success() {
        let tmpdir = TempDir::with_prefix("marannon_updater_test").unwrap();
        let archive = tmpdir.path().join("test.tar.xz");
        let output_dir = tmpdir.path().join("output");
        std::fs::create_dir(&output_dir).unwrap();

        make_tar_xz("firefox", &archive);

        let result = unpack_updater(archive.to_str().unwrap(), "firefox", &output_dir);
        assert!(result.is_ok());
        assert!(std::path::Path::new(&result.unwrap()).exists());
    }

    #[test]
    fn unpack_updater_missing_binary() {
        use xz::write::XzEncoder;

        let tmpdir = TempDir::with_prefix("marannon_updater_test").unwrap();
        let archive = tmpdir.path().join("empty.tar.xz");
        let output_dir = tmpdir.path().join("output");
        std::fs::create_dir(&output_dir).unwrap();

        let file = File::create(&archive).unwrap();
        let enc = XzEncoder::new(file, 6);
        let builder = tar::Builder::new(enc);
        let enc = builder.into_inner().unwrap();
        enc.finish().unwrap();

        let result = unpack_updater(archive.to_str().unwrap(), "firefox", &output_dir);
        assert!(result.is_err());
    }

    #[test]
    fn replace_certs_success() {
        let result = replace_certs(
            &Path::new("/fake/cert_replace.py"),
            &Path::new("/fake/cert_dir"),
            "/fake/updater",
            &vec![],
            &FakeRunner(0),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn replace_certs_failure() {
        let result = replace_certs(
            &Path::new("/fake/cert_replace.py"),
            &Path::new("/fake/cert_dir"),
            "/fake/updater",
            &vec![],
            &FakeRunner(1),
        );
        assert!(result.is_err());
    }
}
