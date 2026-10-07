/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Own modules, currently everything is exposed, will need to limit
pub mod blocker;
#[cfg(feature = "content-blocking")]
pub mod content_blocking;
pub mod cosmetic_filter_cache;
mod cosmetic_filter_cache_builder;
mod cosmetic_filter_utils;
mod data_format;
pub mod engine;
pub mod filters;
mod flatbuffers;
pub mod lists;
#[cfg(feature = "malloc-size-of")]
pub mod malloc_size_of_impls;
mod network_filter_list;
mod optimizer;
pub mod regex_manager;
pub mod request;
pub mod resources;
pub mod url_parser;

#[doc(hidden)]
pub mod utils;

#[doc(inline)]
pub use engine::Engine;
#[doc(inline)]
pub use lists::FilterSet;

#[cfg(test)]
mod sync_tests {
    #[allow(unused)]
    fn static_assert_sync<S: Sync>() {
        let _ = core::marker::PhantomData::<S>;
    }

    #[test]
    #[cfg(not(feature = "single-thread"))]
    fn assert_engine_sync() {
        static_assert_sync::<crate::engine::Engine>();
    }
}
