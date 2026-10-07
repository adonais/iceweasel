/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

use anyhow::Result;
use crash_helper_common::ApplicationInfo;
use mozannotation_server::CAnnotation;

/// Create the annotations that are specific to this platform, there are none
/// at the moment.
pub(crate) fn create_platform_specific_annotations(
    _app_info: &ApplicationInfo,
) -> Result<Vec<CAnnotation>> {
    Ok(Vec::new())
}
