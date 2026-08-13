/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.tooling.detekt.naming

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtClassOrObject
import org.jetbrains.kotlin.psi.KtEnumEntry

/**
 * Enforces the Kotlin coding convention for acronyms in class names as outlined in
 * [Kotlin coding conventions](https://kotlinlang.org/docs/coding-conventions.html#choose-good-names).
 *
 * - Two-letter acronyms stay fully uppercase (e.g. `IOStream`).
 * - Acronyms longer than two letters capitalize only the first letter (e.g. `XmlFormatter`, `HttpInputStream`).
 */
class ClassAcronymCasingRule(config: Config = Config.empty) : Rule(config) {

    override val issue = Issue(
        id = "ClassAcronymCasing",
        severity = Severity.Style,
        description = "Acronym longer than two letters not properly capitalized. " +
            "Per the Kotlin coding conventions, two-letter acronyms in a class name " +
            "stay fully uppercase (e.g. `IOStream`), but acronyms longer than two letters " +
            "capitalize only the first letter (e.g. `XmlFormatter`, `HttpInputStream`).",
        debt = Debt.FIVE_MINS,
    )

    override fun visitClassOrObject(classOrObject: KtClassOrObject) {
        super.visitClassOrObject(classOrObject)

        // Enum entries are constants, not type declarations - the convention's all-caps rule
        // doesn't apply to them.
        if (classOrObject is KtEnumEntry) return

        // Anonymous declarations (e.g. `object : Foo {}`) have no name to lint.
        val name = classOrObject.name ?: return
        if (!name.isReportableIdentifier()) return

        checkAcronymCasing(classOrObject, name)
    }

    private fun String.isReportableIdentifier() = isNotEmpty() && all(Char::isLetterOrDigit)

    private fun checkAcronymCasing(
        element: KtClassOrObject,
        name: String,
    ) {
        val words = splitCamelCase(name)
        // No all-uppercase run longer than ACRONYM_MAX_LENGTH -> nothing to flag.
        val longAcronym = words.firstOrNull(::isLongAcronym) ?: return

        val suggestedName = words.joinToString(separator = "") { word ->
            if (isLongAcronym(word)) {
                word.lowercase().replaceFirstChar { it.uppercaseChar() }
            } else {
                word
            }
        }
        report(
            CodeSmell(
                issue = issue,
                entity = Entity.atName(element),
                message = "Acronym `$longAcronym` in class name `$name` has more than" +
                    " two letters and should capitalize only the first letter, e.g. `$suggestedName`.",
            ),
        )
    }
}

/**
 * Threshold from the Kotlin convention: two-letter acronyms stay all caps, three or more letters
 * must title-case instead.
 */
private const val ACRONYM_MAX_LENGTH = 2

/**
 * True if [word] is an all-uppercase run longer than [ACRONYM_MAX_LENGTH] - i.e. the kind of
 * acronym the Kotlin coding convention says should be title-cased instead of all caps.
 */
private fun isLongAcronym(word: String): Boolean =
    word.length > ACRONYM_MAX_LENGTH && word.all(Char::isUpperCase)

/**
 * Splits a PascalCase/camelCase identifier into word-like letter and digit runs.
 *
 * Boundaries are inserted between:
 * - lowercase and uppercase letters: `get|URL`
 * - an uppercase acronym and a following capitalized word: `XML|Http`
 * - letters and digits: `HTML|5|Parser`
 *
 * Examples:
 * - `XMLHttpRequest` -> [`XML`, `Http`, `Request`]
 * - `IOInputStream` -> [`IO`, `Input`, `Stream`]
 * - `getURL` -> [`get`, `URL`]
 * - `HTML5Parser` -> [`HTML`, `5`, `Parser`]
 */
private fun splitCamelCase(name: String): List<String> {
    // The boundary loop indexes from 1, so an empty input would otherwise wrap around.
    if (name.isEmpty()) return emptyList()

    val words = mutableListOf<String>()
    var start = 0

    for (i in 1 until name.length) {
        if (isCamelCaseBoundary(name, i)) {
            words.add(name.substring(start, i))
            start = i
        }
    }

    words.add(name.substring(start))
    return words
}

private fun isCamelCaseBoundary(name: String, index: Int): Boolean {
    val previousLetter = name[index - 1]
    val currentLetter = name[index]
    val nextLetter = name.getOrNull(index + 1)

    val isLowerToUpper = previousLetter.isLowerCase() && currentLetter.isUpperCase()
    val isPascalWordStart =
        previousLetter.isUpperCase() && currentLetter.isUpperCase() && nextLetter?.isLowerCase() == true

    val isLetterDigitBoundary =
        (previousLetter.isLetter() && currentLetter.isDigit()) ||
            (previousLetter.isDigit() && currentLetter.isLetter())

    return isLowerToUpper || isPascalWordStart || isLetterDigitBoundary
}
