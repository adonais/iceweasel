/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! # Taskbar Shortcuts
//!
//! This module includes utilities for interacting with shortcuts relevant to
//! taskbar pinning.
//!
//! Shortcuts are only relevant for non-MSIX installs; MSIX pinning does not
//! rely on the existence of shortcuts in `shell:AppsFolder` to pin applications
//! to the taskbar, nor does it store shortcuts in the taskbar pin folder.

use std::{
    ffi::OsString,
    io,
    os::windows::ffi::{OsStrExt, OsStringExt},
    path::{Path, PathBuf},
};
use windows::{
    core::{Error as WinError, Interface, PCWSTR},
    Storage::UserDataPaths,
    Win32::{
        Foundation::{E_FAIL, MAX_PATH},
        Storage::{
            EnhancedStorage::PKEY_AppUserModel_ID,
            Packaging::Appx::APPLICATION_USER_MODEL_ID_MAX_LENGTH,
        },
        System::Com::{
            CoCreateInstance, IPersistFile,
            StructuredStorage::{PropVariantClear, PropVariantToString},
            CLSCTX_INPROC_SERVER, STGM,
        },
        UI::Shell::{IShellLinkW, PropertiesSystem::IPropertyStore, ShellLink as ShellLinkClsid},
    },
};

use crate::util::thread_guard::BackgroundThreadGuard;

use self::canonicalized::CanonPath;

// `#[warn(dead_code)]` ignores usage of the Debug trait; suppress it to allow
// `WinError` to be included in logs.
#[allow(dead_code)]
#[derive(Debug)]
pub(super) enum IsPinnedError {
    GetExePaths(io::Error),
    GetAppData(WinError),
}

/// Checks whether the provided AUMID matches a taskbar pin shortcut targeting
/// a binary from this install.
pub fn is_app_pinned(
    aumid: &str,
    // We need to do file IO to inspect the shortcut files' content, therefore
    // should run on a background thread.
    bg_guard: BackgroundThreadGuard,
) -> Result<bool, IsPinnedError> {
    log::trace!("Checking taskbar pin for AUMID `{aumid}`");

    let [exe_path, pb_exe_path] = get_exe_paths().map_err(IsPinnedError::GetExePaths)?;

    log::trace!("Current exe path: {exe_path:?}\nPrivate exe path: {pb_exe_path:?}");

    let appdata_folder = UserDataPaths::GetDefault()
        .and_then(|paths| paths.RoamingAppData())
        .map(|path| PathBuf::from(path.to_os_string()))
        .map_err(IsPinnedError::GetAppData)?;
    let taskbar_shortcut_folder =
        appdata_folder.join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar");

    let Ok(entries) = std::fs::read_dir(&taskbar_shortcut_folder) else {
        // `User Pinned\TaskBar` is only created after a user has pinned an app
        // to the Taskbar. Therefore, the folder's absence implies we are not
        // pinned. This does not imply the Taskbar has no pinned apps. This
        // behavior was verified under Windows Sandbox.
        return Ok(false);
    };

    Ok(entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"))
        })
        .any(|shortcut_path| {
            check_shortcut_matches(&shortcut_path, &exe_path, &pb_exe_path, aumid, bg_guard)
                .inspect_err(|e| log::error!("Error matching shortcut: {e:?}"))
                .is_ok_and(|shortcut_matches| shortcut_matches)
        }))
}

/// Checks if the shortcut matches one of the provided binary paths and AUMID.
fn check_shortcut_matches(
    shortcut_path: &Path,
    exe_path: &CanonPath,
    pb_exe_path: &CanonPath,
    aumid: &str,
    // We need to do file IO to inspect the shortcut files' content, therefore
    // should run on a background thread.
    _bg_guard: BackgroundThreadGuard,
) -> Result<bool, WinError> {
    log::trace!("Shortcut file path: {shortcut_path:?}");

    let link = ShellLink::new(shortcut_path)?;

    let link_target = CanonPath::new(link.get_target()?).map_err(|_| E_FAIL)?;

    log::trace!("Shortcut target path: {link_target:?}");

    if link_target != *exe_path && link_target != *pb_exe_path {
        return Ok(false);
    }

    let link_aumid = link.get_aumid()?;

    log::trace!("Shortcut AUMID: `{link_aumid}`");

    Ok(*aumid == link_aumid)
}

/// Returns the current and private executable paths.
fn get_exe_paths() -> io::Result<[CanonPath; 2]> {
    let current_exe = std::env::current_exe()?;
    let private_exe = current_exe
        .parent()
        .map(|p| p.join("private_browsing.exe"))
        .ok_or(io::Error::from(io::ErrorKind::Other))?;

    Ok([CanonPath::new(current_exe)?, CanonPath::new(private_exe)?])
}

/// Safe wrapper for a ShellLink COM object.
struct ShellLink(IShellLinkW);

impl ShellLink {
    fn new(path: &Path) -> Result<Self, WinError> {
        // SAFETY: `rclsid` pointer derived from a reference.
        let link: IShellLinkW =
            unsafe { CoCreateInstance(&ShellLinkClsid, None, CLSCTX_INPROC_SERVER) }?;

        let persist: IPersistFile = link.cast()?;

        // Convert Path to wide string with null terminator.
        let path_wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        // SAFETY: `pszfilename` constructed from a pointer to null-terminated Vec.
        unsafe { persist.Load(PCWSTR(path_wide.as_ptr()), STGM(0)) }?;

        Ok(Self(link))
    }

    /// Retrieves the shortcut target.
    fn get_target(&self) -> Result<OsString, WinError> {
        let mut target = [0u16; MAX_PATH as usize];
        // SAFETY: Null is a valid argument for `pfd`.
        unsafe { self.0.GetPath(&mut target, std::ptr::null_mut(), 0) }?;

        // Strip the trailing nulls, including the null terminator.
        let target = target.split(|&c| c == 0).next().unwrap_or(&[]);
        Ok(OsString::from_wide(target))
    }

    /// Retrieves the shortcut AUMID.
    fn get_aumid(&self) -> Result<String, WinError> {
        let prop_store: IPropertyStore = self.0.cast()?;

        // SAFETY: `key` pointer derived from a reference.
        let pv = scopeguard::guard(
            unsafe { prop_store.GetValue(&PKEY_AppUserModel_ID) }?,
            |mut pv| {
                // SAFETY: `pvar` pointer derived from an owned reference.
                let _ = unsafe { PropVariantClear(&mut pv) };
            },
        );

        let mut aumid = [0u16; APPLICATION_USER_MODEL_ID_MAX_LENGTH as usize];
        // SAFETY: `propvar` pointer derived from a reference.
        unsafe { PropVariantToString(&*pv, &mut aumid) }?;

        // Strip the trailing nulls, including the null terminator.
        let aumid = aumid.split(|&c| c == 0).next().unwrap_or(&[]);
        Ok(String::from_utf16_lossy(aumid))
    }
}

mod canonicalized {
    //! Module includes utilities to ensure compared paths are canonicalized.

    use std::io;
    use std::path::{Path, PathBuf};

    #[derive(PartialEq, Eq, Debug)]
    pub(super) struct CanonPath(PathBuf);

    impl CanonPath {
        pub(super) fn new(path: impl AsRef<Path>) -> Result<Self, io::Error> {
            Ok(Self(path.as_ref().canonicalize()?))
        }
    }
}
