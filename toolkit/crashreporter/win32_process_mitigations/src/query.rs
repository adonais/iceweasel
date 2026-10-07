/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Queries the Windows registry for the process mitigation options that are configured on
//! the system, both the per-application Exploit Protection settings and the system-wide
//! defaults.

use super::error::MitigationOptionsError;
use super::registry::{RegKey, RegValue};

use std::ffi::OsStr;
use std::path::Path;

/// Subkey holding the per-application Exploit Protection ("Program settings") configuration
const EXPLOIT_PROTECTION_SUBKEY: &str =
    "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options";

/// Subkey holding the system-wide ("System settings") process mitigation defaults
const KERNEL_SUBKEY: &str = "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel";

/// Name of the value, in either subkey, that contains the mitigation options bitmask
const MITIGATION_VALUE_NAME: &str = "MitigationOptions";

/// Name of the value that opts a per-application key into path-filter processing
const USE_FILTER_VALUE_NAME: &str = "UseFilter";

/// Name of the value, in a filter subkey, holding the image path that subkey applies to
const FILTER_FULL_PATH_VALUE_NAME: &str = "FilterFullPath";

/// Width we store the `MitigationOptions` bitmask at. Every mitigation occupies a
/// nibble-aligned 2-bit field, and bit 0 is the least-significant bit of byte 0.
///
/// Windows 11 24H2 writes 24 bytes (`DisableFsctlSystemCalls` alone lives at bit 156,
/// i.e. byte 19), so this must stay comfortably above that; 32 leaves room for the next
/// batch of mitigations. Anything wider than this is logged and truncated.
const MITIGATION_OPTIONS_LEN: usize = 32;

/// A raw `MitigationOptions` bitmask, stored as its little-endian registry bytes.
#[derive(Clone, Copy, Debug, Default)]
pub struct MitigationOptions {
    bytes: [u8; MITIGATION_OPTIONS_LEN],
    /// How many of `bytes` the registry actually supplied. Purely presentational: it
    /// keeps the annotation the same width as the value on disk rather than padding it
    /// out with zeroes that were never there.
    len: usize,
}

/// `len` is presentational only, and every byte past it is zero, so two bitmasks that
/// differ only in width describe the same mitigations.
impl PartialEq for MitigationOptions {
    fn eq(&self, other: &Self) -> bool {
        self.bytes == other.bytes
    }
}

impl MitigationOptions {
    /// The raw little-endian bytes of the bitmask, zero-padded to the storage width.
    pub fn bytes(&self) -> &[u8; MITIGATION_OPTIONS_LEN] {
        &self.bytes
    }

    /// Copy the little-endian registry bytes into the fixed-width bitmask.
    ///
    /// Any bytes beyond that width are unexpected; they are logged and ignored.
    pub(crate) fn from_bytes(bytes: &[u8]) -> Self {
        if bytes.len() > MITIGATION_OPTIONS_LEN {
            log::warn!(
                "MitigationOptions value is {} bytes, wider than the expected {}; ignoring the excess",
                bytes.len(),
                MITIGATION_OPTIONS_LEN
            );
        }

        let len = bytes.len().min(MITIGATION_OPTIONS_LEN);
        let mut padded = [0u8; MITIGATION_OPTIONS_LEN];
        padded[..len].copy_from_slice(&bytes[..len]);

        MitigationOptions { bytes: padded, len }
    }

    /// Combine the system-wide and per-application bitmasks.
    ///
    /// Each mitigation is an independent nibble-aligned 2-bit field, and a per-application
    /// field that is set at all overrides the system-wide one; where the application
    /// configures nothing, the system-wide value applies. This includes byte 0, which holds
    /// the DEP and SEHOP fields and is not special despite what the single-bit
    /// `PROCESS_CREATION_MITIGATION_POLICY_DEP_*` constants in WinBase.h suggest.
    pub fn amalgamate(system: Option<Self>, app: Option<Self>) -> Option<Self> {
        fn combine_nibble(system: u8, app: u8) -> u8 {
            if app != 0 {
                app
            } else {
                system
            }
        }
        match (system, app) {
            (Some(system), Some(app)) => {
                let mut bytes = system.bytes;
                for (byte, app_byte) in bytes.iter_mut().zip(app.bytes.iter()) {
                    let high = combine_nibble(*byte & 0xf0, app_byte & 0xf0);
                    let low = combine_nibble(*byte & 0x0f, app_byte & 0x0f);
                    *byte = high | low;
                }
                Some(MitigationOptions {
                    bytes,
                    len: system.len.max(app.len),
                })
            }
            (system, app) => system.or(app),
        }
    }
}

impl std::fmt::Display for MitigationOptions {
    /// Render the raw bitmask as space-separated hex bytes in registry (little-endian) byte
    /// order, so byte 0 prints first. Only the bytes the registry supplied are printed, so a
    /// DEP-enabled value from a 24-byte registry entry reads `01` followed by 23 `00`s.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut it = self.bytes[..self.len].iter().peekable();
        while let Some(byte) = it.next() {
            write!(f, "{byte:02x}")?;
            if it.peek().is_some() {
                write!(f, " ")?;
            }
        }
        Ok(())
    }
}

/// Query the per-application mitigation options configured for `process_path`.
///
/// `process_path` is the full path of the executable (usually something like `C:\Program
/// Files\Mozilla Firefox\firefox.exe`). Its file name (firefox.exe) selects the Exploit Protection
/// key, using the same case-insensitive matching the Windows Registry uses itself, and the full
/// path is what the path filters below are matched against.
///
/// # Path filters
///
/// Path filtering occurs when the key has a non-zero UseFilter value, in which case its subkeys are
/// looked at, and the first one whose FilterFullPath value matches the *full* path replaces the
/// key's own settings. If no subkey matches, we're back to the parent value. That's how we can have
/// mitigations for full paths.
///
/// Returns `None` if no per-application configuration applies to this executable.
pub fn get_app_mitigation_options(
    process_path: impl AsRef<Path>,
) -> Result<Option<MitigationOptions>, MitigationOptionsError> {
    let process_path = process_path.as_ref();

    let Some(file_name) = process_path.file_name() else {
        return Ok(None);
    };

    let Some(key) = RegKey::root_local_machine().try_open_subkey(EXPLOIT_PROTECTION_SUBKEY)? else {
        return Ok(None);
    };

    let Some(process_key) = key.try_open_subkey(file_name)? else {
        return Ok(None);
    };

    let key = find_filter_subkey(&process_key, process_path)?.unwrap_or(process_key);
    read_mitigation_options(&key)
}

/// Whether a per-application key opts into path-filter processing.
fn uses_path_filters(key: &RegKey) -> Result<bool, MitigationOptionsError> {
    Ok(matches!(
        key.try_get_value(USE_FILTER_VALUE_NAME)?,
        Some(RegValue::Dword(value)) if value != 0
    ))
}

/// Find the filter subkey that applies to `process_path` and read its options.
fn find_filter_subkey(
    process_key: &RegKey,
    process_path: &Path,
) -> Result<Option<RegKey>, MitigationOptionsError> {
    if !uses_path_filters(process_key)? {
        return Ok(None);
    }
    for subkey_name in process_key.subkey_names() {
        let subkey_name = subkey_name?;

        // The registry can change under us. A filter we can no longer open is simply one
        // we cannot match against, which is not worth losing the whole annotation over.
        let Some(subkey) = process_key.try_open_subkey(&subkey_name)? else {
            log::warn!(
                "mitigation filter {:?} disappeared while it was being read",
                subkey_name
            );
            continue;
        };

        let Some(RegValue::String(filter_path)) =
            subkey.try_get_value(FILTER_FULL_PATH_VALUE_NAME)?
        else {
            continue;
        };

        if paths_match(&filter_path, process_path) {
            return Ok(Some(subkey));
        }
    }

    Ok(None)
}

/// Compare a filter's path against ours the way Windows would.
///
/// Best effort: Windows matches paths case-insensitively, but the same file can still be
/// spelled differently (8.3 short names, substituted drives, symlinks) and we do not try to
/// canonicalize either side.
fn paths_match(filter_path: &OsStr, process_path: &Path) -> bool {
    filter_path.to_string_lossy().to_lowercase()
        == process_path.as_os_str().to_string_lossy().to_lowercase()
}

/// Query the system-wide default mitigation options.
///
/// Returns `None` if no system-wide configuration exists.
pub fn get_system_mitigation_options() -> Result<Option<MitigationOptions>, MitigationOptionsError>
{
    match RegKey::root_local_machine().try_open_subkey(KERNEL_SUBKEY)? {
        Some(key) => read_mitigation_options(&key),
        None => Ok(None),
    }
}

/// Read the `MitigationOptions` bitmask from a key.
///
/// Returns `None` if the value is absent or not a bitmask-shaped type.
fn read_mitigation_options(
    key: &RegKey,
) -> Result<Option<MitigationOptions>, MitigationOptionsError> {
    Ok(match key.try_get_value(MITIGATION_VALUE_NAME)? {
        Some(RegValue::Binary(bytes)) => Some(MitigationOptions::from_bytes(&bytes)),
        Some(RegValue::Qword(value)) => Some(MitigationOptions::from_bytes(&value.to_le_bytes())),
        Some(RegValue::Dword(value)) => Some(MitigationOptions::from_bytes(&value.to_le_bytes())),
        Some(RegValue::String(_)) | None => None,
    })
}

#[cfg(test)]
mod tests {
    use super::{MitigationOptions, MITIGATION_OPTIONS_LEN};

    #[test]
    fn bytes_are_little_endian() {
        assert_eq!(MitigationOptions::from_bytes(&[0x01]).bytes[0], 0x01);
        assert_eq!(MitigationOptions::from_bytes(&[0x00, 0x01]).bytes[1], 0x01);
        // Byte 10, bit 4 is bit 84, as checked by the old win32k conflict detection.
        assert_eq!(
            MitigationOptions::from_bytes(&[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10]).bytes[10],
            0x10
        );
    }

    #[test]
    fn the_real_registry_width_fits() {
        // Windows 11 24H2 writes 24 bytes, and DisableFsctlSystemCalls (bit 156) lives in
        // byte 19 of them, well past the 16 bytes this used to assume.
        let mut bytes = vec![0u8; 24];
        bytes[19] = 0x10;

        let options = MitigationOptions::from_bytes(&bytes);
        assert_eq!(options.len, 24);
        assert_eq!(options.bytes[19], 0x10);
    }

    #[test]
    fn excess_bytes_are_ignored() {
        let bytes = vec![0xffu8; MITIGATION_OPTIONS_LEN + 1];
        assert_eq!(
            MitigationOptions::from_bytes(&bytes).bytes,
            [0xff; MITIGATION_OPTIONS_LEN]
        );
    }

    #[test]
    fn hex_is_little_endian_space_separated() {
        // Only the bytes the registry supplied are printed.
        assert_eq!(format!("{}", MitigationOptions::from_bytes(&[])), "");
        // DEP is bit 0, so byte 0 reads 0x01 and prints first.
        assert_eq!(
            format!("{}", MitigationOptions::from_bytes(&[0x01, 0x00])),
            "01 00"
        );
        // Bit 84 is byte 10, bit 4 (0x10); byte 10 prints eleventh from the left.
        assert_eq!(
            format!(
                "{}",
                MitigationOptions::from_bytes(&[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10])
            ),
            "00 00 00 00 00 00 00 00 00 00 10"
        );
    }

    #[test]
    fn amalgamate_per_field() {
        // System forces HighEntropy off; the app forces it on -> app wins. The app does not
        // configure BottomUp, so the system's on value applies. Both directions were
        // confirmed against the kernel on Windows 11 24H2.
        let app = MitigationOptions::from_bytes(&(1u128 << 20).to_le_bytes()); // HighEntropy on
        let system = MitigationOptions::from_bytes(&((2u128 << 20) | (1u128 << 16)).to_le_bytes()); // HighEntropy off, BottomUp on

        let amalgam = MitigationOptions::amalgamate(Some(system), Some(app)).unwrap();
        assert_eq!(amalgam, MitigationOptions::from_bytes(&[0, 0, 0x11]));
    }

    #[test]
    fn amalgamate_does_not_special_case_byte_zero() {
        // Byte 0 holds the DEP and SEHOP fields, and they override exactly like the rest:
        // the system enables DEP with ATL thunk emulation (nibble 0 = 3) and SEHOP
        // (nibble 1 = 1), the app forces DEP off (nibble 0 = 2) and says nothing about
        // SEHOP, so the result is DEP off, SEHOP on.
        let system = MitigationOptions::from_bytes(&[0x13]);
        let app = MitigationOptions::from_bytes(&[0x02]);

        let amalgam = MitigationOptions::amalgamate(Some(system), Some(app)).unwrap();
        assert_eq!(amalgam, MitigationOptions::from_bytes(&[0x12]));
    }

    #[test]
    fn amalgamate_keeps_the_widest_value() {
        let system = MitigationOptions::from_bytes(&[0u8; 24]);
        let app = MitigationOptions::from_bytes(&[0x01]);

        let amalgam = MitigationOptions::amalgamate(Some(system), Some(app)).unwrap();
        assert_eq!(amalgam.len, 24);
    }

    #[test]
    fn amalgamate_passes_through_a_lone_value() {
        let options = MitigationOptions::from_bytes(&[0x01]);

        assert_eq!(
            MitigationOptions::amalgamate(Some(options), None),
            Some(options)
        );
        assert_eq!(
            MitigationOptions::amalgamate(None, Some(options)),
            Some(options)
        );
        assert_eq!(MitigationOptions::amalgamate(None, None), None);
    }
}
