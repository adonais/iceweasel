/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::cmp;
use std::collections::{hash_map, HashMap};
use std::ffi;
use std::mem;
use std::path;
use std::sync::{Arc, Condvar, Mutex, Weak};
use std::thread;
use std::time::{Duration, Instant};

use bits::{
    is_bits_error, BackgroundCopyManager, BitsJob, BitsJobPriority, BitsJobState, BitsProxyUsage,
    BG_S_PARTIAL_COMPLETE, E_FAIL,
};
use guid_win::Guid;

use bits_protocol::*;

use super::Error;

const BCM_CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

// This is a macro in order to use the NotFound and GetJob variants from whatever enum is in scope.
macro_rules! get_job {
    ($bcm:ident, $guid:expr, $name:expr) => {{
        $bcm = BackgroundCopyManager::connect_with_timeout(BCM_CONNECT_TIMEOUT).map_err(|e| {
            ConnectBcm(HResultMessage {
                hr: e.code(),
                message: e.to_string(),
            })
        })?;
        $bcm.find_job_by_guid_and_name($guid, $name)
            .map_err(|e| GetJob($crate::in_process::format_error(&$bcm, e)))?
            .ok_or(NotFound)?
    }};
}

fn format_error(bcm: &BackgroundCopyManager, error: comedy::HResult) -> HResultMessage {
    let bits_description = bcm.get_error_description(error.code()).ok();

    HResultMessage {
        hr: error.code(),
        message: if let Some(desc) = bits_description {
            format!("{}: {}", error, desc)
        } else {
            format!("{}", error)
        },
    }
}

// The error that broke a kept connection is the one to report, the retry's is a consequence of it.
fn with_retry_failure(first: HResultMessage, retry: HResultMessage) -> HResultMessage {
    HResultMessage {
        hr: first.hr,
        message: format!("{} (retry failed: {})", first.message, retry.message),
    }
}

// The in-process client uses direct BITS calls via the `bits` crate.
// See the corresponding functions in BitsClient.
pub struct InProcessClient {
    job_name: ffi::OsString,
    save_path_prefix: path::PathBuf,
    monitors: HashMap<Guid, InProcessMonitorControl>,
}

impl InProcessClient {
    pub fn new(
        job_name: ffi::OsString,
        save_path_prefix: ffi::OsString,
    ) -> Result<InProcessClient, Error> {
        Ok(InProcessClient {
            job_name,
            save_path_prefix: path::PathBuf::from(save_path_prefix),
            monitors: HashMap::new(),
        })
    }

    pub fn start_job(
        &mut self,
        url: ffi::OsString,
        save_path: ffi::OsString,
        proxy_usage: BitsProxyUsage,
        no_progress_timeout_secs: u32,
        monitor_interval_millis: u32,
        custom_headers: ffi::OsString,
    ) -> Result<(StartJobSuccess, InProcessMonitor), StartJobFailure> {
        use StartJobFailure::*;

        let full_path = self.save_path_prefix.join(save_path);

        // Verify that `full_path` is under the directory called `save_path_prefix`.
        {
            let canonical_prefix = self.save_path_prefix.canonicalize().map_err(|e| {
                ArgumentValidation(format!("save_path_prefix.canonicalize(): {}", e))
            })?;
            // Full path minus file name, canonicalize() fails with nonexistent files, but the
            // parent directory ought to exist.
            let canonical_full_path = full_path
                .parent()
                .ok_or_else(|| ArgumentValidation("full_path.parent(): None".into()))?
                .canonicalize()
                .map_err(|e| {
                    ArgumentValidation(format!("full_path.parent().canonicalize(): {}", e))
                })?;

            if !canonical_full_path.starts_with(&canonical_prefix) {
                return Err(ArgumentValidation(format!(
                    "{:?} is not within {:?}",
                    canonical_full_path, canonical_prefix
                )));
            }
        }

        // TODO: Should the job be explicitly cleaned up if this fn can't return success?
        // If the job is dropped before `AddFile` succeeds, I think it automatically gets
        // deleted from the queue. There is only one fallible call after that (`Resume`).

        let bcm =
            BackgroundCopyManager::connect_with_timeout(BCM_CONNECT_TIMEOUT).map_err(|e| {
                ConnectBcm(HResultMessage {
                    hr: e.code(),
                    message: e.to_string(),
                })
            })?;
        let mut job = bcm
            .create_job(&self.job_name)
            .map_err(|e| Create(format_error(&bcm, e)))?;

        let guid = job.guid().map_err(|e| OtherBITS(format_error(&bcm, e)))?;

        (|| {
            job.set_proxy_usage(proxy_usage)?;
            job.set_minimum_retry_delay(60)?;
            job.set_no_progress_timeout(no_progress_timeout_secs)?;
            job.set_redirect_report()?;
            job.set_custom_headers(&custom_headers)?;
            job.set_priority(BitsJobPriority::Foreground)?;

            Ok(())
        })()
        .map_err(|e| ApplySettings(format_error(&bcm, e)))?;

        let (client, control) = InProcessMonitor::new(&mut job, monitor_interval_millis)
            .map_err(|e| OtherBITS(format_error(&bcm, e)))?;

        job.add_file(&url, &full_path.into_os_string())
            .map_err(|e| AddFile(format_error(&bcm, e)))?;

        job.resume().map_err(|e| Resume(format_error(&bcm, e)))?;

        self.monitors.insert(guid.clone(), control);

        Ok((StartJobSuccess { guid }, client))
    }

    pub fn monitor_job(
        &mut self,
        guid: Guid,
        interval_millis: u32,
    ) -> Result<InProcessMonitor, MonitorJobFailure> {
        use MonitorJobFailure::*;

        // Stop any preexisting monitor for the same guid.
        let _ = self.stop_update(guid.clone());

        let bcm;
        let (client, control) =
            InProcessMonitor::new(&mut get_job!(bcm, &guid, &self.job_name), interval_millis)
                .map_err(|e| OtherBITS(format_error(&bcm, e)))?;

        self.monitors.insert(guid, control);

        Ok(client)
    }

    pub fn suspend_job(&mut self, guid: Guid) -> Result<(), SuspendJobFailure> {
        use SuspendJobFailure::*;

        let bcm;
        get_job!(bcm, &guid, &self.job_name)
            .suspend()
            .map_err(|e| SuspendJob(format_error(&bcm, e)))?;

        Ok(())
    }

    pub fn resume_job(&mut self, guid: Guid) -> Result<(), ResumeJobFailure> {
        use ResumeJobFailure::*;

        let bcm;
        get_job!(bcm, &guid, &self.job_name)
            .resume()
            .map_err(|e| ResumeJob(format_error(&bcm, e)))?;

        Ok(())
    }

    pub fn set_job_priority(
        &mut self,
        guid: Guid,
        foreground: bool,
    ) -> Result<(), SetJobPriorityFailure> {
        use SetJobPriorityFailure::*;

        let priority = if foreground {
            BitsJobPriority::Foreground
        } else {
            BitsJobPriority::Normal
        };

        let bcm;
        get_job!(bcm, &guid, &self.job_name)
            .set_priority(priority)
            .map_err(|e| ApplySettings(format_error(&bcm, e)))?;

        Ok(())
    }

    pub fn set_no_progress_timeout(
        &mut self,
        guid: Guid,
        timeout_secs: u32,
    ) -> Result<(), SetNoProgressTimeoutFailure> {
        use SetNoProgressTimeoutFailure::*;

        let bcm;
        get_job!(bcm, &guid, &self.job_name)
            .set_no_progress_timeout(timeout_secs)
            .map_err(|e| ApplySettings(format_error(&bcm, e)))?;

        Ok(())
    }

    fn get_monitor_control_sender(&mut self, guid: Guid) -> Option<Arc<ControlPair>> {
        if let hash_map::Entry::Occupied(occ) = self.monitors.entry(guid) {
            if let Some(sender) = occ.get().0.upgrade() {
                Some(sender)
            } else {
                // Remove dangling Weak
                occ.remove_entry();
                None
            }
        } else {
            None
        }
    }

    pub fn set_update_interval(
        &mut self,
        guid: Guid,
        interval_millis: u32,
    ) -> Result<(), SetUpdateIntervalFailure> {
        use SetUpdateIntervalFailure::*;

        if let Some(sender) = self.get_monitor_control_sender(guid) {
            let mut s = sender.1.lock().unwrap();
            s.interval_millis = interval_millis;
            sender.0.notify_all();
            Ok(())
        } else {
            Err(NotFound)
        }
    }

    pub fn stop_update(&mut self, guid: Guid) -> Result<(), SetUpdateIntervalFailure> {
        use SetUpdateIntervalFailure::*;

        if let Some(sender) = self.get_monitor_control_sender(guid) {
            sender.1.lock().unwrap().shutdown = true;
            sender.0.notify_all();
            Ok(())
        } else {
            Err(NotFound)
        }
    }

    pub fn complete_job(&mut self, guid: Guid) -> Result<(), CompleteJobFailure> {
        use CompleteJobFailure::*;

        let bcm;
        get_job!(bcm, &guid, &self.job_name)
            .complete()
            .map_err(|e| CompleteJob(format_error(&bcm, e)))
            .and_then(|hr| {
                if hr == BG_S_PARTIAL_COMPLETE as i32 {
                    Err(PartialComplete)
                } else {
                    Ok(())
                }
            })?;

        let _ = self.stop_update(guid);

        Ok(())
    }

    pub fn cancel_job(&mut self, guid: Guid) -> Result<(), CancelJobFailure> {
        use CancelJobFailure::*;

        let bcm;
        get_job!(bcm, &guid, &self.job_name)
            .cancel()
            .map_err(|e| CancelJob(format_error(&bcm, e)))?;

        let _ = self.stop_update(guid);

        Ok(())
    }
}

// InProcessMonitor can be used on any thread, and `ControlPair` can be synchronously modified to
// control a blocked `get_status` call from another thread.
pub struct InProcessMonitor {
    vars: Arc<ControlPair>,
    guid: Guid,
    last_status_time: Option<Instant>,
    last_url: Option<ffi::OsString>,
    connection: Option<MonitorConnection>,
}

/// The BITS connection a monitor keeps between polls.
///
/// The proxy belongs to the multithreaded apartment, so it may travel with the monitor between
/// threads, but it is only used through `&mut InProcessMonitor` on the thread that connected (see
/// `is_current_thread`). Releasing a proxy from another apartment is not allowed, so a drop on a
/// foreign thread leaks it instead. That happens if a monitor is torn down between two polls
/// because the request was dropped mid-transfer at shutdown, and costs one proxy.
struct MonitorConnection {
    bcm: mem::ManuallyDrop<BackgroundCopyManager>,
    thread: thread::ThreadId,
}

unsafe impl Send for MonitorConnection {}

impl MonitorConnection {
    fn new(bcm: BackgroundCopyManager) -> MonitorConnection {
        MonitorConnection {
            bcm: mem::ManuallyDrop::new(bcm),
            thread: thread::current().id(),
        }
    }

    fn is_current_thread(&self) -> bool {
        self.thread == thread::current().id()
    }
}

impl Drop for MonitorConnection {
    fn drop(&mut self) {
        if self.is_current_thread() {
            unsafe { mem::ManuallyDrop::drop(&mut self.bcm) }
        }
    }
}

// The `Condvar` is notified when `InProcessMonitorVars` changes.
type ControlPair = (Condvar, Mutex<InProcessMonitorVars>);
struct InProcessMonitorControl(Weak<ControlPair>);

// RefUnwindSafe is not impl'd for Condvar but likely should be,
// see https://github.com/rust-lang/rust/issues/54768
impl std::panic::RefUnwindSafe for InProcessMonitorControl {}

struct InProcessMonitorVars {
    interval_millis: u32,
    notified: bool,
    shutdown: bool,
}

impl InProcessMonitor {
    fn new(
        job: &mut BitsJob,
        interval_millis: u32,
    ) -> Result<(InProcessMonitor, InProcessMonitorControl), comedy::HResult> {
        let guid = job.guid()?;

        let vars = Arc::new((
            Condvar::new(),
            Mutex::new(InProcessMonitorVars {
                interval_millis,
                notified: false,
                shutdown: false,
            }),
        ));

        let transferred_control = InProcessMonitorControl(Arc::downgrade(&vars));
        let transferred_cb = Box::new(move || {
            if let Some(control) = transferred_control.0.upgrade() {
                if let Ok(mut vars) = control.1.lock() {
                    vars.notified = true;
                    control.0.notify_all();
                    return Ok(());
                }
            }
            Err(E_FAIL)
        });

        let error_control = InProcessMonitorControl(Arc::downgrade(&vars));
        let error_cb = Box::new(move || {
            if let Some(control) = error_control.0.upgrade() {
                if let Ok(mut vars) = control.1.lock() {
                    vars.notified = true;
                    control.0.notify_all();
                    return Ok(());
                }
            }
            Err(E_FAIL)
        });

        // Note: These callbacks are never explicitly cleared. They will be freed when the
        // job is deleted from BITS, and they will be cleared if an attempt is made to call them
        // when they are no longer valid (e.g. after the process exits). This is done mostly for
        // simplicity and should be safe.

        job.register_callbacks(Some(transferred_cb), Some(error_cb), None)?;

        let control = InProcessMonitorControl(Arc::downgrade(&vars));

        let monitor = InProcessMonitor {
            guid,
            vars,
            last_status_time: None,
            last_url: None,
            connection: None,
        };

        Ok((monitor, control))
    }

    pub fn get_status(
        &mut self,
        timeout_millis: u32,
    ) -> Result<Result<JobStatus, HResultMessage>, Error> {
        let timeout = Duration::from_millis(u64::from(timeout_millis));

        let started = Instant::now();
        let timeout_end = started + timeout;

        // Taken before waiting so that the early returns below release it on this thread.
        let mut cached = self
            .connection
            .take()
            .filter(MonitorConnection::is_current_thread);

        {
            let mut s = self.vars.1.lock().unwrap();
            loop {
                let wait_start = Instant::now();

                if s.shutdown {
                    // Disconnected, immediately return error.
                    // Note: Shutdown takes priority over simultaneous notification.
                    return Err(Error::NotConnected);
                }

                if wait_start >= timeout_end {
                    // Timed out, immediately return timeout error.
                    // This should not normally happen with the in-process monitor, but the
                    // monitor interval could be longer than the timeout.
                    s.shutdown = true;
                    return Err(Error::Timeout);
                }

                // Get the interval every pass through the loop, in case it has changed.
                let interval = Duration::from_millis(u64::from(s.interval_millis));

                let wait_until = self
                    .last_status_time
                    .map(|last_status_time| cmp::min(last_status_time + interval, timeout_end));

                if s.notified {
                    // Notified, exit loop to get status.
                    s.notified = false;
                    break;
                }

                if wait_until.is_none() {
                    // First status report, no waiting, exit loop to get status.
                    break;
                }

                let wait_until = wait_until.unwrap();

                if wait_until <= wait_start {
                    // No time left to wait. This can't be due to timeout because
                    // `wait_until <= wait_start < timeout_end`.
                    // Status report due, exit loop to get status.
                    break;
                }

                // Wait.
                // Do not attempt to recover from poisoned Mutex.
                s = self
                    .vars
                    .0
                    .wait_timeout(s, wait_until - wait_start)
                    .unwrap()
                    .0;

                // Mutex re-acquired, loop.
            }
        }

        // No error yet, start getting status now.
        self.last_status_time = Some(Instant::now());

        let mut first_error: Option<HResultMessage> = None;
        loop {
            let reused = cached.is_some();
            let connection = match cached.take() {
                Some(connection) => connection,
                None => match BackgroundCopyManager::connect_with_timeout(BCM_CONNECT_TIMEOUT) {
                    Ok(bcm) => MonitorConnection::new(bcm),
                    Err(e) => {
                        // On any error, disconnect.
                        self.vars.1.lock().unwrap().shutdown = true;

                        // Errors below can use the BCM to do `format_error()`, but this one just
                        // gets the basic `comedy::HResult` treatment.
                        let Some(first) = first_error else {
                            return Err(Error::ConnectBcm(e));
                        };
                        return Ok(Err(with_retry_failure(
                            first,
                            HResultMessage {
                                hr: e.code(),
                                message: format!("{}", e),
                            },
                        )));
                    }
                },
            };

            match self.query_status(&connection.bcm) {
                Ok(status) => {
                    // Keep the connection for the next poll unless the job is finished, so that
                    // the proxy is released here rather than wherever the monitor is eventually
                    // dropped.
                    match status.state {
                        BitsJobState::Error
                        | BitsJobState::Transferred
                        | BitsJobState::Acknowledged
                        | BitsJobState::Cancelled => {}
                        _ => self.connection = Some(connection),
                    }
                    return Ok(Ok(status));
                }
                Err(e) => {
                    let error = format_error(&connection.bcm, e);

                    // A kept connection may be stale, for example after the BITS service was
                    // restarted, so retry once on a fresh one before giving up. An error from
                    // BITS itself is an answer that a fresh connection would only repeat.
                    if reused && !is_bits_error(error.hr) {
                        first_error = Some(error);
                        continue;
                    }

                    // On any error, disconnect.
                    self.vars.1.lock().unwrap().shutdown = true;
                    return Ok(Err(match first_error {
                        Some(first) => with_retry_failure(first, error),
                        None => error,
                    }));
                }
            }
        }
    }

    fn query_status(&mut self, bcm: &BackgroundCopyManager) -> Result<JobStatus, comedy::HResult> {
        let mut job = bcm.get_job_by_guid(&self.guid)?;

        let status = job.get_status()?;
        let url = job.get_first_file()?.get_remote_name()?;

        Ok(JobStatus {
            state: status.state,
            progress: status.progress,
            error_count: status.error_count,
            error: status.error.map(|e| JobError {
                context: e.context,
                context_str: e.context_str,
                error: HResultMessage {
                    hr: e.error,
                    message: e.error_str,
                },
            }),
            times: status.times,
            url: if self.last_url.is_some() && *self.last_url.as_ref().unwrap() == url {
                None
            } else {
                self.last_url = Some(url);
                self.last_url.clone()
            },
        })
    }
}

#[cfg(test)]
mod tests;
