/* -*- Mode: IDL; tab-width: 2; indent-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://wicg.github.io/container-timing/
 */

[Pref="dom.enable_container_timing",
 Exposed=Window]
interface PerformanceContainerTiming : PerformanceEntry {
    readonly attribute DOMString identifier;
    readonly attribute DOMRectReadOnly intersectionRect;
    readonly attribute unsigned long long size;
    readonly attribute DOMHighResTimeStamp firstRenderTime;
    // The spec types lastPaintedElement as HTMLElement?, but non-HTML content
    // (e.g. an SVG image) can paint into a container and be the largest
    // contributor; see https://github.com/WICG/container-timing/issues/71.
    readonly attribute Element? lastPaintedElement;
    readonly attribute HTMLElement? rootElement;
    [Default] object toJSON();
};

PerformanceContainerTiming includes PaintTimingMixin;
