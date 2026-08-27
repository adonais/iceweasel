/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

/*
 * The lint tasks assemble their command line when they run, so a setting read from the extension at
 * that point is invisible to Gradle unless it is also declared as an input. Left undeclared, changing
 * something like `libraryVersion` leaves the tasks up to date and the lint quietly does not re-run.
 */

/** Declares the settings that decide which lint failures are reported. */
internal fun PythonExec.declareLintFilterInputs(extension: ApiLintPluginExtension) {
    inputs.property("lintFilters", extension.lintFilters)
    inputs.property("allowedPackages", extension.allowedPackages)
}

/** Declares the settings that drive the deprecation schedule checks. */
internal fun PythonExec.declareDeprecationInputs(extension: ApiLintPluginExtension) {
    inputs.property("deprecationAnnotation", extension.deprecationAnnotation).optional(true)
    inputs.property("libraryVersion", extension.libraryVersion).optional(true)
}
