/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.navigation

import java.lang.reflect.Field
import org.mozilla.fenix.ui.efficiency.helpers.BasePage
import org.mozilla.fenix.ui.efficiency.helpers.PageContext

/**
 * Discovers the modeled UI surface from [PageContext], keeping generated coverage and graph validation from depending
 * on a second, manually synchronized page list.
 */
object PageCatalog {

    data class PageRef(
        val propertyName: String,
        val getter: PageContext.() -> BasePage,
        val kind: PageObjectKind,
    )

    fun discoverPages(): List<PageRef> {
        val refs = mutableListOf<PageRef>()

        for (field in PageContext::class.java.declaredFields) {
            if (!BasePage::class.java.isAssignableFrom(field.type)) continue

            refs += buildPageRef(field)
        }

        return refs.sortedBy { it.propertyName }
    }

    fun discoverNavigablePages(): List<PageRef> = discoverPages().filter { it.kind == PageObjectKind.NAVIGABLE }

    private fun buildPageRef(field: Field): PageRef {
        field.isAccessible = true

        return PageRef(
            propertyName = field.name,
            kind = field.type.getAnnotation(PageObjectContract::class.java)?.kind ?: PageObjectKind.NAVIGABLE,
            getter = {
                field.isAccessible = true
                val value = field.get(this)
                require(value is BasePage) {
                    "Expected BasePage for field '${field.name}', got ${value?.javaClass}"
                }
                value
            },
        )
    }
}
