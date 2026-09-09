/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Rust XPCOM implementation of `nsIWinBackgroundTaskRegistrar`.
//!
//! The MSIX-packaged counterpart to `nsIWinTaskSchedulerService`: registers
//! recurring Windows MSIX `TimeTrigger` tasks via the WinRT `Windows.ApplicationModel.Background`
//! APIs. Each task activates a COM server identified by a CLSID entry
//! point, which in turn launches `firefox.exe --backgroundtask <task>`.

use log::error;
use nserror::{nsresult, NS_ERROR_FAILURE, NS_ERROR_FILE_NOT_FOUND, NS_OK};
use nsstring::nsAString;
use windows::core::{Result as WindowsResult, HSTRING};
use windows::ApplicationModel::Background::{
    BackgroundTaskBuilder, BackgroundTaskRegistration, TimeTrigger,
};
use xpcom::{xpcom, xpcom_method};

/// Unregister every task whose name matches `name`, returning how many were
/// unregistered.
fn unregister_named_task(name: &HSTRING) -> WindowsResult<u32> {
    Ok(BackgroundTaskRegistration::AllTasks()?
        .into_iter()
        .filter_map(|entry| {
            let registration = entry
                .Value()
                .inspect_err(|e| error!("Failed to read background task registration: {e:?}"))
                .ok()?;

            let task_name = registration
                .Name()
                .inspect_err(|e| error!("Failed to read background task name: {e:?}"))
                .ok()?;

            if task_name != *name {
                return None;
            }

            registration
                .Unregister(true)
                .inspect_err(|e| error!("Failed to unregister background task: {e:?}"))
                .ok()
        })
        .count() as u32)
}

#[xpcom(implement(nsIWinBackgroundTaskRegistrar), nonatomic)]
struct WinBackgroundTaskRegistrar {}

impl WinBackgroundTaskRegistrar {
    xpcom_method!(
        register_task => RegisterTask(
            id: *const nsAString,
            interval_minutes: u32
        )
    );
    fn register_task(&self, id: &nsAString, interval_minutes: u32) -> Result<(), nsresult> {
        (|| -> WindowsResult<()> {
            let task_name = HSTRING::from_wide(id);

            // Replace any existing task with this name so the interval and entry
            // point are always up to date.
            unregister_named_task(&task_name)?;

            let builder = BackgroundTaskBuilder::new()?;
            builder.SetName(&task_name)?;
            builder.SetTaskEntryPoint(&HSTRING::from(
                mozbuild::config::MOZ_BACKGROUNDTASK_ACTIVATABLE_CLASS_ID,
            ))?;

            let trigger = TimeTrigger::Create(interval_minutes, false)?;
            builder.SetTrigger(&trigger)?;

            builder.Register()?;
            Ok(())
        })()
        .map_err(|e| {
            error!("Failed to register background task: {e:?}");
            NS_ERROR_FAILURE
        })
    }

    xpcom_method!(delete_task => DeleteTask(id: *const nsAString));
    fn delete_task(&self, id: &nsAString) -> Result<(), nsresult> {
        let task_name = HSTRING::from_wide(id);
        // Match the classic Task Scheduler impl, which returns
        // NS_ERROR_FILE_NOT_FOUND when the task does not exist.
        match unregister_named_task(&task_name) {
            Ok(0) => Err(NS_ERROR_FILE_NOT_FOUND),
            Ok(_) => Ok(()),
            Err(e) => {
                error!("Failed to delete background task: {e:?}");
                Err(NS_ERROR_FAILURE)
            }
        }
    }

    xpcom_method!(delete_all_tasks => DeleteAllTasks());
    fn delete_all_tasks(&self) -> Result<(), nsresult> {
        (|| -> WindowsResult<()> {
            for entry in BackgroundTaskRegistration::AllTasks()? {
                entry.Value()?.Unregister(true)?;
            }
            Ok(())
        })()
        .map_err(|e| {
            error!("Failed to delete all background tasks: {e:?}");
            NS_ERROR_FAILURE
        })
    }

    xpcom_method!(task_exists => TaskExists(id: *const nsAString) -> bool);
    fn task_exists(&self, id: &nsAString) -> Result<bool, nsresult> {
        let task_name = HSTRING::from_wide(id);
        (|| -> WindowsResult<bool> {
            for entry in BackgroundTaskRegistration::AllTasks()? {
                let registration = entry.Value()?;
                if registration.Name()? == task_name {
                    return Ok(true);
                }
            }
            Ok(false)
        })()
        .map_err(|e| {
            error!("Failed to check whether background task exists: {e:?}");
            NS_ERROR_FAILURE
        })
    }
}

/// Constructor to allow the `nsIWinBackgroundTaskRegistrar` to be created
/// through the C ABI.
///
/// # Safety
///
/// This function must be called with valid `iid` and `result` pointers.
#[unsafe(no_mangle)]
pub extern "C" fn taskscheduler_new_win_background_task_registrar(
    iid: &xpcom::nsIID,
    result: *mut *mut xpcom::reexports::libc::c_void,
) -> nsresult {
    let instance = WinBackgroundTaskRegistrar::allocate(InitWinBackgroundTaskRegistrar {});
    // SAFETY: The caller is responsible to pass a valid IID and pointer-to-pointer.
    unsafe { instance.QueryInterface(iid, result) }
}
