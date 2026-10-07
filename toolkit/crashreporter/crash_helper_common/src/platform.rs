/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#[cfg(target_os = "windows")]
pub use windows::{
    server_addr, PlatformError, ProcessHandle, RawProcessHandle, RawThreadHandle, ThreadHandle,
};

#[cfg(target_os = "windows")]
pub(crate) use windows::PROCESS_RENDEZVOUS_ANCILLARY_DATA_LEN;

#[cfg(target_os = "windows")]
pub(crate) mod windows;

#[cfg(any(target_os = "android", target_os = "linux"))]
pub use linux::{PlatformError, ProcessHandle, RawProcessHandle, RawThreadHandle, ThreadHandle};

#[cfg(any(target_os = "android", target_os = "linux"))]
pub(crate) use linux::PROCESS_RENDEZVOUS_ANCILLARY_DATA_LEN;

#[cfg(any(target_os = "android", target_os = "linux"))]
pub(crate) mod linux;

#[cfg(any(target_os = "macos", target_os = "ios"))]
pub use mach::{
    mach_msg_recv, mach_msg_send, AsRawPort, MachMessageWrapper, MachPortRight, PlatformError,
    ProcessHandle, RawProcessHandle, RawThreadHandle, ReceiveRight, SendRight, SendRightRef,
    ThreadHandle,
};

#[cfg(any(target_os = "macos", target_os = "ios"))]
pub(crate) use mach::PROCESS_RENDEZVOUS_ANCILLARY_DATA_LEN;

#[cfg(any(target_os = "macos", target_os = "ios"))]
pub(crate) mod mach;

#[cfg(any(target_os = "android", target_os = "linux", target_os = "macos"))]
#[macro_export]
macro_rules! ignore_eintr {
    ($c:expr) => {
        loop {
            match $c {
                Err(nix::errno::Errno::EINTR) => continue,
                res => break res,
            }
        }
    };
}

pub trait AsRawProcessHandle {
    fn as_raw_handle(&self) -> RawProcessHandle;
}

pub trait FromRawProcessHandle {
    fn from_raw_handle(handle: RawProcessHandle) -> ProcessHandle;
}

pub trait AsRawThreadHandle {
    fn as_raw_handle(&self) -> RawThreadHandle;
}

pub trait FromRawThreadHandle {
    /// # Safety
    ///
    /// The user must ensure that `RawThreadHandle` is a valid handle to a
    /// thread for the underlying platform.
    unsafe fn from_raw_handle(handle: RawThreadHandle) -> ThreadHandle;
}
