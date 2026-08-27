/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://drafts.csswg.org/web-animations-2/#the-animation-interface
 *
 * Copyright © 2015 W3C® (MIT, ERCIM, Keio), All Rights Reserved. W3C
 * liability, trademark and document use rules apply.
 */

enum AnimationPlayState { "idle", "running", "paused", "finished" };

enum AnimationReplaceState { "active", "removed", "persisted" };

[Exposed=Window]
interface Animation : EventTarget {
  [Throws]
  constructor(optional AnimationEffect? effect = null,
              optional AnimationTimeline? timeline);

  attribute DOMString id;
  [Pure]
  attribute AnimationEffect? effect;
  [BinaryName="timelineFromJS"]
  attribute AnimationTimeline? timeline;

  [SetterThrows]
  attribute CSSNumberish? startTime;
  [SetterThrows]
  attribute CSSNumberish? currentTime;

  // https://drafts.csswg.org/web-animations-2/#dom-animation-rangestart
  // The spec type is
  //   (TimelineRangeOffset or CSSNumericValue or CSSKeywordValue or DOMString),
  // but WebIDL forbids an attribute whose union has a dictionary member
  // (TimelineRangeOffset), so we type these as `any` and do the union
  // conversion/serialization by hand (the setter accepts the same four types,
  // matching KeyframeAnimationOptions rangeStart/rangeEnd). The getter returns a
  // TimelineRangeOffset or the string "normal".
  // TODO: After the spec issue is resolved, revisit this issue:
  // https://github.com/w3c/csswg-drafts/issues/14205
  // https://bugzilla.mozilla.org/show_bug.cgi?id=2057261
  [Pref="layout.css.scroll-driven-animations.enabled", Throws]
  attribute any rangeStart;
  [Pref="layout.css.scroll-driven-animations.enabled", Throws]
  attribute any rangeEnd;

  readonly attribute double?            overallProgress;
           attribute double             playbackRate;
  [BinaryName="playStateFromJS"]
  readonly attribute AnimationPlayState playState;
  [BinaryName="pendingFromJS"]
  readonly attribute boolean            pending;
  readonly attribute AnimationReplaceState replaceState;
  [Throws]
  readonly attribute Promise<Animation> ready;
  [Throws]
  readonly attribute Promise<Animation> finished;
           attribute EventHandler       onfinish;
           attribute EventHandler       oncancel;
           attribute EventHandler       onremove;
  undefined cancel();
  [Throws]
  undefined finish();
  [Throws, BinaryName="playFromJS"]
  undefined play();
  [Throws, BinaryName="pauseFromJS"]
  undefined pause();
  undefined updatePlaybackRate (double playbackRate);
  [Throws]
  undefined reverse();
  undefined persist();
  [CEReactions, Throws]
  undefined commitStyles();
};

// Non-standard extensions
partial interface Animation {
  [ChromeOnly] readonly attribute boolean isRunningOnCompositor;
};
