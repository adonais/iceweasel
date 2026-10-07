/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Decodes a `MitigationOptions` bitmask into a human-readable summary.
//!
//! Since the register keys are pretty much undocumented, the data in this module comes from a
//! mixture of sources:
//!
//! * The `PROCESS_CREATION_MITIGATION_POLICY*` constants in WinBase.h (not
//!   exported to their windows-sys crates), that describes relevant but NOT identical data, as
//!   discovered through experimentation
//! * Some data compiled by a stranger on the Internet:
//!   <https://theryuu.github.io/ifeo-mitigationoptions.txt>
//! * Finally, what we could extract ourselves through experimentation in a Windows VM. See
//!   `scripts/Calibrate-MitigationOptions.ps1`, which is where every offset and variant below
//!   comes from; the table was last calibrated against Windows 11 24H2 (build 26100).
//!
//! Note that the `Audit*` mitigations do not appear here at all: they are written to a
//! sibling `MitigationAuditOptions` registry value, which we do not read.

use super::query::MitigationOptions;

/// Read the 2-bit field at absolute bit `shift` from the little-endian bytes. Every field is
/// nibble-aligned, so it never straddles a byte boundary.
fn field(bytes: &[u8], shift: u32) -> u8 {
    match bytes.get((shift / 8) as usize) {
        Some(byte) => (byte >> (shift % 8)) & 0b11,
        None => 0,
    }
}

/// The mitigations, as (name, absolute bit shift, label for the field's value-3 state).
///
/// Every mitigation is a nibble-aligned 2-bit field: 1 = on, 2 = off, and 3 = the variant
/// named here, which is generally a modifier flag that cannot be set on its own. `None`
/// means no value-3 state is known. Names match the `Get-ProcessMitigation` /
/// `Set-ProcessMitigation` parameters so the annotation can be cross-checked against those
/// cmdlets.
///
/// Note that DEP and SEHOP are ordinary fields here. The single-bit
/// `PROCESS_CREATION_MITIGATION_POLICY_DEP_*` constants in WinBase.h describe the runtime
/// policy layout, not this one: in the registry, `EmulateAtlThunks` is DEP's value-3 state
/// and writes nothing at all on its own.
const FIELDS: &[(&str, u32, Option<&str>)] = &[
    ("DEP", 0, Some("EmulateAtlThunks")),
    ("SEHOP", 4, Some("SEHOPTelemetry")),
    ("ForceRelocateImages", 8, Some("RequireInfo")),
    ("TerminateOnError", 12, None),
    ("BottomUp", 16, None),
    ("HighEntropy", 20, None),
    ("StrictHandle", 24, None),
    ("DisableWin32kSystemCalls", 28, None),
    ("DisableExtensionPoints", 32, None),
    // AllowThreadsToOptOut writes nothing to this value, alone or combined, so nibble 9 has
    // no known value-3 state.
    ("BlockDynamicCode", 36, None),
    // Disabling CFG also forces StrictCFG's nibble to "off", so a CFG=off configuration
    // legitimately decodes as both.
    ("CFG", 40, Some("SuppressExports")),
    ("MicrosoftSignedOnly", 44, Some("AllowStoreSignedBinaries")),
    // AuditFont writes to MitigationAuditOptions, so this has no value-3 state either.
    // One of the few mitigations Microsoft documents here:
    // <https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/feature-to-block-untrusted-fonts>
    ("DisableNonSystemFonts", 48, None),
    ("BlockRemoteImageLoads", 52, None),
    ("BlockLowLabelImageLoads", 56, None),
    ("PreferSystem32", 60, None),
    // EnforceModuleDependencySigning also lights nibble 27 (bit 108) on top of its bit 68
    // below, so that bit is deliberately left unmapped to avoid reporting it twice.
    ("EnforceModuleDependencySigning", 68, None),
    ("StrictCFG", 72, None),
    ("EnableRopStackPivot", 80, None),
    ("EnableRopCallerCheck", 84, None),
    ("EnableRopSimExec", 88, None),
    ("EnableExportAddressFilter", 92, None),
    ("EnableExportAddressFilterPlus", 96, None),
    ("DisallowChildProcessCreation", 100, None),
    ("EnableImportAddressFilter", 104, None),
    ("UserShadowStack", 124, Some("StrictMode")),
    ("DisableFsctlSystemCalls", 156, None),
];

impl MitigationOptions {
    /// Render the options as a single comma-separated `Name=state` list.
    ///
    /// Only mitigations that are explicitly forced on or off (non-default) appear; This is
    /// best effort, some nuances might not be represented.
    pub fn describe(&self) -> String {
        let bytes = self.bytes();
        let mut parts = Vec::new();

        for (name, shift, variant) in FIELDS {
            let state = match field(bytes, *shift) {
                1 => "on",
                2 => "off",
                3 => variant.unwrap_or("reserved"),
                _ => continue,
            };
            parts.push(format!("{name}={state}"));
        }

        parts.join(", ")
    }
}

#[cfg(test)]
mod tests {
    use crate::query::MitigationOptions;

    fn opts(bits: u128) -> MitigationOptions {
        MitigationOptions::from_bytes(&bits.to_le_bytes())
    }

    #[test]
    fn dep_and_sehop_are_ordinary_fields() {
        // Byte 0 = 0x13: DEP's nibble is 3 (on, with ATL thunk emulation) and SEHOP's is 1.
        assert_eq!(
            MitigationOptions::from_bytes(&[0x13]).describe(),
            "DEP=EmulateAtlThunks, SEHOP=on"
        );
        assert_eq!(
            MitigationOptions::from_bytes(&[0x31]).describe(),
            "DEP=on, SEHOP=SEHOPTelemetry"
        );
    }

    #[test]
    fn dep_forced_off_is_not_emulate_atl_thunks() {
        // Regression test: treating byte 0 as single bits decoded DEP's "off" nibble (2) as
        // the ATL thunk bit being set, reporting a mitigation as on when it was forced off.
        assert_eq!(MitigationOptions::from_bytes(&[0x02]).describe(), "DEP=off");
        assert_eq!(
            MitigationOptions::from_bytes(&[0x20]).describe(),
            "SEHOP=off"
        );
    }

    #[test]
    fn on_off_and_variant_fields() {
        // ForceRelocateImages (shift 8) = on, HighEntropy (shift 20) = off, CFG (shift 40)
        // = 3 -> its variant, DisableNonSystemFonts (shift 48) = 3 -> it has no known
        // variant, and a value-3 field with no variant either (StrictHandle, shift 24).
        let bits = (1u128 << 8) | (2u128 << 20) | (3u128 << 40) | (3u128 << 48) | (3u128 << 24);
        assert_eq!(
            opts(bits).describe(),
            "ForceRelocateImages=on, HighEntropy=off, StrictHandle=reserved, \
             CFG=SuppressExports, DisableNonSystemFonts=reserved"
        );
    }

    #[test]
    fn policy2_high_qword() {
        // In the registry layout UserShadowStack (CET) lives at absolute bit 124...
        assert_eq!(opts(1u128 << 124).describe(), "UserShadowStack=on");
        // ...while bit 92, where the runtime POLICY2 layout would put CET shadow stacks, is
        // actually EnableExportAddressFilter.
        assert_eq!(opts(1u128 << 92).describe(), "EnableExportAddressFilter=on");
    }

    #[test]
    fn decodes_beyond_the_first_sixteen_bytes() {
        // DisableFsctlSystemCalls is at bit 156, i.e. byte 19: past where a 128-bit bitmask
        // could reach at all.
        let mut bytes = vec![0u8; 24];
        bytes[19] = 0x10;
        assert_eq!(
            MitigationOptions::from_bytes(&bytes).describe(),
            "DisableFsctlSystemCalls=on"
        );
    }

    #[test]
    fn decodes_real_world_amalgam() {
        // The exact WindowsProcessMitigationsBytes from a content-process crash on a machine
        // configured with DEP + ATL thunk, ForceRelocateImages off and
        // EnforceModuleDependencySigning + UserShadowStack (system-wide), plus SEHOP (per app).
        let bytes = [
            0x13, 0x02, 0, 0, 0, 0, 0, 0, 0x10, 0, 0, 0, 0, 0x10, 0, 0x10,
        ];
        assert_eq!(
            MitigationOptions::from_bytes(&bytes).describe(),
            "DEP=EmulateAtlThunks, SEHOP=on, ForceRelocateImages=off, \
             EnforceModuleDependencySigning=on, UserShadowStack=on"
        );
    }

    #[test]
    fn decodes_everything_enabled_at_once() {
        // Set-ProcessMitigation -Enable <every flag it accepts>, read back from the registry
        // on Windows 11 24H2. See scripts/Calibrate-MitigationOptions.ps1.
        let bytes = [
            0x33, 0x13, 0x11, 0x11, 0x11, 0x33, 0x11, 0x11, 0x10, 0x01, 0x11, 0x11, 0x11, 0x11,
            0x00, 0x30, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00,
        ];
        assert_eq!(
            MitigationOptions::from_bytes(&bytes).describe(),
            "DEP=EmulateAtlThunks, SEHOP=SEHOPTelemetry, ForceRelocateImages=RequireInfo, \
             TerminateOnError=on, BottomUp=on, HighEntropy=on, StrictHandle=on, \
             DisableWin32kSystemCalls=on, DisableExtensionPoints=on, BlockDynamicCode=on, \
             CFG=SuppressExports, MicrosoftSignedOnly=AllowStoreSignedBinaries, \
             DisableNonSystemFonts=on, BlockRemoteImageLoads=on, BlockLowLabelImageLoads=on, \
             PreferSystem32=on, EnforceModuleDependencySigning=on, StrictCFG=on, \
             EnableRopStackPivot=on, EnableRopCallerCheck=on, EnableRopSimExec=on, \
             EnableExportAddressFilter=on, EnableExportAddressFilterPlus=on, \
             DisallowChildProcessCreation=on, EnableImportAddressFilter=on, \
             UserShadowStack=StrictMode, DisableFsctlSystemCalls=on"
        );
    }
}
