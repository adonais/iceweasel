/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Utilities which statically ensure we're on the specified thread.

use moz_task::AsyncTask;
use std::marker::PhantomData;

pub enum ThreadGuard {
    Main(MainThreadGuard),
    Background(BackgroundThreadGuard),
}

/// Guard that ensures calling context is on the main thread.
#[derive(Copy, Clone)]
pub struct MainThreadGuard {
    // For !Send and !Sync.
    _not_send_not_sync: PhantomData<*const ()>,
}

/// Guard that ensures calling context is on a background thread.
#[derive(Copy, Clone)]
pub struct BackgroundThreadGuard {
    // For !Send and !Sync.
    _not_send_not_sync: PhantomData<*const ()>,
}

/// Returns guard for the current thread type.
pub fn get_thread_guard() -> ThreadGuard {
    if moz_task::is_main_thread() {
        ThreadGuard::Main(MainThreadGuard {
            _not_send_not_sync: PhantomData,
        })
    } else {
        ThreadGuard::Background(BackgroundThreadGuard {
            _not_send_not_sync: PhantomData,
        })
    }
}

/// Spawns the provided Future onto a blocking background thread with guard.
pub fn spawn_background_guard<Fn, Fut>(name: &'static str, cb: Fn) -> AsyncTask<Fut::Output>
where
    Fn: FnOnce(BackgroundThreadGuard) -> Fut + Send + 'static,
    Fut: Future + 'static,
    Fut::Output: Send + 'static,
{
    moz_task::spawn_blocking(name, async move {
        futures::executor::block_on(cb(BackgroundThreadGuard {
            _not_send_not_sync: PhantomData,
        }))
    })
}
