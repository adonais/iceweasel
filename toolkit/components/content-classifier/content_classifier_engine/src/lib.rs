/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::os::raw::c_void;
use std::sync::Mutex;

use cstr::cstr;
use etp_engine::Engine;
use malloc_size_of::MallocSizeOfOps;
use nserror::{nsresult, NS_ERROR_INVALID_ARG, NS_ERROR_SERVICE_NOT_AVAILABLE, NS_OK};
use nsstring::{nsACString, nsCString};
use thin_vec::ThinVec;

use xpcom::interfaces::nsIEffectiveTLDService;

static ETLD_SERVICE: Mutex<Option<xpcom::RefPtr<nsIEffectiveTLDService>>> = Mutex::new(None);

pub struct ContentClassifierFFIEngine {
    engine: Engine,
}

#[no_mangle]
pub unsafe extern "C" fn content_classifier_initialize_domain_resolver() -> nsresult {
    let etld_service = match xpcom::get_service::<nsIEffectiveTLDService>(cstr!(
        "@mozilla.org/network/effective-tld-service;1"
    )) {
        Some(s) => s,
        None => return NS_ERROR_SERVICE_NOT_AVAILABLE,
    };
    if let Ok(mut guard) = ETLD_SERVICE.lock() {
        guard.replace(etld_service);
    }
    let resolver = Box::new(SchemelessSiteResolver {});
    let _ = etp_engine::url_parser::set_domain_resolver(resolver);
    return NS_OK;
}

#[no_mangle]
pub extern "C" fn content_classifier_teardown_domain_resolver() {
    if let Ok(mut guard) = ETLD_SERVICE.lock() {
        guard.take();
    }
}

#[no_mangle]
pub unsafe extern "C" fn content_classifier_engine_from_rules(
    rules: &ThinVec<nsCString>,
    out_engine: *mut *mut ContentClassifierFFIEngine,
) -> nsresult {
    if out_engine.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let rules_vec: Vec<String> = rules
        .iter()
        .map(|r| String::from_utf8_lossy(r.as_ref()).to_string())
        .collect();

    let engine = Engine::from_rules(rules_vec, etp_engine::lists::ParseOptions::default());

    let boxed_engine = Box::new(ContentClassifierFFIEngine { engine });
    *out_engine = Box::into_raw(boxed_engine);
    NS_OK
}

#[no_mangle]
pub unsafe extern "C" fn content_classifier_engine_destroy(
    engine: *mut ContentClassifierFFIEngine,
) {
    if !engine.is_null() {
        drop(Box::from_raw(engine));
    }
}

/// Mirrors `mozilla::MallocSizeOf`. Supplied by the caller so the measurement
/// uses the same function as the reporter driving it, rather than a second one
/// linked against here.
pub type ContentClassifierMallocSizeOf = unsafe extern "C" fn(ptr: *const c_void) -> usize;

/// Heap usage of one engine, split by what holds it, so that about:memory can
/// show a breakdown instead of a single number. Every field is bytes.
#[repr(C)]
#[derive(Default)]
pub struct ContentClassifierEngineSizes {
    /// The Rust wrapper, the `Engine` stored inline in it, and, when an
    /// enclosing-size function is available, the refcount box holding the
    /// filter data. Excludes the heap those point to, which the fields below
    /// account for.
    pub objects: usize,
    /// The flatbuffer holding every parsed rule.
    pub filter_rules: usize,
    /// The domain-hash index rebuilt in memory when the rules are loaded.
    pub domain_hashes: usize,
    /// The regex lookup table, excluding the compiled regexes it holds.
    pub regex_table: usize,
    /// The set of enabled tag names.
    pub enabled_tags: usize,
    /// Whatever the cosmetic filter cache owns beyond the filter data it
    /// shares with the matcher.
    pub cosmetic_cache: usize,
    /// The boxed resource backend, excluding whatever it stores.
    pub resources: usize,
}

/// `malloc_enclosing_size_of` sizes an allocation from an interior pointer.
/// Builds without jemalloc have no such function and pass null; the hash
/// tables are then estimated from their capacity, and the refcount box behind
/// the filter data is left out of `objects`.
///
/// The nullable parameter spells the function type out because cbindgen only
/// collapses `Option` of a function pointer, not of an alias to one.
#[no_mangle]
pub unsafe extern "C" fn content_classifier_engine_size_of(
    engine: *const ContentClassifierFFIEngine,
    malloc_size_of: ContentClassifierMallocSizeOf,
    malloc_enclosing_size_of: Option<unsafe extern "C" fn(ptr: *const c_void) -> usize>,
) -> ContentClassifierEngineSizes {
    if engine.is_null() {
        return ContentClassifierEngineSizes::default();
    }

    let mut ops = MallocSizeOfOps::new(malloc_size_of, malloc_enclosing_size_of);
    let breakdown = (*engine).engine.memory_breakdown(&mut ops);

    ContentClassifierEngineSizes {
        objects: malloc_size_of(engine.cast::<c_void>()) + breakdown.objects,
        filter_rules: breakdown.filter_rules,
        domain_hashes: breakdown.domain_hashes,
        regex_table: breakdown.regex_table,
        enabled_tags: breakdown.enabled_tags,
        cosmetic_cache: breakdown.cosmetic_cache,
        resources: breakdown.resources,
    }
}

#[no_mangle]
pub unsafe extern "C" fn content_classifier_engine_check_network_request_preparsed(
    engine: *const ContentClassifierFFIEngine,
    url: &nsACString,
    hostname: &nsACString,
    source_hostname: &nsACString,
    request_type: &nsACString,
    third_party: bool,
    previously_matched_rule: bool,
    out_matched: *mut bool,
    out_important: *mut bool,
    out_exception: *mut nsCString,
) -> nsresult {
    if engine.is_null() || out_matched.is_null() || out_important.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let engine = &(*engine).engine;

    let url_str = String::from_utf8_lossy(url.as_ref()).to_string();
    let hostname_str = String::from_utf8_lossy(hostname.as_ref()).to_string();
    let source_hostname_str = String::from_utf8_lossy(source_hostname.as_ref()).to_string();
    let request_type_str = String::from_utf8_lossy(request_type.as_ref()).to_string();

    let request = etp_engine::request::Request::preparsed(
        &url_str,
        &hostname_str,
        &source_hostname_str,
        &request_type_str,
        third_party,
    );

    let result = engine.check_network_request_subset(&request, previously_matched_rule, false);

    *out_matched = result.matched;
    *out_important = result.important;

    if !out_exception.is_null() {
        if let Some(exception) = result.exception {
            (*out_exception).assign(&exception);
        } else {
            (*out_exception).truncate();
        }
    }

    NS_OK
}

struct SchemelessSiteResolver {}

impl etp_engine::url_parser::ResolvesDomain for SchemelessSiteResolver {
    fn get_host_domain(&self, host: &str) -> (usize, usize) {
        let guard = match ETLD_SERVICE.lock() {
            Ok(g) => g,
            Err(_) => return (0, host.len()),
        };
        let etld_service = match guard.as_ref() {
            Some(s) => s,
            None => return (0, host.len()),
        };

        let mut host_cstring = nsCString::new();
        host_cstring.assign(host);

        let mut base_domain = nsCString::new();

        unsafe {
            if etld_service
                .GetBaseDomainFromHost(&*host_cstring, 0, &mut *base_domain)
                .succeeded()
            {
                let base_domain_len = base_domain.len();
                if base_domain_len > 0 && base_domain_len <= host.len() {
                    return (host.len() - base_domain_len, host.len());
                }
            }
        }

        (0, host.len())
    }
}
