/* This Source Code Form is subject to the terms of the Mozilla Publicpypimod
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod callables;
mod callback_interfaces;
mod context;
mod custom;
mod defaults;
mod docs;
mod enums;
mod ffi_types;
mod interfaces;
mod js_docstrings;
mod namespaces;
pub mod nodes;
mod records;
mod root;
mod scaffolding_calls;
mod types;

use std::collections::{HashMap, HashSet};

use anyhow::{anyhow, bail, Result};
use heck::{ToLowerCamelCase, ToShoutySnakeCase, ToUpperCamelCase};
use uniffi_bindgen::pipeline::{general, initial};
use uniffi_pipeline::{MapNode, Node, Pipeline};

use super::Config;
pub use context::Context;
pub use nodes::*;

pub type GeckoPipeline = Pipeline<initial::Root, Root>;

pub fn gecko_js_pipeline(config_map: HashMap<String, Config>) -> GeckoPipeline {
    general::pipeline("gecko-js").pass::<Root, Context>(Context::new(config_map))
}
