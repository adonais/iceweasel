/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.apilint

open class ApiLintPluginExtension {
    var packageFilter: String = "." // By default all packages are part of the api
    var apiOutputFileName: String = "api.txt"
    var currentApiRelativeFilePath: String = "api.txt"
    var jsonResultFileName: String = "apilint-result.json"
    var skipClassesRegex: List<String> = emptyList()

    var changelogFileName: String? = null
    var lintFilters: List<String>? = null
    var allowedPackages: List<String>? = null
    var deprecationAnnotation: String? = null
    var libraryVersion: Int? = null

    // When API differences exist, print this command.  Takes a single
    // `variantName` argument.  Running this command manually should invoke the
    // `apiUpdateFile...` command to update the API file so that the API
    // differences are incorporated into the expected API.
    var helpCommand: (String) -> String = { variantName -> "\$ ./gradlew apiUpdateFile${variantName}" }
}
