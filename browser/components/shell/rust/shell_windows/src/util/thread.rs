/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Utilities which statically ensure we're on the specified thread.

use std::marker::PhantomData;

#[derive(Copy, Clone)]
pub struct MainThreadGuard {
    // For !Send and !Sync.
    _not_send_not_sync: PhantomData<*const ()>,
}

pub fn get_main_thread_guard() -> Option<MainThreadGuard> {
    moz_task::is_main_thread().then_some(MainThreadGuard {
        _not_send_not_sync: PhantomData,
    })
}
