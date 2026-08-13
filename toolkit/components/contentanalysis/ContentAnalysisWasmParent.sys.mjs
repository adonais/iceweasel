/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Parent-process half of the content-analysis WebAssembly runner actor. It is
 * intentionally thin: ContentAnalysisWasmRunner obtains this actor via
 * ChromeUtils.ensureHeadlessContentProcess + getActor and calls the child.
 */
export class ContentAnalysisWasmParent extends JSProcessActorParent {}
