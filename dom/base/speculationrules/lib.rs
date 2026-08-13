/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::collections::BTreeSet;

use nsstring::{nsACString, nsCString};
use thin_vec::{thin_vec, ThinVec};
use url::{Origin, Url};
use urlpattern::UrlPattern;

mod consider_loads;
mod parser;

#[derive(Debug)]
pub struct SpeculationRuleSet(pub ThinVec<SpeculationRule>);

#[derive(Debug, Default, Clone)]
pub enum UrlSearchVariance {
    #[default]
    Default,
    String(String),
}

#[allow(dead_code)]
#[derive(Debug)]
pub struct Selector(String);

#[derive(Debug, Clone, Copy, Eq, PartialEq, PartialOrd, Ord, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
#[repr(u8)]
pub enum Eagerness {
    Conservative,
    Moderate,
    Eager,
    Immediate,
}

// NOTE: Keep this in sync with the definition in dom/webidl/ReferrerPolicy.webidl.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
#[repr(u8)]
pub enum ReferrerPolicy {
    #[serde(rename = "")]
    Empty,
    NoReferrer,
    NoReferrerWhenDowngrade,
    Origin,
    OriginWhenCrossOrigin,
    UnsafeUrl,
    SameOrigin,
    StrictOrigin,
    StrictOriginWhenCrossOrigin,
}

#[derive(Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Requirement {
    AnonymousClientIpWhenCrossOrigin,
}

#[derive(Debug)]
pub enum Predicate {
    Conjunction(ThinVec<Predicate>),
    Disjunction(ThinVec<Predicate>),
    Negation(Box<Predicate>),
    UrlPattern(ThinVec<UrlPattern>),
    Selector(ThinVec<Selector>),
}

#[allow(dead_code)]
#[derive(Debug)]
pub struct SpeculationRule {
    urls: ThinVec<Url>,
    predicate: Option<Predicate>,
    eagerness: Eagerness,
    referrer_policy: ReferrerPolicy,
    tags: ThinVec<Option<String>>,
    requirements: ThinVec<Requirement>,
    no_vary_search_hint: UrlSearchVariance,
}

#[derive(Debug, Default)]
#[repr(C)]
pub enum SpeculationRuleParseError {
    #[default]
    None,
    TopLevelValueMustBeJsonObject,
    InvalidTag,
    InvalidBaseUrl,
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn parse_speculation_rule_set(
    rules: &nsACString,
    document_base_url: &nsACString,
    base_url: &nsACString,
    parse_error: &mut SpeculationRuleParseError,
) -> *mut SpeculationRuleSet {
    // This will fail if this has already been called, but this isn't a problem because either way,
    // logging has been initialized.
    let _ = env_logger::try_init();

    *parse_error = SpeculationRuleParseError::None;
    let Ok(document_base_url) = Url::parse(&document_base_url.to_utf8()) else {
        *parse_error = SpeculationRuleParseError::InvalidBaseUrl;
        return std::ptr::null_mut();
    };
    let Ok(base_url) = Url::parse(&base_url.to_utf8()) else {
        *parse_error = SpeculationRuleParseError::InvalidBaseUrl;
        return std::ptr::null_mut();
    };
    match SpeculationRuleSet::parse(&rules.to_utf8(), &document_base_url, &base_url) {
        Ok(rules) => Box::leak(Box::new(rules)),
        Err(error) => {
            *parse_error = error;
            std::ptr::null_mut()
        }
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn speculation_rule_set_destroy(rules: *mut SpeculationRuleSet) {
    let _ = unsafe { Box::from_raw(rules) };
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn consider_speculative_loads_for_rule_set(
    rules: &SpeculationRuleSet,
    candidates: &mut PrefetchCandidates,
) {
    rules.consider_speculative_loads(&mut candidates.0);
}

#[allow(unused)]
#[derive(Debug, Clone)]
pub struct PrefetchCandidate {
    url: Url,
    no_vary_search_hint: UrlSearchVariance,
    eagerness: Eagerness,
    referrer_policy: ReferrerPolicy,
    tags: BTreeSet<Option<String>>,
    anonymization_policy: Option<Origin>,
}

#[derive(Debug)]
pub struct PrefetchCandidates(pub ThinVec<PrefetchCandidate>);

#[unsafe(no_mangle)]
pub unsafe extern "C" fn create_prefetch_candidates() -> *mut PrefetchCandidates {
    Box::into_raw(Box::new(PrefetchCandidates(thin_vec![])))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn prefetch_candidates_destroy(candidates: *mut PrefetchCandidates) {
    let _ = unsafe { Box::from_raw(candidates) };
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn prefetch_candidates_length(candidates: &PrefetchCandidates) -> usize {
    candidates.0.len()
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn prefetch_candidates_group(candidates: &mut PrefetchCandidates) {
    candidates.group();
}

// FfiPrefetchCandidate allows prefetch candidates to be passed safely as fully C++ objects
// without having to manage complex lifetimes of joint Rust-C++ objects.
#[repr(C)]
pub struct FfiPrefetchCandidate {
    url: nsCString,
    tags: ThinVec<nsCString>,
    eagerness: Eagerness,
    referrer_policy: ReferrerPolicy,
}

impl From<&PrefetchCandidate> for FfiPrefetchCandidate {
    fn from(value: &PrefetchCandidate) -> Self {
        Self {
            url: value.url.as_ref().into(),
            tags: value
                .tags
                .iter()
                .map(|tag| match tag {
                    Some(t) => t.into(),
                    None => {
                        let mut s = nsCString::new();
                        s.set_is_void(true);
                        s
                    }
                })
                .collect(),
            eagerness: value.eagerness,
            referrer_policy: value.referrer_policy,
        }
    }
}

impl PrefetchCandidates {
    pub fn as_ffi_array(&self) -> ThinVec<FfiPrefetchCandidate> {
        self.0.iter().map(|candidate| candidate.into()).collect()
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn prefetch_candidates_as_array(
    candidates: &PrefetchCandidates,
    result: &mut ThinVec<FfiPrefetchCandidate>,
) {
    *result = candidates.as_ffi_array();
}
