/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use anyhow::Result;
use uniffi_bindgen::BindgenPaths;

// Generate a BindgenPaths to use for the pipeline
pub fn gecko_js_bindgen_paths() -> Result<BindgenPaths> {
    let mut paths = BindgenPaths::default();
    paths.add_cargo_metadata_layer(false)?;
    Ok(paths)
}
