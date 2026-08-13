/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Async wrapper for nsITimer.

use nserror::{NS_ERROR_UNEXPECTED, NS_OK, nsresult};
use nsstring::{nsACString, nsCString};
use std::{cell::RefCell, time::Duration};
use xpcom::{RefPtr, interfaces::nsITimer, xpcom, xpcom_method};

/// Asynchronously waits for the provided duration before resolving. Implemented
/// using nsITimer.
pub async fn sleep(dur: Duration) -> Result<(), nsresult> {
    let (tx, rx) = futures::channel::oneshot::channel::<()>();

    #[xpcom(implement(nsINamed, nsITimerCallback), nonatomic)]
    struct WakeCb {
        tx: RefCell<Option<futures::channel::oneshot::Sender<()>>>,
    }

    impl WakeCb {
        // Notifies the channel that the timer has elapsed.
        xpcom_method!(notify => Notify(_t: *const nsITimer));
        fn notify(&self, _: &nsITimer) -> Result<(), nsresult> {
            let tx = self.tx.take().ok_or(NS_ERROR_UNEXPECTED)?;
            tx.send(()).map_err(|_| NS_ERROR_UNEXPECTED)
        }

        xpcom_method!(get_name => GetName() -> nsACString);
        fn get_name(&self) -> Result<nsCString, nsresult> {
            Ok(nsCString::from("shell_windows::async_nsitimer::sleep"))
        }
    }

    let cb = WakeCb::allocate(InitWakeCb {
        tx: Some(tx).into(),
    });
    let timer: RefPtr<nsITimer> =
        xpcom::create_instance(c"@mozilla.org/timer;1").ok_or(nserror::NS_ERROR_UNEXPECTED)?;

    // SAFETY: The `nsITimerCallback` pointer is taken from a `RefPtr`, which
    // guarantees initialization.
    unsafe {
        timer.InitWithCallback(
            cb.coerce(),
            dur.as_millis() as u32,
            nsITimer::TYPE_ONE_SHOT
                .try_into()
                .map_err(|_| NS_ERROR_UNEXPECTED)?,
        )
    }
    .to_result()?;

    let _ = rx.await;
    Ok(())
}
