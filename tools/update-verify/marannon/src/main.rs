/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
mod cli;
mod downloader;
mod runner;
mod test;
mod updater;

use std::fs::{create_dir, exists};
use std::path::Path;
use std::process::exit;
use tempfile::TempDir;

use crate::cli::Args;
use crate::downloader::{FileDownloader, UreqDownloader};
use crate::runner::RealRunner;
use crate::test::{run_tests, Test, TestResult};

/// Returns what we consider to be the file extension. In most cases this is
/// simply everything after the last `.`.
fn get_extension(filename: &str) -> Option<&str> {
    if filename.ends_with(".tar.xz") {
        return Some("tar.xz");
    }
    return Path::new(filename).extension()?.to_str();
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse_and_validate();
    // Using `keep()` prevents the temporary directory from being cleaned up.
    // This is on purpose. When running in CI any necessary cleanup is handled
    // by CI (eg: making sure artifacts from an earlier task are removed before
    // a new task begins). When running locally it's preferable to keep artifacts
    // around for debugging.
    let tmpdir = TempDir::with_prefix("update-verify")?.keep();
    let tmppath = tmpdir.to_str().ok_or("Couldn't parse tmpdir")?;
    println!("Using tmpdir: {tmppath}");

    let downloader = UreqDownloader;
    let runner = RealRunner;

    let mut tests = Vec::new();
    let mut download_dir = tmpdir.clone();
    download_dir.push("from_builds");
    create_dir(download_dir.as_path())?;

    if !exists(&args.artifact_dir)? {
        create_dir(&args.artifact_dir)?;
    }

    // Iterate over `from` builds given, download them, and create Test objects for each.
    // All `from` builds given will be tested against the complete MAR. Entries that also
    // contained a partial MAR will be additionally tested against that.
    for (i, entry) in args.from.iter().enumerate() {
        let mut dest_path = download_dir.clone();
        let ext =
            get_extension(&entry.installer).ok_or("Couldn't find from installer extension!")?;
        dest_path.push(format!("{i}.{ext}"));
        let from_installer = dest_path
            .to_str()
            .ok_or("Couldn't convert dest_path to str!")?;
        downloader.fetch(&entry.installer, from_installer)?;
        tests.push(Test {
            id: entry.id.clone(),
            mar: args.complete_mar.to_path_buf(),
            from_installer: from_installer.to_string(),
            locale: args.locale.clone(),
        });
        if let Some(partial_mar) = &entry.partial_mar {
            let mut partial_path = args.partial_mar_dir.to_path_buf();
            partial_path.push(partial_mar);
            tests.push(Test {
                id: entry.id.clone(),
                mar: partial_path,
                from_installer: from_installer.to_string(),
                locale: args.locale.clone(),
            });
        }
    }
    let results = run_tests(
        &args.check_updates_script,
        &args.target_platform,
        &args.to_installer,
        &args.channel,
        &args.appname,
        args.cert_replace_script.as_deref(),
        args.cert_dir.as_deref(),
        &args.cert_override,
        tests,
        &tmpdir,
        &args.artifact_dir,
        &runner,
    )?;
    let passes = results.iter().filter(|r| **r == TestResult::Pass).count();
    let fails = results.len() - passes;
    println!("Summary of results: {} PASS, {} FAIL", passes, fails);
    if fails > 0 {
        exit(1);
    }

    return Ok(());
}

#[cfg(test)]
mod tests {
    use super::get_extension;

    #[test]
    fn tar_xz() {
        assert_eq!(get_extension("foo.tar.xz"), Some("tar.xz"));
    }

    #[test]
    fn exe() {
        assert_eq!(get_extension("foo.exe"), Some("exe"));
    }

    #[test]
    fn no_ext() {
        assert_eq!(get_extension("foo"), None);
    }
}
