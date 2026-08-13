/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! # Taskbar Pinning
//!
//! This module abstracts over the WinRT and COM APIs to pin a given shortcut
//! with matching AppUserModelId (AUMID) to the Windows taskbar.

use crate::util::thread::{self, MainThreadGuard};
use nserror::{
    NS_ERROR_NOT_AVAILABLE, NS_ERROR_NOT_SAME_THREAD, NS_ERROR_UNEXPECTED, NS_OK, nsresult,
};
use nsstring::{nsAString, nsString};
use xpcom::{
    Promise, RefPtr,
    interfaces::{nsIWindowsShellService, nsIWritableVariant},
};

mod com;
mod winrt;

// Result from the attempt to pin to taskbar.
enum PinResult {
    // Pin request affirmed by user.
    Pinned,
    // Pin request rejected by user or system.
    Rejected,
    // Either returned before pin request was acted upon, or fell back to an API
    // where success isn't known.
    Unknown,
}

impl From<PinResult> for u8 {
    fn from(result: PinResult) -> Self {
        match result {
            PinResult::Pinned => nsIWindowsShellService::PINNED,
            PinResult::Rejected => nsIWindowsShellService::REJECTED,
            PinResult::Unknown => nsIWindowsShellService::UNKNOWN,
        }
    }
}

impl TryFrom<PinResult> for RefPtr<nsIWritableVariant> {
    type Error = nsresult;

    fn try_from(result: PinResult) -> Result<Self, Self::Error> {
        let variant = xpcom::create_instance::<nsIWritableVariant>(c"@mozilla.org/variant;1")
            .ok_or_else(|| {
                log::error!("Failed to create writable variant.");
                NS_ERROR_UNEXPECTED
            })?;

        // SAFETY: No invariants to uphold as parameter is POD.
        unsafe { variant.SetAsUint8(result.into()) }
            .to_result()
            .inspect_err(|e| log::error!("Failed to set Uint8 on nsIWritableVariant: {e:?}"))?;

        Ok(variant)
    }
}

/// Pins the shortcut with matching AUMID to the taskbar.
async fn pin_app(
    aumid: &nsAString,
    shortcut_path: &nsAString,
    fire_and_forget: bool,
    main_guard: MainThreadGuard,
) -> Result<PinResult, nsresult> {
    // Attempt to use the documented WinRT pinning API.
    let winrt_pin = winrt::pin_to_taskbar(aumid, fire_and_forget, main_guard).await;

    record_winrt_pin_telemetry(&winrt_pin);

    winrt_pin.or_else(|e| {
        use winrt::WinRtPinError::GetTaskbarManager;
        match e {
            GetTaskbarManager(_) => log::debug!("Error pinning with WinRT API: {e:?}"),
            _ => log::error!("Error pinning with WinRT API: {e:?}"),
        }

        // Fallback to undocumented COM API.
        com::modify_taskbar(com::PinOp::Pin, shortcut_path, main_guard)
    })
}

/// Records Glean telemetry for the attempted pin to taskbar using WinRT.
fn record_winrt_pin_telemetry(pin_result: &Result<PinResult, winrt::WinRtPinError>) {
    use firefox_on_glean::metrics::taskbar::{self, PinWinrtExtra};

    use PinResult::*;
    let metric_extra = match pin_result {
        Ok(Pinned) => "success_pinned",
        Ok(Rejected) => "success_rejected",
        Ok(Unknown) => "success_fire_and_forget",
        Err(e) => e.to_metric_taskbar_pin_winrt(),
    };

    taskbar::pin_winrt.record(PinWinrtExtra {
        result: Some(metric_extra.into()),
    });
}

/// FFI accessible interface to check if taskbar pinning APIs are available.
///
/// # Safety
///
/// No safety considerations, marked unsafe to satisfy FFI requirements.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shell_windows_taskbar_can_pin_to_taskbar() -> nsresult {
    let main_guard = match thread::get_main_thread_guard() {
        Some(m) => m,
        None => {
            log::error!("Must be called on main thread to check for pinning APIs.");
            return NS_ERROR_NOT_SAME_THREAD;
        }
    };

    match winrt::is_pinning_allowed() || com::is_pinning_available(main_guard) {
        true => NS_OK,
        false => NS_ERROR_NOT_AVAILABLE,
    }
}

/// FFI accessible interface to asynchronously pin a given shortcut and AUMID to
/// the taskbar.
///
/// # Safety
///
/// The caller is responsible for ensuring all pointers point to initialized
/// memory if non-null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shell_windows_taskbar_pin_app_to_taskbar(
    aumid: &nsAString,
    shortcut_path: &nsAString,
    fire_and_forget: bool,
    promise: &Promise,
) -> nsresult {
    let main_guard = match thread::get_main_thread_guard() {
        Some(m) => m,
        None => {
            log::error!("Pinning must be called from main thread to resolve DOM promise.");
            return NS_ERROR_NOT_SAME_THREAD;
        }
    };

    let aumid = nsString::from(aumid);
    let shortcut_path = nsString::from(shortcut_path);
    let promise = RefPtr::new(promise);

    moz_task::spawn_local("Pin to Taskbar", async move {
        let result: Result<RefPtr<nsIWritableVariant>, nsresult> =
            pin_app(&aumid, &shortcut_path, fire_and_forget, main_guard)
                .await
                .and_then(TryInto::try_into);

        match result {
            Ok(variant) => promise.resolve_with_variant(&variant),
            Err(e) => promise.reject_with_nsresult(e),
        }
    })
    .detach();

    NS_OK
}

/// FFI accessible interface to unpin a given shortcut from the taskbar.
///
/// # Safety
///
/// The caller is responsible for ensuring all pointers point to initialized
/// memory if non-null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn shell_windows_taskbar_unpin_shortcut_from_taskbar(
    shortcut_path: &nsAString,
) -> nsresult {
    let main_guard = match thread::get_main_thread_guard() {
        Some(m) => m,
        None => {
            log::error!(
                "Unpinning must be called from the main thread to ensure the underlying COM API is run from an STA thread."
            );
            return NS_ERROR_NOT_SAME_THREAD;
        }
    };

    match com::modify_taskbar(com::PinOp::UnPin, shortcut_path, main_guard) {
        Ok(_) => NS_OK,
        Err(e) => e,
    }
}
