#[cfg(feature = "windows")]
mod os {
    pub use windows::Win32::Foundation::GetLastError;
    pub use windows::Win32::Foundation::HANDLE;
    pub use windows::Win32::Foundation::PSTR;
    pub use windows::Win32::System::Threading::{
        AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsA,
    };

    pub fn ok(rv: windows::Win32::Foundation::BOOL) -> bool {
        rv.as_bool()
    }

    pub fn invalid_handle(handle: HANDLE) -> bool {
        handle.is_invalid()
    }
}
#[cfg(feature = "winapi")]
mod os {
    pub use winapi::shared::ntdef::HANDLE;
    pub use winapi::um::errhandlingapi::GetLastError;
}

use crate::AudioThreadPriorityError;
use log::info;

#[cfg(feature = "winapi")]
use once_cell::sync::OnceCell;
#[cfg(feature = "winapi")]
use self::avrt_lib::AvRtLibrary;

#[derive(Debug)]
pub struct RtPriorityHandleInternal {
    mmcss_task_index: u32,
    task_handle: os::HANDLE,
}

impl RtPriorityHandleInternal {
    pub fn new(mmcss_task_index: u32, task_handle: os::HANDLE) -> RtPriorityHandleInternal {
        RtPriorityHandleInternal {
            mmcss_task_index,
            task_handle,
        }
    }
}

#[cfg(feature = "windows")]
pub fn demote_current_thread_from_real_time_internal(
    rt_priority_handle: RtPriorityHandleInternal,
) -> Result<(), AudioThreadPriorityError> {
    let rv = unsafe { os::AvRevertMmThreadCharacteristics(rt_priority_handle.task_handle) };
    if !os::ok(rv) {
        return Err(AudioThreadPriorityError::new(&format!(
            "Unable to restore the thread priority ({:?})",
            unsafe { os::GetLastError() }
        )));
    }

    info!(
        "task {} priority restored.",
        rt_priority_handle.mmcss_task_index
    );

    Ok(())
}

#[cfg(feature = "windows")]
pub fn promote_current_thread_to_real_time_internal(
    _audio_buffer_frames: u32,
    _audio_samplerate_hz: u32,
) -> Result<RtPriorityHandleInternal, AudioThreadPriorityError> {
    let mut task_index = 0u32;

    let handle =
        unsafe { os::AvSetMmThreadCharacteristicsA(os::PSTR("Audio\0".as_ptr()), &mut task_index) };
    let handle = RtPriorityHandleInternal::new(task_index, handle);

    if os::invalid_handle(handle.task_handle) {
        return Err(AudioThreadPriorityError::new(&format!(
            "Unable to restore the thread priority ({:?})",
            unsafe { os::GetLastError() }
        )));
    }

    info!(
        "task {} bumped to real time priority.",
        handle.mmcss_task_index
    );

    Ok(handle)
}

#[cfg(feature = "winapi")]
fn avrt() -> Result<&'static AvRtLibrary, AudioThreadPriorityError> {
    static AV_RT_LIBRARY: OnceCell<Result<AvRtLibrary, winapi::shared::minwindef::DWORD>> = OnceCell::new();
    AV_RT_LIBRARY
        .get_or_init(AvRtLibrary::try_new)
        .as_ref()
        .map_err(|win32_error| {
            AudioThreadPriorityError::new(&format!("Unable to load avrt.dll ({win32_error})"))
        })
}

#[cfg(feature = "winapi")]
pub fn promote_current_thread_to_real_time_internal(
    _audio_buffer_frames: u32,
    _audio_samplerate_hz: u32,
) -> Result<RtPriorityHandleInternal, AudioThreadPriorityError> {
    avrt()?
        .set_mm_thread_characteristics("Audio")
        .map(|(mmcss_task_index, task_handle)| {
            info!("task {mmcss_task_index} bumped to real time priority.");
            RtPriorityHandleInternal::new(mmcss_task_index, task_handle)
        })
        .map_err(|win32_error| {
            AudioThreadPriorityError::new(&format!(
                "Unable to bump the thread priority ({win32_error})"
            ))
        })
}

#[cfg(feature = "winapi")]
pub fn demote_current_thread_from_real_time_internal(
    rt_priority_handle: RtPriorityHandleInternal,
) -> Result<(), AudioThreadPriorityError> {
    let RtPriorityHandleInternal {
        mmcss_task_index,
        task_handle,
    } = rt_priority_handle;
    avrt()?
        .revert_mm_thread_characteristics(task_handle)
        .map(|_| {
            info!("task {mmcss_task_index} priority restored.");
        })
        .map_err(|win32_error| {
            AudioThreadPriorityError::new(&format!(
                "Unable to restore the thread priority for task {mmcss_task_index} ({win32_error})"
            ))
        })
}

#[cfg(feature = "winapi")]
mod avrt_lib {
    use super::win32_utils::{win32_error_if, OwnedLibrary};
    use std::sync::Once;
    use winapi::shared::{minwindef::{BOOL, DWORD}, ntdef::HANDLE};

    type AvSetMmThreadCharacteristicsAFn = unsafe extern "system" fn(*const i8, *mut u32) -> HANDLE;
    type AvRevertMmThreadCharacteristicsFn = unsafe extern "system" fn(HANDLE) -> BOOL;

    pub(super) struct AvRtLibrary {
        // This field is never read because only used for its Drop behavior
        #[allow(dead_code)]
        module: OwnedLibrary,

        av_set_mm_thread_characteristics_a: AvSetMmThreadCharacteristicsAFn,
        av_revert_mm_thread_characteristics: AvRevertMmThreadCharacteristicsFn,
    }

    impl AvRtLibrary {
        pub(super) fn try_new() -> Result<Self, DWORD> {
            let module = OwnedLibrary::try_new("avrt.dll\0")?;
            let av_set_mm_thread_characteristics_a = unsafe {
                std::mem::transmute::<_, AvSetMmThreadCharacteristicsAFn>(
                    module.get_proc("AvSetMmThreadCharacteristicsA\0")?,
                )
            };
            let av_revert_mm_thread_characteristics = unsafe {
                std::mem::transmute::<_, AvRevertMmThreadCharacteristicsFn>(
                    module.get_proc("AvRevertMmThreadCharacteristics\0")?,
                )
            };
            Ok(Self {
                module,
                av_set_mm_thread_characteristics_a,
                av_revert_mm_thread_characteristics,
            })
        }

        pub(super) fn set_mm_thread_characteristics(
            &self,
            task_name: &str,
        ) -> Result<(u32, HANDLE), DWORD> {
            // Ensure that the first call never runs in parallel with other calls. This
            // seems necessary to guarantee the success of these other calls. We saw them
            // fail with an error code of ERROR_PATH_NOT_FOUND in tests, presumably on a
            // machine where the MMCSS service was initially inactive.
            static FIRST_CALL: Once = Once::new();
            let mut first_call_result = None;
            FIRST_CALL.call_once(|| {
                first_call_result = Some(self.set_mm_thread_characteristics_internal(task_name))
            });
            first_call_result
                .unwrap_or_else(|| self.set_mm_thread_characteristics_internal(task_name))
        }

        fn set_mm_thread_characteristics_internal(
            &self,
            task_name: &str,
        ) -> Result<(u32, HANDLE), DWORD> {
            let mut mmcss_task_index = 0u32;
            let task_name_cstr = format!("{task_name}\0");
            let task_handle = unsafe {
                (self.av_set_mm_thread_characteristics_a)(task_name_cstr.as_ptr() as *const i8, &mut mmcss_task_index)
            };
            win32_error_if(task_handle.is_null())?;
            Ok((mmcss_task_index, task_handle))
        }

        pub(super) fn revert_mm_thread_characteristics(
            &self,
            handle: HANDLE,
        ) -> Result<(), DWORD> {
            let rv = unsafe { (self.av_revert_mm_thread_characteristics)(handle) };
            win32_error_if(rv == 0)
        }
    }
}

#[cfg(feature = "winapi")]
mod win32_utils {
    use winapi::{
        shared::minwindef::{DWORD, HMODULE},
        um::{
            errhandlingapi::GetLastError,
            libloaderapi::{FreeLibrary, GetProcAddress, LoadLibraryA},
        },
    };

    pub(super) fn win32_error_if(condition: bool) -> Result<(), DWORD> {
        if condition {
            Err(unsafe { GetLastError() })
        } else {
            Ok(())
        }
    }

    pub(super) struct OwnedLibrary(HMODULE);

    // SAFETY: HMODULE is safe to share between threads as it's just a handle to a loaded library
    unsafe impl Send for OwnedLibrary {}
    unsafe impl Sync for OwnedLibrary {}

    impl OwnedLibrary {
        pub(super) fn try_new(lib_file_name: &str) -> Result<Self, DWORD> {
            let module = unsafe { LoadLibraryA(lib_file_name.as_ptr() as *const i8) };
            win32_error_if(module.is_null())?;
            Ok(Self(module))
        }

        fn raw(&self) -> HMODULE {
            self.0
        }

        /// SAFETY: The caller must transmute the value wrapped in a Ok(_) to the correct
        ///         function type, with the correct extern specifier.
        pub(super) unsafe fn get_proc(
            &self,
            proc_name: &str,
        ) -> Result<unsafe extern "system" fn() -> isize, DWORD> {
            let proc = unsafe { GetProcAddress(self.raw(), proc_name.as_ptr() as *const i8) };
            win32_error_if(proc.is_null())?;
            Ok(std::mem::transmute(proc))
        }
    }

    impl Drop for OwnedLibrary {
        fn drop(&mut self) {
            unsafe {
                FreeLibrary(self.raw());
            }
        }
    }
}
