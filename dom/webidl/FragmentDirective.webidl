/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://wicg.github.io/scroll-to-text-fragment/
 */
[Exposed=Window]
interface FragmentDirective {
    [ChromeOnly]
    sequence<Range> getTextDirectiveRanges();

    [ChromeOnly, Throws]
    undefined removeAllTextDirectives();

    [ChromeOnly]
    Promise<DOMString> createTextDirectiveForRanges(sequence<Range> ranges);
};
