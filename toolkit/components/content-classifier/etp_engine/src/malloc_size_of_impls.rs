/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

//! `MallocSizeOf` implementations for the types that own the engine's heap, so
//! that Gecko can report it in about:memory, plus the per-component breakdown
//! that reporter shows.
//!
//! These live in one module rather than next to each type to keep the diff
//! against upstream adblock-rust confined to files upstream does not have.
//! [`crate::engine::Engine`] is the exception: only it can reach its private
//! `filter_data_context`.

use malloc_size_of::{MallocShallowSizeOf, MallocSizeOf, MallocSizeOfOps};

use crate::blocker::Blocker;
use crate::cosmetic_filter_cache::CosmeticFilterCache;
use crate::filters::filter_data_context::FilterDataContextRef;
use crate::flatbuffers::unsafe_tools::VerifiedFlatbufferMemory;
use crate::resources::ResourceStorage;

/// Heap usage of an [`crate::engine::Engine`], split by what holds it.
///
/// Anything the engine allocates belongs in exactly one field, so a consumer
/// reporting the fields separately reports the whole engine and counts nothing
/// twice.
#[derive(Debug, Default)]
pub struct EngineMemoryBreakdown {
    /// Allocations that only hold other measured data: today just the refcount
    /// box the filter data sits in. Excludes the `Engine` struct itself, which
    /// the caller measures.
    pub objects: usize,

    /// The verified flatbuffer holding every parsed rule. Normally almost all
    /// of the engine.
    pub filter_rules: usize,

    /// The domain-hash index rebuilt in memory when the flatbuffer is loaded.
    pub domain_hashes: usize,

    /// The regex lookup table, excluding the compiled regexes it holds.
    pub regex_table: usize,

    /// The set of enabled tag names.
    pub enabled_tags: usize,

    /// Whatever the cosmetic filter cache owns beyond the filter data it shares
    /// with the matcher. Nothing today; see [`Self::add_cosmetic_cache`].
    pub cosmetic_cache: usize,

    /// The boxed resource backend, excluding whatever it stores.
    pub resources: usize,
}

impl EngineMemoryBreakdown {
    pub(crate) fn add_filter_data(
        &mut self,
        filter_data: &FilterDataContextRef,
        ops: &mut MallocSizeOfOps,
    ) {
        // The refcount box stores `FilterDataContext` past the counters, so the
        // pointer is interior to the allocation and only the enclosing
        // measurement can size it.
        if ops.has_malloc_enclosing_size_of() {
            self.objects +=
                unsafe { ops.malloc_enclosing_size_of(FilterDataContextRef::as_ptr(filter_data)) };
        }
        self.filter_rules += filter_data.memory.size_of(ops);
        // The keys and values hold no heap of their own, so the shallow
        // measurement covers the whole table.
        self.domain_hashes += filter_data.unique_domains_hashes_map.shallow_size_of(ops);
    }

    pub(crate) fn add_blocker(&mut self, blocker: &Blocker, ops: &mut MallocSizeOfOps) {
        // `blocker.filter_data_context` is deliberately not measured here;
        // `Engine` holds the primary reference and measures it exactly once.
        self.enabled_tags += blocker.tags_enabled.size_of(ops);

        if let Some(regex_manager) = blocker.try_borrow_regex_manager() {
            self.regex_table += regex_manager.table_size_of(ops);
        }
    }

    /// `CosmeticFilterCache` currently holds nothing but a clone of the
    /// reference `Engine` already measured, so this adds nothing: the rules it
    /// serves are counted under `filter_rules`. It is still visited so that a
    /// field added to it is measured rather than silently dropped.
    pub(crate) fn add_cosmetic_cache(
        &mut self,
        _cosmetic_cache: &CosmeticFilterCache,
        _ops: &mut MallocSizeOfOps,
    ) {
    }

    pub(crate) fn add_resources(&mut self, resources: &ResourceStorage, ops: &mut MallocSizeOfOps) {
        self.resources += resources.backend_size_of(ops);
    }
}

impl Blocker {
    /// A report can arrive while a classification holds the borrow. Callers
    /// skip the measurement rather than block or panic.
    #[cfg(feature = "single-thread")]
    pub(crate) fn try_borrow_regex_manager(
        &self,
    ) -> Option<std::cell::Ref<'_, crate::regex_manager::RegexManager>> {
        self.regex_manager.try_borrow().ok()
    }

    #[cfg(not(feature = "single-thread"))]
    pub(crate) fn try_borrow_regex_manager(
        &self,
    ) -> Option<std::sync::MutexGuard<'_, crate::regex_manager::RegexManager>> {
        self.regex_manager.try_lock().ok()
    }
}

impl MallocSizeOf for VerifiedFlatbufferMemory {
    fn size_of(&self, ops: &mut MallocSizeOfOps) -> usize {
        // Measured through the backing `Vec`, whose pointer is the start of the
        // allocation. `data()` sits past the alignment padding, so measuring it
        // would go through the enclosing-size-of function and report 0 on
        // builds without jemalloc.
        self.backing_vec().shallow_size_of(ops)
    }
}
