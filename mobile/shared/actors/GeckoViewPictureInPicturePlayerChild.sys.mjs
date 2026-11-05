/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PictureInPictureChild } from "moz-src:///toolkit/actors/PictureInPictureChild.sys.mjs";

// The player side of picture-in-picture is identical to desktop's: clone the source video into
// this document, mirror its styling, and stop cloning when the document goes away. Only the
// parent differs, because GeckoView has no XUL player window to drive. The subclass exists
// solely because JSWindowActor resolves the class name from the actor name.
export class GeckoViewPictureInPicturePlayerChild extends PictureInPictureChild {}
