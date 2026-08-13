/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::{
    ffi::c_void,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    ptr::null_mut,
};

use windows_sys::Win32::{
    Foundation::{FALSE, HANDLE, INVALID_HANDLE_VALUE},
    Security::{GetLengthSid, GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER},
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};

use super::ApplicationInfo;

/// SAFETY: The handle must be valid and point to a token that's valid input
/// for the GetTokenInformation call.
unsafe fn extract_sid_from_token(token: &OwnedHandle) -> Option<Vec<u8>> {
    let mut length: u32 = 0;
    // SAFETY: We have verified that `token` is a valid handle and the
    // pointer to `length` is valid as it points to a stack-allocated object.
    let res = unsafe {
        GetTokenInformation(token.as_raw_handle(), TokenUser, null_mut(), 0, &mut length)
    };
    if (res != FALSE) || length == 0 {
        // This shouldn't really be happening but better safe than sorry.
        return None;
    }

    let mut buffer = vec![0u8; length as usize];
    // SAFETY: We have verified that `token` is a valid handle, the
    // pointer to `length` is valid as it points to a stack-allocated
    // object and the pointer to the buffer is valid and guaranteed to be
    // of the right size.
    let res = unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            buffer.as_mut_ptr().cast(),
            length,
            &mut length,
        )
    };
    // In case the initial length was overprovisioned.
    buffer.resize(length as usize, 0);

    if res == FALSE {
        return None;
    }

    let length = length as usize;
    if length <= std::mem::size_of::<TOKEN_USER>() {
        return None;
    }

    // SAFETY: The TOKEN_USER structure is populated by `GetTokenInformation()`
    // and presumed safe.
    let sid_ptr: *mut c_void = unsafe {
        buffer
            .as_ptr()
            .add(std::mem::offset_of!(TOKEN_USER, User.Sid))
            .cast::<*mut c_void>()
            .read_unaligned()
    };
    // Sanity check: the pointer is higher than the buffer start.
    let offset = (sid_ptr as usize).checked_sub(buffer.as_ptr() as usize)?;
    // SAFETY: the pointer is populated by GetTokenInformation and is
    // presumed valid.
    let sid_length = unsafe { GetLengthSid(sid_ptr) } as usize;
    // If the SID isn't completely within the buffer, this will shortcut to None.
    Some(buffer.get(offset..offset + sid_length)?.to_vec())
}

fn get_current_proc_token() -> Option<OwnedHandle> {
    // Cannot be wrapped within an OwnedHandle as it's a pseudohandle.
    let process = unsafe { GetCurrentProcess() };
    let mut token: HANDLE = INVALID_HANDLE_VALUE;
    // SAFETY: process is a valid handle and the pointer to token is valid.
    let res = unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token as *mut HANDLE) };
    if res == FALSE {
        return None;
    }
    // SAFETY: We checked that the OpenProcessToken call succeeded.
    Some(unsafe { OwnedHandle::from_raw_handle(token) })
}

impl ApplicationInfo {
    pub fn get_user_id() -> Option<u64> {
        let token = get_current_proc_token()?;
        // SAFETY: token is a handle to a token
        unsafe { extract_sid_from_token(&token) }
            .map(|sid| sid.iter().copied().map(u64::from).sum())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::{
        Security::{
            CreateWellKnownSid, ImpersonateAnonymousToken, RevertToSelf, WinAnonymousSid,
            SECURITY_MAX_SID_SIZE,
        },
        System::Threading::{GetCurrentThread, OpenThreadToken},
    };

    // Ensure linking against the necessary Windows DLLs.
    #[link(name = "advapi32")]
    extern "C" {}

    #[test]
    /// Simple sanity check.
    fn test_get_user_id() {
        assert!(
            ApplicationInfo::get_user_id().is_some(),
            "In normal circumstances, get_user_id() should return *something*"
        )
    }

    /// Helper struct to cleanly impersonate the anonymous user.
    /// RAII ensures we revert to self even if the test panics.
    struct ScopedAnonymousImpersonation();

    impl ScopedAnonymousImpersonation {
        /// SAFETY: we need the handle to be a valid thread handle. Typically GetCurrentThread()
        unsafe fn new(thread: HANDLE) -> Self {
            // SAFETY: per function invariant.
            unsafe {
                assert!(ImpersonateAnonymousToken(thread) != FALSE);
                Self()
            }
        }
    }

    impl Drop for ScopedAnonymousImpersonation {
        fn drop(&mut self) {
            // SAFETY: If this fails we're *supposed* to panick.
            assert!(unsafe { RevertToSelf() } != FALSE);
        }
    }

    #[test]
    fn test_extract_sid_from_token_matches_anonymous_sid() {
        let mut buffer = [0u8; SECURITY_MAX_SID_SIZE as usize];
        let mut length = buffer.len() as u32;
        assert!(
            // SAFETY: The buffer is valid and of sufficient size, and the pointer to length is valid.
            unsafe {
                CreateWellKnownSid(
                    WinAnonymousSid,
                    null_mut(),
                    buffer.as_mut_ptr().cast(),
                    &mut length,
                )
            } != FALSE
        );
        let anonymous_sid = &buffer[..length as usize];

        // SAFETY: trivial
        let thread = unsafe { GetCurrentThread() };
        // thread is a valid thread handle.
        let anon = unsafe { ScopedAnonymousImpersonation::new(thread) };
        let mut token: HANDLE = INVALID_HANDLE_VALUE;
        assert!(
            // SAFETY: The thread handle is valid and the pointer to token is valid.
            unsafe { OpenThreadToken(thread, TOKEN_QUERY, FALSE, &mut token as *mut HANDLE,) }
                != FALSE
        );
        // SAFETY: We checked that the OpenThreadToken call succeeded.
        let token = unsafe { OwnedHandle::from_raw_handle(token) };

        // SAFETY: token is a handle to a token
        let sid = unsafe { extract_sid_from_token(&token) };
        assert_eq!(sid.as_deref(), Some(anonymous_sid));

        drop(anon);
    }
}
