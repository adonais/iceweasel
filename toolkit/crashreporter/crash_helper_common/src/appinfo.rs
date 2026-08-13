/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::{
    fs, io,
    path::PathBuf,
    time::{SystemTimeError, UNIX_EPOCH},
};

use thiserror::Error;

#[cfg(not(target_os = "windows"))]
pub(crate) mod unix;

#[cfg(target_os = "windows")]
pub(crate) mod windows;

/*****************************************************************************
 * Error definitions                                                         *
 *****************************************************************************/

#[derive(Debug, Error)]
pub enum AppInfoError {
    #[error("Could not access the current executable, installation time missing")]
    CannotAccessExecutable(#[from] io::Error),
    #[error("Could not access the current library, installation time missing")]
    CannotAccessLibrary,
    #[error("Could not calculate the installation time")]
    InvalidInstallationTime(#[from] SystemTimeError),
}

/****************************************************************************
 * Application information                                                   *
 *****************************************************************************/

pub struct ApplicationInfo {
    build_id: String,
    install_time: u64,
}

impl ApplicationInfo {
    pub fn new(build_id: String) -> ApplicationInfo {
        ApplicationInfo {
            build_id,
            install_time: Self::compute_install_time(None).unwrap_or(0),
        }
    }

    pub fn get_app_id(&self) -> &str {
        mozbuild::config::MOZ_APP_ID
    }

    pub fn get_app_name(&self) -> &str {
        mozbuild::config::MOZ_APP_BASENAME
    }

    pub fn get_buildid(&self) -> &str {
        &self.build_id
    }

    pub fn get_install_time(&self) -> u64 {
        self.install_time
    }

    pub fn compute_install_time(path: Option<PathBuf>) -> Result<u64, AppInfoError> {
        let exe_path = path.unwrap_or(Self::get_executable_path()?);
        let metadata = fs::metadata(exe_path)?;
        let mod_time = metadata.modified()?;
        let install_time = mod_time.duration_since(UNIX_EPOCH)?;

        Ok(install_time
            .as_secs()
            .saturating_sub(Self::get_user_id().unwrap_or(0)))
    }

    // This returns the path of the current executable on desktop platforms or
    // the APK on Android.
    fn get_executable_path() -> Result<PathBuf, AppInfoError> {
        #[cfg(not(target_os = "android"))]
        {
            Ok(std::env::current_exe()?)
        }
        #[cfg(target_os = "android")]
        {
            use nix::libc;
            use std::{
                ffi::{c_void, CStr, OsStr},
                os::unix::ffi::OsStrExt,
            };

            let mut info: libc::Dl_info = unsafe { std::mem::zeroed() };
            // SAFETY: The `info` argument points to a variable on the stack
            // and thus is guaranteed to be valid. The `addr` argument is the
            // pointer to an existing function so also valid.
            let res = unsafe { libc::dladdr(Self::compute_install_time as *mut c_void, &mut info) };
            if (res <= 0) || info.dli_fname.is_null() {
                return Err(AppInfoError::CannotAccessLibrary);
            }

            // SAFETY: We just checked that `dladdr()` returned successfully and
            // the pointer is not null.
            let path = unsafe { CStr::from_ptr(info.dli_fname) }.to_bytes();

            // Shared libraries are usually stored within APKs on Android and
            // directly mapped into memory from there. Their paths thus start
            // with the APK path, followed by an exclamation mark and then the
            // folders as they appear within the APK, like this:
            //
            // /data/app/~~<id1>==/org.mozilla.fenix-<id2>==/base.apk!/lib/x86_64/libcrashhelper.so
            //
            // This is not always the case and sometimes the libraries are
            // stored alongside the APK, like this:
            //
            // /data/app/~~<id1>==/org.mozilla.fenix-<id2>==/lib/x86_64/libcrashhelper.so
            //
            // We need access to either of them, so we look for an exclamation
            // mark within the path. If it's present we keep only the part of
            // the path before the exclamation mark (i.e. the APK path) and use
            // its modification time. If we don't find an exclamation mark we
            // assume that it's the library path and take that instead.
            let exclamation_mark = path
                .iter()
                .position(|&c| c == b'!')
                .unwrap_or(path.iter().len());
            let path = OsStr::from_bytes(&path[0..exclamation_mark]);
            Ok(PathBuf::from(path))
        }
    }

    pub fn get_release_channel(&self) -> &'static str {
        mozbuild::config::MOZ_UPDATE_CHANNEL
    }

    pub fn get_server_url(&self) -> String {
        format!(
            "{}/submit?id={}&version={}&buildid={}",
            mozbuild::config::MOZ_CRASHREPORTER_URL,
            mozbuild::config::MOZ_APP_ID,
            mozbuild::config::MOZ_APP_VERSION,
            self.get_buildid()
        )
    }

    pub fn get_vendor(&self) -> &'static str {
        mozbuild::config::MOZ_APP_VENDOR
    }

    pub fn get_version(&self) -> &'static str {
        mozbuild::config::MOZ_APP_VERSION
    }
}
