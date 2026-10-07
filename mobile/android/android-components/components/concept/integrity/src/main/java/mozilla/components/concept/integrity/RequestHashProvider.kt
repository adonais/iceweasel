/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.concept.integrity

/** Generates a hash value to uniquely identify a request. */
fun interface RequestHashProvider {

    /**
     * Generates a new request hash.
     *
     * Implementations should return a value that is sufficiently unique for the lifetime and scope of a request.
     *
     * @return A newly generated hash string.
     */
    fun generateHash(): String
}
