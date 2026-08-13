/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::collections::{hash_map::Entry, HashMap};

use thin_vec::ThinVec;
use url::Url;

use crate::{
    Eagerness, PrefetchCandidate, PrefetchCandidates, SpeculationRule, SpeculationRuleSet,
};

impl SpeculationRule {
    pub fn consider_speculative_loads(&self, candidates: &mut ThinVec<PrefetchCandidate>) {
        // https://html.spec.whatwg.org/#inner-consider-speculative-loads-steps
        // Step 3.1.1-3.1.2.
        // We do not currently implement cross-origin prefetch, and so do not implement
        // cross-origin prefetch IP anonymization.
        let anonymization_policy = None;

        // Step 3.1.3.
        candidates.extend(self.urls.iter().map(|url| PrefetchCandidate {
            url: url.clone(),
            no_vary_search_hint: self.no_vary_search_hint.clone(),
            eagerness: self.eagerness,
            // Computing a speculative load referrer policy given rule and a null link
            // is equivalent to just using the rule's referrer policy.
            referrer_policy: self.referrer_policy,
            tags: self.tags.iter().cloned().collect(),
            anonymization_policy: anonymization_policy.clone(),
        }));

        // TODO(avandolder): Step 3.1.4, handling predicate speculation rules.
    }
}

impl SpeculationRuleSet {
    pub fn consider_speculative_loads(&self, candidates: &mut ThinVec<PrefetchCandidate>) {
        // https://html.spec.whatwg.org/#inner-consider-speculative-loads-steps
        // Step 3.1.
        self.0
            .iter()
            .for_each(|rule| rule.consider_speculative_loads(candidates));
    }
}

impl PrefetchCandidates {
    pub fn group(&mut self) {
        // https://html.spec.whatwg.org/#inner-consider-speculative-loads-steps
        // This corresponds to Steps 5 and 6, however, the groups are ultimately stored
        // in place of the original candidates.

        // Rather than maintaining a list of candidates in each group, we only store the single
        // representative candidate, and append the tags from each other candidate onto it.
        // Also, as we do not currently implement No-Vary-Search hints for speculation rules,
        // we can group candidates by their url directly.
        let mut groups: HashMap<Url, PrefetchCandidate> = HashMap::new();

        for candidate in std::mem::take(&mut self.0) {
            // Each group contains only those candidates with an eagerness at least as eager as its
            // representative candidate. As we only currently implement support for immediate eagerness,
            // we simply drop all less-eager candidates.
            if candidate.eagerness < Eagerness::Immediate {
                continue;
            }

            match groups.entry(candidate.url) {
                Entry::Occupied(mut group) => {
                    let group = group.get_mut();
                    // Step 7.1.2, which calls #collect-tags-from-speculative-load-candidates,
                    // collects the tags from all the candidates in the group, sorted in ascending
                    // order, with nulls at the front.
                    // Since we only store the representative candidate in the group, we instead
                    // collect the tags as we go, storing them in a b-tree set, which keeps them
                    // in sorted order.
                    group.tags.extend(candidate.tags);
                }
                Entry::Vacant(slot) => {
                    let url = slot.key().clone();
                    slot.insert(PrefetchCandidate { url, ..candidate });
                }
            }
        }

        // The candidates here end up in a randomized order, unlike the fixed order within the spec.
        // However, as this only determines the order prefetches will be fired in, and not which
        // prefetches will be fired, this should be equivalent.
        self.0 = groups.into_values().collect();
    }
}
