/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use std::collections::HashMap;
use std::ffi::OsStr;
use std::fmt::{Display, Error, Formatter};
use std::fs::{create_dir, exists, remove_dir_all};
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::runner::CommandRunner;
use crate::updater::{prepare_updater, CertOverride};

pub struct Test {
    /// A human readable identifier for the `from` build under test. Eg: a buildid
    /// or app version.
    pub id: String,
    /// The `from` installer to use as a starting point for the test
    pub from_installer: String,
    /// The locale of the `from` installer (needed to fully unpack it)
    pub locale: String,
    /// The MAR file to apply to the unpacked `from` installer
    pub mar: PathBuf,
}

impl Display for Test {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result<(), Error> {
        write!(f, "{}", self.full_id())?;
        return Ok(());
    }
}

impl Test {
    fn full_id(&self) -> String {
        let mar_filename = self
            .mar
            .file_name()
            .unwrap_or(OsStr::new("unknown_mar_name"))
            .to_str()
            .unwrap_or("unknown_mar_name");
        return format!("{}-{}-{}", self.id, self.locale, mar_filename);
    }
}

#[derive(Debug, PartialEq)]
pub enum TestResult {
    Pass,
    /// Updater did not run succesfully.
    UpdateStatusErr,
    /// UpdateSettings.framework is missing in the updated build (mac only)
    UpdateSettingsMissingErr,
    /// ChannelPrefs.framework is missing in the updated build (mac only)
    ChannelPrefsMissingErr,
    /// Unacceptable differences found between the MAR and installer
    DifferencesFoundErr,
    /// Error running `diff`
    DiffErr,
    /// Novel error occurred - such things may benefit from distinct results
    /// or to be converted to SetupErr when encountered!
    UnknownErr,
    /// Setup problems are not results in the same way that specific failure
    /// modes are; we group them all together and allow for additional
    /// information to be included in them for this reason.
    SetupErr(String),
}

pub(crate) fn run_tests(
    check_updates: &Path,
    target_platform: &str,
    to_installer: &str,
    channel: &str,
    appname: &str,
    cert_replace_script: Option<&Path>,
    cert_dir: Option<&Path>,
    cert_overrides: &Vec<CertOverride>,
    tests: Vec<Test>,
    tmpdir: &Path,
    artifact_dir: &Path,
    runner: &dyn CommandRunner,
) -> Result<Vec<TestResult>, Box<dyn std::error::Error>> {
    let mut results: Vec<TestResult> = vec![];
    let mut prepared_installers: HashMap<String, String> = HashMap::new();
    for test in tests {
        let result = run_test(
            &test,
            &mut prepared_installers,
            check_updates,
            target_platform,
            to_installer,
            channel,
            appname,
            cert_replace_script,
            cert_dir,
            cert_overrides,
            tmpdir,
            artifact_dir,
            runner,
        );
        match result {
            Ok(r) => {
                if r == TestResult::Pass {
                    println!("TEST-PASS: {}", test);
                } else {
                    println!("TEST-UNEXPECTED-FAIL: {}", test);
                }
                results.push(r);
            }
            Err(e) => {
                println!("TEST-UNEXPECTED-FAIL: {}", test);
                results.push(TestResult::SetupErr(e.to_string()));
            }
        }
    }
    return Ok(results);
}

fn run_test(
    test: &Test,
    prepared_installers: &mut HashMap<String, String>,
    check_updates: &Path,
    target_platform: &str,
    to_installer: &str,
    channel: &str,
    appname: &str,
    cert_replace_script: Option<&Path>,
    cert_dir: Option<&Path>,
    cert_overrides: &Vec<CertOverride>,
    tmpdir: &Path,
    artifact_dir: &Path,
    runner: &dyn CommandRunner,
) -> Result<TestResult, Box<dyn std::error::Error>> {
    let updater = match prepared_installers.get(&test.from_installer) {
        Some(path) => path.clone(),
        None => {
            let idx = prepared_installers.len();
            let mut unpack_dir = tmpdir.to_path_buf();
            unpack_dir.push(format!("updater_{idx}"));
            let path = prepare_updater(
                &test.from_installer,
                appname,
                cert_replace_script,
                cert_dir,
                cert_overrides,
                &unpack_dir,
                runner,
            )?;
            prepared_installers.insert(test.from_installer.clone(), path.clone());
            path
        }
    };
    println!("Using updater at: {updater}");

    let test_dir = setup_test_dir(&test.mar, tmpdir)?;
    let mut diff_file = artifact_dir.to_path_buf();
    diff_file.push(format!("{}.summary.log", test.full_id()));
    let mut cmd = Command::new("/bin/bash");
    cmd.arg(check_updates)
        .arg(target_platform)
        .arg(&test.from_installer)
        .arg(to_installer)
        .arg(&test.locale)
        .arg(updater)
        .arg(diff_file.to_str().unwrap())
        .arg(channel)
        // check_updates.sh requires positional args that we don't use
        .arg("")
        .arg("")
        .arg("")
        .arg(appname)
        .current_dir(test_dir);
    return match runner.run(&mut cmd)? {
        0 => Ok(TestResult::Pass),
        1 => Ok(TestResult::SetupErr(
            "Failed to unpack from or to build".to_string(),
        )),
        2 => Ok(TestResult::SetupErr(
            "Failed to cd into from build application directory".to_string(),
        )),
        3 => Ok(TestResult::SetupErr(
            "from build application directory does not exist".to_string(),
        )),
        4 => Ok(TestResult::UpdateStatusErr),
        5 => Ok(TestResult::UpdateSettingsMissingErr),
        6 => Ok(TestResult::ChannelPrefsMissingErr),
        7 => Ok(TestResult::DifferencesFoundErr),
        8 => Ok(TestResult::DiffErr),
        _ => Ok(TestResult::UnknownErr),
    };
}

/// Setup the test directory in a way that is compatible with the expectations
/// of `check_updates.sh`: create a fresh directory with an `update` directory
/// inside of it, containing the MAR to be applied in `update.mar`.
/// When we get rid of `check_updates.sh` we can consider changing or getting
/// rid of this.
fn setup_test_dir(mar: &Path, tmpdir: &Path) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut test_dir = tmpdir.to_path_buf();
    test_dir.push("work");
    if exists(test_dir.as_path())? {
        remove_dir_all(&test_dir)?;
    }
    create_dir(test_dir.as_path())?;
    let mut update_dir = test_dir.clone();
    update_dir.push("update");
    create_dir(update_dir.as_path())?;
    let mut mar_path = update_dir.clone();
    mar_path.push("update.mar");
    symlink(mar, mar_path.as_path())?;
    return Ok(test_dir);
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    struct FakeRunner(i32);
    impl CommandRunner for FakeRunner {
        fn run(&self, _: &mut Command) -> Result<i32, Box<dyn std::error::Error>> {
            Ok(self.0)
        }
    }

    #[test]
    fn setup_test_dir_creates_expected_layout() {
        let tmpdir = TempDir::with_prefix("marannon_setup_test").unwrap();
        let tmp = tmpdir.path().to_path_buf();

        let mar = tmp.join("test.mar");
        std::fs::write(&mar, b"fake").unwrap();

        let test_dir = setup_test_dir(&mar, &tmp).unwrap();

        assert!(test_dir.exists());
        assert!(test_dir.join("update").exists());
        assert!(test_dir.join("update").join("update.mar").exists());
    }

    #[test]
    fn run_tests_setup_err_on_bad_installer() {
        let tmpdir = TempDir::with_prefix("marannon_run_tests").unwrap();
        let tmp = tmpdir.path();
        let artifact_dir = TempDir::with_prefix("marannon_artifacts").unwrap();
        let artifacts = artifact_dir.path();

        let test = Test {
            id: "from".to_string(),
            mar: tmp.join("test.mar"),
            from_installer: "/nonexistent/installer.tar.xz".to_string(),
            locale: "en-US".to_string(),
        };

        let results = run_tests(
            &Path::new("/fake/check_updates.sh"),
            "linux",
            "/fake/to_installer",
            "release",
            "firefox",
            None,
            None,
            &vec![],
            vec![test],
            &tmp.to_path_buf(),
            &artifacts.to_path_buf(),
            &FakeRunner(0),
        )
        .unwrap();

        assert_eq!(results.len(), 1);
        assert!(
            matches!(&results[0], TestResult::SetupErr(e) if e.contains("No such file or directory"))
        );
    }
}
