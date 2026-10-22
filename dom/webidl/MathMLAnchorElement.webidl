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

  // FIXME: This is different from the current MathML core spec.
  // We should move attributes below to HyperlinkElementUtils mixin
  // once we are ready to share the mixin with HTML and SVG anchor element.
  // We have these attributes temporarily in MathMLAnchorElement.idl for now.
  [CEReactions, SetterThrows] attribute DOMString download;
  [CEReactions, SetterThrows] attribute USVString ping;
  [CEReactions, SetterThrows] attribute DOMString rel;
  [PutForwards=value] readonly attribute DOMTokenList relList;
  [CEReactions, SetterThrows] attribute DOMString referrerPolicy;
};

MathMLAnchorElement includes HyperlinkElementUtils;
