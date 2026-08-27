/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://w3c.github.io/mathml-core/#dom-mathmlanchorelement
 */

[
  Exposed=Window,
  Pref="mathml.a.element.enabled"
]
interface MathMLAnchorElement : MathMLElement {
  [HTMLConstructor] constructor();

  [CEReactions, SetterThrows] attribute USVString href;
  [CEReactions, SetterThrows] attribute DOMString target;
};

MathMLAnchorElement includes HyperlinkElementUtils;
