/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! # Site Categories
//!
//! This crate provides site category lookup for telemetry purposes.

use std::cell::{LazyCell, RefCell};
use std::os::raw::c_char;

use nserror::{nsresult, NS_ERROR_FAILURE, NS_ERROR_UNEXPECTED, NS_OK};
use nsstring::{nsACString, nsCStr, nsCString};
use serde_json::{Map, Value};
use xpcom::interfaces::{nsIPrefBranch, nsIPrincipal, nsISupports};
use xpcom::{xpcom, xpcom_method, RefPtr};

type LazyCategories = LazyCell<Result<Map<String, Value>, nsresult>>;

#[xpcom(implement(nsISiteCategory, nsIObserver), nonatomic)]
struct SiteCategory {
    /// Parsed from `toolkit.telemetry.site_categories` on first use, and reset
    /// whenever that preference changes.
    categories: RefCell<LazyCategories>,
}

#[allow(non_snake_case)]
impl SiteCategory {
    fn parse_categories() -> Result<Map<String, Value>, nsresult> {
        let categories = static_prefs::pref!("toolkit.telemetry.site_categories").to_string();
        let categories: Value =
            serde_json::from_str(&categories).map_err(|_| NS_ERROR_UNEXPECTED)?;
        let categories = categories
            .as_object()
            .ok_or(NS_ERROR_UNEXPECTED)?
            .to_owned();
        Ok(categories)
    }

    fn observe_pref(&self) -> Result<(), nsresult> {
        let pref_branch: RefPtr<nsIPrefBranch> =
            xpcom::components::Preferences::service().map_err(|_| NS_ERROR_FAILURE)?;
        let pref_name = &nsCStr::from("toolkit.telemetry.site_categories") as &nsACString;
        // SAFETY: We pass a valid string and a valid nsIObserver, and the
        // preference service holds a strong reference to the observer until
        // it drops its observers at xpcom-shutdown.
        unsafe { pref_branch.AddObserverImpl(pref_name, self.coerce(), false) }.to_result()
    }

    /// Invalidate the cached categories so that the new preference value is
    /// picked up by the next `get_category` call. Note that recalculating here
    /// would also be safe (static preference mirrors are updated before any
    /// observer runs), but there is no need to do the work eagerly.
    unsafe fn Observe(
        &self,
        _subject: *const nsISupports,
        _topic: *const c_char,
        _data: *const u16,
    ) -> nsresult {
        *self.categories.borrow_mut() = LazyCell::new(Self::parse_categories);
        NS_OK
    }

    xpcom_method!(get_category => GetCategory(principal: *const nsIPrincipal) -> nsACString);
    fn get_category(&self, principal: &nsIPrincipal) -> Result<nsCString, nsresult> {
        let cell = self.categories.borrow();
        let categories = (**cell).as_ref().map_err(|err| err.to_owned())?;

        // Check the full host first for specific subdomain matches
        // (e.g., "mail.google.com" should match before falling back to "google.com")
        // SAFETY: xpcom::getter_addrefs ensures to pass a valid URI object
        let uri = xpcom::getter_addrefs(|p| unsafe { principal.GetURI(p) })?;
        let mut host = nsCString::new();
        // SAFETY: The caller passes an valid string object
        unsafe { uri.GetHost(&mut *host) }.to_result()?;

        if let Some(category) = categories.get(&host.to_string()) {
            return Ok(nsCString::from(
                category.as_str().ok_or(NS_ERROR_UNEXPECTED)?,
            ));
        };

        // Fall back to baseDomain (eTLD+1) for general domain matches
        // (e.g., "example.com" from "sub.example.com")
        let mut base_domain = nsCString::new();
        // SAFETY: The caller passes an valid string object
        unsafe { principal.GetBaseDomain(&mut *base_domain) }.to_result()?;

        if let Some(category) = categories.get(&base_domain.to_string()) {
            return Ok(nsCString::from(
                category.as_str().ok_or(NS_ERROR_UNEXPECTED)?,
            ));
        };

        return Ok(nsCString::from("other"));
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn new_site_category(
    iid: *const xpcom::nsIID,
    result: *mut *mut xpcom::reexports::libc::c_void,
) -> nsresult {
    let service = SiteCategory::allocate(InitSiteCategory {
        categories: RefCell::new(LazyCell::new(SiteCategory::parse_categories)),
    });
    if let Err(err) = service.observe_pref() {
        return err;
    }
    // SAFETY: The caller is responsible to pass a valid IID and pointer-to-pointer.
    unsafe { service.QueryInterface(iid, result) }
}
