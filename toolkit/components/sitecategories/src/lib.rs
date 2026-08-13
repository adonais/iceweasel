/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! # Site Categories
//!
//! This crate provides site category lookup for telemetry purposes.

use std::cell::LazyCell;

use nserror::{nsresult, NS_ERROR_UNEXPECTED, NS_OK};
use nsstring::{nsACString, nsCString};
use serde_json::{Map, Value};
use xpcom::interfaces::nsIPrincipal;
use xpcom::{xpcom, xpcom_method};

#[xpcom(implement(nsISiteCategory), nonatomic)]
struct SiteCategory {
    categories: LazyCell<Result<Map<String, Value>, nsresult>>,
}

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

    xpcom_method!(get_category => GetCategory(principal: *const nsIPrincipal) -> nsACString);
    fn get_category(&self, principal: &nsIPrincipal) -> Result<nsCString, nsresult> {
        let categories = (&*self.categories).as_ref().map_err(|err| err.to_owned())?;

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
        categories: LazyCell::new(SiteCategory::parse_categories),
    });
    // SAFETY: The caller is responsible to pass a valid IID and pointer-to-pointer.
    unsafe { service.QueryInterface(iid, result) }
}
