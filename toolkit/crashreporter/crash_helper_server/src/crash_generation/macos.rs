/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{mem::MaybeUninit, ptr::null_mut};

use anyhow::Result;
use crash_helper_common::{ApplicationInfo, RawProcessHandle};
use mozannotation_server::CAnnotation;
use nix::{
    errno::Errno,
    libc::{gettimeofday, kern_return_t, mach_port_t, pid_t, timeval, KERN_SUCCESS},
};

/// Create the annotations that are specific to this platform, there are none
/// at the moment.
pub(crate) fn create_platform_specific_annotations(
    _app_info: &ApplicationInfo,
) -> Result<Vec<CAnnotation>> {
    Ok(Vec::new())
}

extern "C" {
    fn process_starttime(pid: pid_t) -> u64;
    // From `<mach/mach_traps.h>`, there is no binding for this yet
    pub fn pid_for_task(task: mach_port_t, pid: *mut i32) -> kern_return_t;
}

pub(crate) fn process_uptime(task: RawProcessHandle) -> f64 {
    let mut tv = MaybeUninit::<timeval>::uninit();
    // SAFETY: `tv` is a stack-allocated value and thus the pointer to it is
    // guaranteed to be valid.
    let res = unsafe { gettimeofday(tv.as_mut_ptr(), null_mut()) };
    if res != 0 {
        log::error!("Could not get the current time: {}", Errno::last());
        return 0.0f64;
    }
    // SAFETY: We just verified that `gettimeofday()` successfully populated `tv`
    let tv = unsafe { tv.assume_init() };

    let mut pid = MaybeUninit::<pid_t>::uninit();
    // SAFETY: `pid` is a stack-allocated value and thus the pointer to it is
    // guaranteed to be valid.
    let res = unsafe { pid_for_task(task, pid.as_mut_ptr()) };
    // SAFETY: We just verified that `pid_for_task()` successfully populated `pid`
    if res != KERN_SUCCESS {
        log::error!("Could not get the task's pid: {:x}", res);
        return 0.0f64;
    }
    let pid = unsafe { pid.assume_init() };

    let starttime = unsafe { process_starttime(pid) };
    let now = (tv.tv_sec as u64 * 1000000) + tv.tv_usec as u64;
    let elapsed = now.saturating_sub(starttime);

    return (elapsed as f64) / 1000000f64;
}
