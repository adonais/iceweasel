/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::path::{absolute, PathBuf};

use clap::{CommandFactory, Parser};

use crate::updater::CertOverride;

/// Represents a build that we want to test updating from
#[derive(Clone)]
pub struct FromBuild {
    pub id: String,
    pub installer: String,
    pub partial_mar: Option<String>,
}

impl std::str::FromStr for FromBuild {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let parts: Vec<&str> = s.splitn(3, '|').collect();
        if parts.len() < 2 {
            return Err(format!(
                "expected 'id|installer or id|installer|partial', got: {s}"
            ));
        }
        Ok(FromBuild {
            id: parts[0].to_string(),
            installer: parts[1].to_string(),
            partial_mar: parts.get(2).map(|s| s.to_string()),
        })
    }
}

#[derive(Parser)]
pub struct Args {
    /// Path to check_updates.sh. May be relative or absolute.
    pub check_updates_script: PathBuf,
    /// Platform of the updates under test.
    pub target_platform: String,
    /// Path to the installer of the `to` build. Updated `from` builds are compared against this to
    /// look for differences.
    pub to_installer: String,
    /// Complete MAR to test against each `from` build.
    pub complete_mar: PathBuf,
    /// Directory containing any partials referenced in a `--from` argument
    pub partial_mar_dir: PathBuf,
    /// Locale of the updates under test. Needed to fully unpack `from` and `to` builds.
    pub locale: String,
    /// Channel of the updates under test. Needed to fully unpack `from` and `to` builds.
    pub channel: String,
    /// Product of the updates under test. Needed to accurately assess acceptable differences
    /// found.
    pub appname: String,
    /// Directory to put artifacts, eg: diffs
    pub artifact_dir: PathBuf,
    /// Information about a `from` build to test, separated by a `|`:
    /// - A human readable identifier (buildid, app version, anything you want)
    /// - An URL where the installer can be retrieved
    /// - A filename of a partial MAR, relative to `--partial-mar-dir`, of a
    ///   partial MAR that applies to this build. Optional.
    #[arg(long, required = true)]
    pub from: Vec<FromBuild>,
    /// Replace first cert with second cert in the updater binary, eg:
    /// release_primary.der|dep1.der. May be passed multiple times. If passed,
    /// `--cert-replace-script` and `--cert-dir` must also be passed.
    #[arg(long)]
    pub cert_override: Vec<CertOverride>,
    /// Path to replace-updater-certs.py. Required when --cert-override is given.
    #[arg(long)]
    pub cert_replace_script: Option<PathBuf>,
    /// Path to directory that contains mar certs. Required when --cert-override is given.
    #[arg(long)]
    pub cert_dir: Option<PathBuf>,
}

impl Args {
    pub fn parse_and_validate() -> Self {
        let mut args = Self::parse();
        if !args.cert_override.is_empty() {
            if args.cert_replace_script.is_none() {
                Self::command()
                    .error(
                        clap::error::ErrorKind::MissingRequiredArgument,
                        "--cert-replace-script is required when --cert-override is given",
                    )
                    .exit();
            }
            if args.cert_dir.is_none() {
                Self::command()
                    .error(
                        clap::error::ErrorKind::MissingRequiredArgument,
                        "--cert-dir is required when --cert-override is given",
                    )
                    .exit();
            }
        }
        args.check_updates_script = absolute(args.check_updates_script)
            .expect("Failed to convert check updates script into an absolute path!");
        if let Some(script) = args.cert_replace_script {
            args.cert_replace_script = Some(
                absolute(script)
                    .expect("Failed to convert cert replace script into an absolute path!"),
            );
        }
        return args;
    }
}
