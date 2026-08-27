/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_KeyframeUtils_h
#define mozilla_KeyframeUtils_h

#include "NonCustomCSSPropertyId.h"
#include "js/RootingAPI.h"                 // For JS::Handle
#include "mozilla/Keyframe.h"              // For Keyframe::OffsetType
#include "mozilla/KeyframeEffectParams.h"  // For CompositeOperation
#include "nsTArrayForwardDeclare.h"        // For nsTArray

struct JSContext;
class JSObject;

namespace mozilla {
struct AnimationProperty;
class ComputedStyle;
struct CSSPropertyId;

class ErrorResult;
struct PropertyStyleAnimationValuePair;
struct PseudoStyleRequest;

enum class PseudoStyleType : uint8_t;
enum class StyleTimelineRangeName : uint8_t;

namespace dom {
struct AnimationRange;
class AnimationTimeline;
class Document;
class Element;
}  // namespace dom
}  // namespace mozilla

namespace mozilla {

// Represents the set of property-value pairs on a Keyframe converted to
// computed values.
using ComputedKeyframeValues = nsTArray<PropertyStyleAnimationValuePair>;

/**
 * Utility methods for processing keyframes.
 */
class KeyframeUtils {
 public:
  /**
   * Converts a JS value representing a property-indexed keyframe or a sequence
   * of keyframes to an array of Keyframe objects.
   *
   * @param aCx The JSContext that corresponds to |aFrames|.
   * @param aDocument The document to use when parsing CSS properties.
   * @param aFrames The JS value, provided as an optional IDL |object?| value,
   *   that is the keyframe list specification.
   * @param aContext Information about who is trying to get keyframes from the
   *   object, for use in error reporting.  This must be be a non-null
   *   pointer representing a null-terminated ASCII string.
   * @param aRv (out) Out-param to hold any error returned by this function.
   *   Must be initially empty.
   * @return The set of processed keyframes. If an error occurs, aRv will be
   *   filled-in with the appropriate error code and an empty array will be
   *   returned.
   */
  static nsTArray<Keyframe> GetKeyframesFromObject(
      JSContext* aCx, dom::Document* aDocument, JS::Handle<JSObject*> aFrames,
      const char* aContext, ErrorResult& aRv);

  /**
   * Calculate the computed offset of keyframes by evenly distributing keyframes
   * with a missing offset. Note that the distribution doesn't take
   * TimelineRangeOffset into account. We distribute the keyframes by using
   * percentage (i.e. double) offset only.
   *
   * @see
   * https://drafts.csswg.org/web-animations-1/#compute-missing-keyframe-offsets
   *
   * @param aKeyframes The set of keyframes to adjust.
   * @param aTimeline The animation timeline.
   * @param aRange The animation attachment range.
   * @return The preprocess info for quickly checking the keyframes whether they
   *   use timeline range offsets.
   */
  static KeyframeOffsetsHasRangeOffset ComputeMissingKeyframeOffsets(
      nsTArray<Keyframe>& aKeframes, const dom::AnimationTimeline* aTimeline,
      const dom::AnimationRange* aRange);

  /**
   * Calculate the computed offset for view timelines.
   *
   * @param aOffset The timeline range offset of the specified keyframe offset.
   * @param aTimeline The animation timeline.
   * @param aRange The animation attachment range.
   * @return The computed offset for |aOffset|. It returns unresolved offset if
   *   the timeline isn't ViewTimeline.
   */
  static double GetComputedOffset(const Keyframe::OffsetType& aOffset,
                                  const dom::AnimationTimeline* aTimeline,
                                  const dom::AnimationRange* aRange);

  /**
   * Converts an array of Keyframe objects into an array of AnimationProperty
   * objects. This involves creating an array of computed values for each
   * longhand property and determining the offset and timing function to use
   * for each value.
   *
   * @param aKeyframes The input keyframes.
   * @param aElement The context element.
   * @param aStyle The computed style values.
   * @param aEffectComposite The composite operation specified on the effect.
   *   For any keyframes in |aKeyframes| that do not specify a composite
   *   operation, this value will be used.
   * @param aTimeline The associated timeline.
   * @return The set of animation properties. If an error occurs, the returned
   *   array will be empty.
   */
  static nsTArray<AnimationProperty> GetAnimationPropertiesFromKeyframes(
      const nsTArray<Keyframe>& aKeyframes, dom::Element* aElement,
      const PseudoStyleRequest& aPseudoRequest, const ComputedStyle* aStyle,
      dom::CompositeOperation aEffectComposite,
      const dom::AnimationTimeline* aTimeline);

  /**
   * Check if the property or, for shorthands, one or more of
   * its subproperties, is animatable.
   *
   * @param aProperty The property to check.
   * @param aBackend  The style backend, Servo or Gecko, that should determine
   *                  if the property is animatable or not.
   * @return true if |aProperty| is animatable.
   */
  static bool IsAnimatableProperty(const CSSPropertyId& aProperty);
};

}  // namespace mozilla

#endif  // mozilla_KeyframeUtils_h
