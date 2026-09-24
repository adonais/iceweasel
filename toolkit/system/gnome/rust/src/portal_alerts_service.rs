/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::ffi::c_void;
use std::time::Duration;

use dbus::arg::Variant;
use dbus::blocking::Connection;
use log::warn;

use nserror::{
    nsresult, NS_ERROR_FAILURE, NS_ERROR_INVALID_ARG, NS_ERROR_NOT_AVAILABLE,
    NS_ERROR_NOT_IMPLEMENTED, NS_OK,
};
use nsstring::{nsAString, nsString};
use thin_vec::ThinVec;
use xpcom::interfaces::{nsIAlertCallbacks, nsIAlertNotification, nsIObserver};
use xpcom::{xpcom, xpcom_method, RefPtr};

const PORTAL_DESTINATION: &str = "org.freedesktop.portal.Desktop";
const PORTAL_PATH: &str = "/org/freedesktop/portal/desktop";
const PORTAL_INTERFACE: &str = "org.freedesktop.portal.Notification";
const CALL_TIMEOUT: Duration = Duration::from_millis(3000);

struct ActiveAlert {
    id: String,
    callbacks: Option<RefPtr<nsIAlertCallbacks>>,
}

#[xpcom(implement(nsIAlertsService, nsIAlertsDoNotDisturb), atomic)]
struct PortalAlertsService {
    // Live notifications keyed by the alert name's raw UTF-16 code units,
    // since names may contain invalid UTF-16.
    active: RefCell<HashMap<Vec<u16>, ActiveAlert>>,
    suppress_for_screen_sharing: Cell<bool>,
}

impl PortalAlertsService {
    fn create() -> RefPtr<Self> {
        PortalAlertsService::allocate(InitPortalAlertsService {
            active: RefCell::new(HashMap::new()),
            suppress_for_screen_sharing: Cell::new(false),
        })
    }

    xpcom_method!(show_alert => ShowAlert(aAlert: *const nsIAlertNotification, aAlertListener: *const nsIObserver));
    fn show_alert(
        &self,
        _alert: &nsIAlertNotification,
        _listener: Option<&nsIObserver>,
    ) -> Result<(), nsresult> {
        Err(NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(show_alert_with_callbacks => ShowAlertWithCallbacks(aAlert: *const nsIAlertNotification, aAlertCallbacks: *const nsIAlertCallbacks));
    fn show_alert_with_callbacks(
        &self,
        alert: &nsIAlertNotification,
        callbacks: Option<&nsIAlertCallbacks>,
    ) -> Result<(), nsresult> {
        if self.suppress_for_screen_sharing.get() {
            if let Some(callbacks) = callbacks {
                unsafe { callbacks.OnAlertFinished() };
            }
            return Ok(());
        }
        let mut name = nsString::new();
        unsafe { alert.GetName(&mut *name) }.to_result()?;
        // The id is unique per profile, unlike the name for chrome callers.
        let mut id = nsString::new();
        unsafe { alert.GetId(&mut *id) }
            .to_result()
            .map_err(|error| {
                warn!("could not read the alert id: {error}");
                NS_ERROR_FAILURE
            })?;
        let id = id.to_string();
        // The id is a hash formatted as ASCII digits.
        debug_assert!(!id.contains('\0'));

        // A same-name alert derives the same id, so the portal atomically
        // updates the existing notification instead of closing and
        // recreating it.
        self.add_notification(alert, &id).map_err(|error| {
            warn!("XDG Desktop Portal notification failed: {error}");
            NS_ERROR_FAILURE
        })?;
        let stored_callbacks = callbacks.map(RefPtr::new);
        let previous = self.active.borrow_mut().insert(
            name.to_vec(),
            ActiveAlert {
                id: id.clone(),
                callbacks: stored_callbacks,
            },
        );
        if let Some(previous) = previous {
            if previous.id != id {
                // Updating in place only works for a shared id, so withdraw
                // the replaced notification when its id differs. Only the
                // empty name derives a fresh id per show.
                debug_assert!(name.is_empty());
                self.remove_notification(&previous.id);
            }
            if let Some(previous_callbacks) = &previous.callbacks {
                unsafe { previous_callbacks.OnAlertFinished() };
            }
        }
        if let Some(callbacks) = callbacks {
            unsafe { callbacks.OnAlertShow() };
        }
        Ok(())
    }

    fn add_notification(&self, alert: &nsIAlertNotification, id: &str) -> Result<(), String> {
        let mut title = nsString::new();
        unsafe { alert.GetTitle(&mut *title) }
            .to_result()
            .map_err(|error| format!("could not read the alert title: {error}"))?;
        let mut body = nsString::new();
        unsafe { alert.GetText(&mut *body) }
            .to_result()
            .map_err(|error| format!("could not read the alert text: {error}"))?;

        let entries = HashMap::from([
            ("title", Variant(dbus_string(&title))),
            ("body", Variant(dbus_string(&body))),
        ]);
        let () = session_connection()?
            .with_proxy(PORTAL_DESTINATION, PORTAL_PATH, CALL_TIMEOUT)
            .method_call(PORTAL_INTERFACE, "AddNotification", (id, entries))
            .map_err(|error| format!("{error:?}"))?;
        Ok(())
    }

    fn remove_notification(&self, id: &str) {
        // Waiting for the reply keeps the connection alive until the portal
        // has taken the request; the portal discards a request whose sender
        // has already disconnected.
        let result = session_connection().and_then(|connection| {
            let () = connection
                .with_proxy(PORTAL_DESTINATION, PORTAL_PATH, CALL_TIMEOUT)
                .method_call(PORTAL_INTERFACE, "RemoveNotification", (id,))
                .map_err(|error| format!("{error:?}"))?;
            Ok(())
        });
        if let Err(error) = result {
            warn!("XDG Desktop Portal notification withdrawal failed: {error}");
        }
    }

    xpcom_method!(close_alert => CloseAlert(aName: *const nsAString, aContextClosed: bool));
    fn close_alert(&self, name: &nsAString, _context_closed: bool) -> Result<(), nsresult> {
        let entry = self.active.borrow_mut().remove(&name[..]);
        if let Some(entry) = entry {
            self.remove_notification(&entry.id);
            if let Some(callbacks) = &entry.callbacks {
                unsafe { callbacks.OnAlertFinished() };
            }
        }
        Ok(())
    }

    xpcom_method!(get_history => GetHistory() -> ThinVec<nsString>);
    fn get_history(&self) -> Result<ThinVec<nsString>, nsresult> {
        // Neither org.freedesktop.Notifications nor
        // org.freedesktop.portal.Notification supports getting the previous
        // notifications.
        Err(NS_ERROR_NOT_AVAILABLE)
    }

    xpcom_method!(teardown => Teardown());
    fn teardown(&self) -> Result<(), nsresult> {
        // Like the libnotify backend, leave the notifications up and only
        // drop the callbacks, without firing them: dispatching alertfinished
        // this late in shutdown races service worker teardown. Responding to
        // notifications that outlived their session is bug 2065932.
        self.active.borrow_mut().clear();
        Ok(())
    }

    xpcom_method!(pbm_teardown => PbmTeardown());
    fn pbm_teardown(&self) -> Result<(), nsresult> {
        Err(NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(is_fullscreen => IsFullscreen() -> bool);
    fn is_fullscreen(&self) -> Result<bool, nsresult> {
        Err(NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(get_manual_do_not_disturb => GetManualDoNotDisturb() -> bool);
    fn get_manual_do_not_disturb(&self) -> Result<bool, nsresult> {
        Err(NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(set_manual_do_not_disturb => SetManualDoNotDisturb(aDoNotDisturb: bool));
    fn set_manual_do_not_disturb(&self, _do_not_disturb: bool) -> Result<(), nsresult> {
        Err(NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(get_suppress_for_screen_sharing => GetSuppressForScreenSharing() -> bool);
    fn get_suppress_for_screen_sharing(&self) -> Result<bool, nsresult> {
        Ok(self.suppress_for_screen_sharing.get())
    }

    xpcom_method!(set_suppress_for_screen_sharing => SetSuppressForScreenSharing(aSuppress: bool));
    fn set_suppress_for_screen_sharing(&self, suppress: bool) -> Result<(), nsresult> {
        self.suppress_for_screen_sharing.set(suppress);
        Ok(())
    }
}

// The connection is created per call: notifications are infrequent, and this
// leaves no cached bus state to manage.
fn session_connection() -> Result<Connection, String> {
    Connection::new_session()
        .map_err(|error| format!("could not connect to the session bus: {error:?}"))
}

// An interior nul would terminate the string early at the D-Bus layer, so
// truncate there explicitly like the C-string based backends effectively do.
fn dbus_string(value: &nsAString) -> String {
    let mut value = value.to_string();
    if let Some(position) = value.find('\0') {
        value.truncate(position);
    }
    value
}

#[unsafe(no_mangle)]
pub extern "C" fn new_portal_alerts_service(
    iid: *const xpcom::nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    if iid.is_null() || result.is_null() {
        return NS_ERROR_INVALID_ARG;
    }
    let service = PortalAlertsService::create();
    unsafe { service.QueryInterface(iid, result) }
}
