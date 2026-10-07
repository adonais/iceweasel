/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! The named Windows objects that govern a helper's lifetime.
//!
//! [`StopEvent`] listens on two manual-reset events: one named after a profile
//! and an installation, and one named after the installation alone. A helper
//! serves exactly one profile, so signalling the first asks that profile's
//! helper, and only it, to exit, while signalling the second asks every helper
//! of the installation to exit.
//!
//! [`ProfileGuard`] is a mutex named after the same profile. Only the first
//! helper to serve a profile takes it.
//!
//! Note: currently, the helpers are not revived on system restarts. Firefox needs to
//! readd these helpers on first launch for the system login session.

use std::ffi::OsStr;
use std::hash::Hasher;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use fnv::FnvHasher;
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, LocalFree, ERROR_ALREADY_EXISTS, ERROR_FILE_NOT_FOUND, HANDLE,
    WAIT_OBJECT_0,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
use windows_sys::Win32::System::Threading::{
    CreateEventExW, CreateEventW, CreateMutexW, OpenEventW, SetEvent, WaitForMultipleObjects,
    CREATE_EVENT_MANUAL_RESET, EVENT_ALL_ACCESS, EVENT_MODIFY_STATE, INFINITE,
    SYNCHRONIZATION_SYNCHRONIZE,
};

// TODO: drop once windows-sys names its own import libraries (Bug 2071329).
#[link(name = "advapi32")]
unsafe extern "system" {}

struct OwnedHandle(HANDLE);

// SAFETY: Win32 handles belong to the process rather than to a thread, so any
// of them can use and close one. OwnedHandle owns its handle, so nothing else
// closes it out from under that thread.
//
// This moves the handle, not the kernel object's ownership: a mutex stays owned
// by the thread that acquired it, wherever its handle ends up.
unsafe impl Send for OwnedHandle {}

impl OwnedHandle {
    /// `None` for a null handle, so a failed Win32 call cannot produce one.
    fn new(handle: HANDLE) -> Option<Self> {
        (!handle.is_null()).then_some(OwnedHandle(handle))
    }

    fn get(&self) -> HANDLE {
        self.0
    }
}

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        // SAFETY: OwnedHandle::new rejects a null handle, so self.0 is one that
        // CreateEventW, OpenEventW or CreateMutexW returned and that nothing
        // has closed yet. drop runs once, so it is closed exactly once.
        unsafe { CloseHandle(self.0) };
    }
}

/// Ensures that there is only one helper for each profile.
///
/// The mutex is never released explicitly: a helper holds it until the process
/// ends, and Windows drops an abandoned mutex when its last handle closes.
pub struct ProfileGuard {
    _handle: OwnedHandle,
}

impl ProfileGuard {
    /// Returns `None` when a helper is already serving `profile`, including one
    /// left running by an earlier Firefox session.
    /// https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-createmutexw
    pub fn acquire(profile: &Path) -> Result<Option<Self>, String> {
        let name = wide(&object_name("profile", Some(profile))?);

        // SAFETY: A null security descriptor asks for the default one, and
        // `name` is NUL terminated by `wide` and outlives the call.
        let handle = unsafe { CreateMutexW(std::ptr::null(), 1, name.as_ptr()) };
        let handle = OwnedHandle::new(handle)
            .ok_or_else(|| format!("CreateMutexW failed: {}", last_error()))?;

        if last_error() == ERROR_ALREADY_EXISTS {
            // Dropping `handle` closes it, leaving the mutex to its owner.
            return Ok(None);
        }

        Ok(Some(ProfileGuard { _handle: handle }))
    }
}

/// One named manual-reset event.
struct Event {
    handle: OwnedHandle,
}

impl Event {
    /// https://learn.microsoft.com/en-us/windows/win32/sync/synchronization-object-security-and-access-rights
    const BROADCAST_RIGHTS: u32 = SYNCHRONIZATION_SYNCHRONIZE | EVENT_MODIFY_STATE;

    /// Opens `name`, creating it if it does not exist.
    /// https://learn.microsoft.com/en-us/windows/win32/sync/event-objects
    fn create(name: &str) -> Result<Self, String> {
        let name = wide(name);

        // SAFETY: A null security descriptor asks for the default one, and
        // `name` is NUL terminated by `wide` and outlives the call.
        let handle = unsafe { CreateEventW(std::ptr::null(), 1, 0, name.as_ptr()) };
        let handle = OwnedHandle::new(handle)
            .ok_or_else(|| format!("CreateEventW failed: {}", last_error()))?;

        Ok(Event { handle })
    }

    fn broadcast_sddl() -> String {
        // https://learn.microsoft.com/en-us/windows/win32/secauthz/sid-strings
        const AUTHENTICATED_USERS: &str = "AU";
        const LOCAL_SYSTEM: &str = "SY";
        const ADMINISTRATORS: &str = "BA";

        // https://learn.microsoft.com/en-us/windows/win32/secauthz/ace-strings
        let allow = |rights: u32, trustee: &str| format!("(A;;{rights};;;{trustee})");

        format!(
            "D:{}{}{}",
            allow(Self::BROADCAST_RIGHTS, AUTHENTICATED_USERS),
            allow(EVENT_ALL_ACCESS, LOCAL_SYSTEM),
            allow(EVENT_ALL_ACCESS, ADMINISTRATORS),
        )
    }

    /// Opens the machine-wide `name`, creating it if it does not exist.
    fn create_shared(name: &str) -> Result<Self, String> {
        let name = wide(name);
        let sddl = wide(&Self::broadcast_sddl());

        let mut descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
        let converted = unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                SDDL_REVISION_1,
                &mut descriptor,
                std::ptr::null_mut(),
            )
        };
        if converted == 0 {
            return Err(format!(
                "ConvertStringSecurityDescriptorToSecurityDescriptorW failed: {}",
                last_error()
            ));
        }

        let attributes = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor,
            bInheritHandle: 0,
        };

        let handle = unsafe {
            CreateEventExW(
                &attributes,
                name.as_ptr(),
                CREATE_EVENT_MANUAL_RESET,
                Self::BROADCAST_RIGHTS,
            )
        };
        let error = last_error();
        unsafe { LocalFree(descriptor) };

        let handle =
            OwnedHandle::new(handle).ok_or_else(|| format!("CreateEventExW failed: {error}"))?;

        Ok(Event { handle })
    }
}

/// The shutdown channels a helper listens on.
pub struct StopEvent {
    profile: Event,
    install: Event,
}

impl StopEvent {
    pub fn open(profile: &Path) -> Result<Self, String> {
        Ok(StopEvent {
            profile: Event::create(&object_name("stop", Some(profile))?)?,
            install: Event::create_shared(&object_name("stop", None)?)?,
        })
    }

    /// Blocks until [`send_stop_signal`] fires any of the events.
    pub fn wait(&self) -> Result<(), String> {
        let handles = [self.profile.handle.get(), self.install.handle.get()];

        // SAFETY: `self` owns both events, so both handles are still open for
        // the wait; only dropping `self` closes them. `handles` outlives the
        // call, and the count passed is its own length.
        let waited =
            unsafe { WaitForMultipleObjects(handles.len() as u32, handles.as_ptr(), 0, INFINITE) };

        // Anything else, WAIT_FAILED included, is a failure rather than a stop.
        if waited == WAIT_OBJECT_0 || waited == WAIT_OBJECT_0 + 1 {
            Ok(())
        } else {
            Err(format!("WaitForMultipleObjects returned {waited}"))
        }
    }
}

/// Asks the helper serving `profile` to exit, or every helper of this
/// installation when `profile` is `None`. Succeeds when none is running, so
/// callers may stop unconditionally without checking first.
pub fn send_stop_signal(profile: Option<&Path>) -> Result<(), String> {
    let name = wide(&object_name("stop", profile)?);

    // SAFETY: `name` is NUL terminated by `wide` and outlives the call.
    let handle = unsafe { OpenEventW(EVENT_MODIFY_STATE, 0, name.as_ptr()) };
    if handle.is_null() {
        // Read the error before wrapping: OwnedHandle::new on a null handle
        // drops a temporary that calls CloseHandle, clobbering the last error.
        // A missing event means no helper is listening, so the stop holds.
        return match last_error() {
            ERROR_FILE_NOT_FOUND => Ok(()),
            error => Err(format!("OpenEventW failed: {error}")),
        };
    }

    // SAFETY: OpenEventW returned a non-null handle above.
    let handle =
        OwnedHandle::new(handle).ok_or_else(|| format!("OpenEventW failed: {}", last_error()))?;

    // SAFETY: `handle` is still open, nothing having closed it since
    // OpenEventW, and that call requested the EVENT_MODIFY_STATE right that
    // SetEvent requires.
    if unsafe { SetEvent(handle.get()) } == 0 {
        return Err(format!("SetEvent failed: {}", last_error()));
    }

    Ok(())
}

/// The hash of the install directory, and of `profile` when one is given. A
/// `None` profile names the object every helper of the installation shares.
///
/// `kind` separates the object types.
fn object_name(kind: &str, profile: Option<&Path>) -> Result<String, String> {
    // https://learn.microsoft.com/en-us/windows/win32/termserv/kernel-object-namespaces
    const LOCAL_PREFIX: &str = "Local\\MozillaNotificationHelper";
    const GLOBAL_PREFIX: &str = "Global\\MozillaNotificationHelper";

    let exe = std::env::current_exe().map_err(|e| format!("cannot locate this binary: {e}"))?;
    let install = exe
        .parent()
        .ok_or_else(|| "this binary has no parent directory".to_string())?;

    let mut hasher = FnvHasher::default();
    hasher.write(path_key(install).as_bytes());
    if let Some(profile) = profile {
        hasher.write(&[0]);
        hasher.write(path_key(profile).as_bytes());
    }

    let prefix = if profile.is_some() {
        LOCAL_PREFIX
    } else {
        GLOBAL_PREFIX
    };

    Ok(format!("{prefix}-{kind}-{:016x}", hasher.finish()))
}

/// A stable key for `path`, folding the spellings Windows treats as one
/// directory: case, 8.3 short names, symlinks.
///
/// Canonicalizing does the folding but needs the path to exist. An unresolvable
/// path is therefore not an error; it keys off its literal spelling instead,
/// lowercased to approximate the case folding it missed.
fn path_key(path: &Path) -> String {
    match path.canonicalize() {
        Ok(canonical) => canonical.to_string_lossy().into_owned(),
        Err(_) => path.to_string_lossy().to_lowercase(),
    }
}

fn last_error() -> u32 {
    // SAFETY: GetLastError has no preconditions; it reads the calling thread's
    // last-error code.
    unsafe { GetLastError() }
}

fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain([0]).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Mutex;

    use windows_sys::Win32::System::Threading::ResetEvent;

    /// Serializes the tests that set or watch the broadcast event: every test in this binary shares
    /// the one broadcast name, so a stray signal from a parallel test would wake waiters that must
    /// stay asleep
    static BROADCAST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn name_ignores_path_case() {
        assert_eq!(
            object_name("stop", Some(Path::new(r"c:\profiles\someone"))).unwrap(),
            object_name("stop", Some(Path::new(r"C:\Profiles\SomeOne"))).unwrap()
        );
    }

    #[test]
    fn distinct_profiles_get_distinct_names() {
        assert_ne!(
            object_name("stop", Some(Path::new(r"c:\profiles\a"))).unwrap(),
            object_name("stop", Some(Path::new(r"c:\profiles\b"))).unwrap()
        );
    }

    /// The broadcast event is the one object every helper of an installation
    /// shares, so no profile may ever land on its name.
    #[test]
    fn the_broadcast_name_belongs_to_no_profile() {
        let broadcast = object_name("stop", None).unwrap();

        assert_ne!(
            broadcast,
            object_name("stop", Some(Path::new(r"c:\profiles\a"))).unwrap()
        );
        assert_ne!(
            broadcast,
            object_name("stop", Some(Path::new(r"c:\profiles\b"))).unwrap()
        );
    }

    /// A mutex and an event sharing a name would collide in the one namespace,
    /// so the kind has to reach the hash.
    #[test]
    fn a_guard_never_collides_with_a_stop_event() {
        let profile = Path::new(r"c:\profiles\kinds");

        assert_ne!(
            object_name("profile", Some(profile)).unwrap(),
            object_name("stop", Some(profile)).unwrap()
        );
    }

    #[test]
    fn signal_wakes_a_waiting_helper() {
        let profile = Path::new(r"c:\profiles\signal-wakes");
        let event = StopEvent::open(profile).unwrap();

        let waiter = std::thread::spawn(move || event.wait());
        send_stop_signal(Some(profile)).unwrap();

        waiter.join().unwrap().unwrap();
    }

    /// Manual reset: a signal arriving before the helper starts waiting has to
    /// still be seen, or a stop racing a startup would be lost.
    #[test]
    fn a_signal_before_the_wait_is_not_lost() {
        let profile = Path::new(r"c:\profiles\sticky-signal");
        let event = StopEvent::open(profile).unwrap();

        send_stop_signal(Some(profile)).unwrap();

        event.wait().unwrap();
    }

    #[test]
    fn signal_does_not_reach_another_profile() {
        let _serial = BROADCAST_LOCK.lock().unwrap();

        let mine = Path::new(r"c:\profiles\mine");
        let event = StopEvent::open(mine).unwrap();
        let waiter = std::thread::spawn(move || event.wait());

        send_stop_signal(Some(Path::new(r"c:\profiles\theirs"))).unwrap();
        assert!(!waiter.is_finished(), "another profile's signal woke us");

        send_stop_signal(Some(mine)).unwrap();
        waiter.join().unwrap().unwrap();
    }

    #[test]
    fn a_second_helper_is_refused_then_allowed_once_the_first_exits() {
        let profile = Path::new(r"c:\profiles\guard-test");

        let first = ProfileGuard::acquire(profile).unwrap();
        assert!(first.is_some(), "the first helper takes the guard");
        assert!(
            ProfileGuard::acquire(profile).unwrap().is_none(),
            "a second helper is refused while the first holds it"
        );

        drop(first);

        assert!(
            ProfileGuard::acquire(profile).unwrap().is_some(),
            "the guard is released when its owner exits"
        );
    }

    #[test]
    fn separate_profiles_do_not_block_each_other() {
        let one = ProfileGuard::acquire(Path::new(r"c:\profiles\one")).unwrap();
        let two = ProfileGuard::acquire(Path::new(r"c:\profiles\two")).unwrap();

        assert!(one.is_some() && two.is_some());
    }

    /// Only the broadcast object crosses users; everything else must stay invisible outside the
    /// session
    #[test]
    fn only_the_broadcast_name_is_global() {
        let profile = Path::new(r"c:\profiles\a");

        assert!(object_name("stop", None).unwrap().starts_with("Global\\"));
        assert!(object_name("stop", Some(profile))
            .unwrap()
            .starts_with("Local\\"));
        assert!(object_name("profile", Some(profile))
            .unwrap()
            .starts_with("Local\\"));
    }

    #[test]
    fn a_broadcast_signal_wakes_every_helper() {
        let _serial = BROADCAST_LOCK.lock().unwrap();

        // Held so the broadcast event can be reset at the end, leaving no set event behind for the
        // other tests
        let broadcast = Event::create_shared(&object_name("stop", None).unwrap()).unwrap();

        let one = StopEvent::open(Path::new(r"c:\profiles\broadcast-one")).unwrap();
        let two = StopEvent::open(Path::new(r"c:\profiles\broadcast-two")).unwrap();
        let waiters = [
            std::thread::spawn(move || one.wait()),
            std::thread::spawn(move || two.wait()),
        ];

        send_stop_signal(None).unwrap();

        for waiter in waiters {
            waiter.join().unwrap().unwrap();
        }

        assert_ne!(unsafe { ResetEvent(broadcast.handle.get()) }, 0);
    }
}
