/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "AnimationUtils.h"

#include "mozilla/EffectSet.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/StaticPrefs_layout.h"
#include "mozilla/dom/AnimatableBinding.h"
#include "mozilla/dom/Animation.h"
#include "mozilla/dom/CSSKeywordValue.h"
#include "mozilla/dom/CSSNumericValue.h"
#include "mozilla/dom/CSSNumericValueBinding.h"
#include "mozilla/dom/CSSUnitValue.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/KeyframeEffect.h"
#include "mozilla/dom/ScrollTimeline.h"  // For PROGRESS_TIMELINE_DURATION_MILLISEC
#include "nsAtom.h"
#include "nsDebug.h"
#include "nsGlobalWindowInner.h"
#include "nsIContent.h"
#include "nsLayoutUtils.h"
#include "nsString.h"
#include "xpcpublic.h"  // For xpc::NativeGlobal

using namespace mozilla::dom;

namespace mozilla {

/* static */
void AnimationUtils::LogAsyncAnimationFailure(nsCString& aMessage,
                                              const nsIContent* aContent) {
  if (aContent) {
    aMessage.AppendLiteral(" [");
    aMessage.Append(nsAtomCString(aContent->NodeInfo()->NameAtom()));

    nsAtom* id = aContent->GetID();
    if (id) {
      aMessage.AppendLiteral(" with id '");
      aMessage.Append(nsAtomCString(aContent->GetID()));
      aMessage.Append('\'');
    }
    aMessage.Append(']');
  }
  aMessage.Append('\n');
  printf_stderr("%s", aMessage.get());
}

/* static */
Document* AnimationUtils::GetCurrentRealmDocument(JSContext* aCx) {
  nsGlobalWindowInner* win = xpc::CurrentWindowOrNull(aCx);
  if (!win) {
    return nullptr;
  }
  return win->GetDoc();
}

/* static */
Document* AnimationUtils::GetDocumentFromGlobal(JSObject* aGlobalObject) {
  nsGlobalWindowInner* win = xpc::WindowOrNull(aGlobalObject);
  if (!win) {
    return nullptr;
  }
  return win->GetDoc();
}

/* static */
bool AnimationUtils::FrameHasAnimatedScale(const nsIFrame* aFrame) {
  EffectSet* effectSet = EffectSet::GetForFrame(
      aFrame, nsCSSPropertyIDSet::TransformLikeProperties());
  if (!effectSet) {
    return false;
  }

  for (const dom::KeyframeEffect* effect : *effectSet) {
    if (effect->ContainsAnimatedScale(aFrame)) {
      return true;
    }
  }

  return false;
}

/* static */
bool AnimationUtils::HasCurrentTransitions(
    const Element* aElement, const PseudoStyleRequest& aPseudoRequest) {
  MOZ_ASSERT(aElement);

  EffectSet* effectSet = EffectSet::Get(aElement, aPseudoRequest);
  if (!effectSet) {
    return false;
  }

  for (const dom::KeyframeEffect* effect : *effectSet) {
    // If |effect| is current, it must have an associated Animation
    // so we don't need to null-check the result of GetAnimation().
    if (effect->IsCurrent() && effect->GetAnimation()->AsCSSTransition()) {
      return true;
    }
  }

  return false;
}

/*static*/
std::pair<const Element*, PseudoStyleRequest>
AnimationUtils::GetElementPseudoPair(const Element* aElementOrPseudo) {
  MOZ_ASSERT(aElementOrPseudo);

  if (aElementOrPseudo->IsGeneratedContentContainerForBefore()) {
    return {aElementOrPseudo->GetParent()->AsElement(),
            PseudoStyleRequest::Before()};
  }

  if (aElementOrPseudo->IsGeneratedContentContainerForAfter()) {
    return {aElementOrPseudo->GetParent()->AsElement(),
            PseudoStyleRequest::After()};
  }

  if (aElementOrPseudo->IsGeneratedContentContainerForMarker()) {
    return {aElementOrPseudo->GetParent()->AsElement(),
            PseudoStyleRequest::Marker()};
  }

  if (aElementOrPseudo->IsGeneratedContentContainerForBackdrop()) {
    return {aElementOrPseudo->GetParent()->AsElement(),
            PseudoStyleRequest::Backdrop()};
  }

  if (aElementOrPseudo->IsGeneratedContentContainerForCheckmark()) {
    return {aElementOrPseudo->GetParent()->AsElement(),
            PseudoStyleRequest(PseudoStyleType::Checkmark)};
  }

  if (aElementOrPseudo->IsGeneratedContentContainerForPickerIcon()) {
    return {aElementOrPseudo->GetParent()->AsElement(),
            PseudoStyleRequest(PseudoStyleType::PickerIcon)};
  }

  const PseudoStyleType type = aElementOrPseudo->GetPseudoElementType();
  if (PseudoStyle::IsViewTransitionPseudoElement(type)) {
    // Note: ::view-transition doesn't have a name, so we check if it has a name
    // first.
    nsAtom* name =
        aElementOrPseudo->HasName()
            ? aElementOrPseudo->GetParsedAttr(nsGkAtoms::name)->GetAtomValue()
            : nullptr;
    return {aElementOrPseudo->GetOwnerDocument()->GetRootElement(),
            PseudoStyleRequest(type, name)};
  }

  return {aElementOrPseudo, PseudoStyleRequest::NotPseudo()};
}

static bool IsPercentUnit(const CSSNumericValue& aValue) {
  // TODO: this can use a bit more efficient check once it's available, see:
  // https://drafts.css-houdini.org/css-typed-om-1/#cssnumericvalue-match
  if (RefPtr<CSSUnitValue> asPercent =
          aValue.To("percent"_ns, IgnoreErrors())) {
    return true;
  }
  return false;
}

// https://www.w3.org/TR/css-values-4/#time-value
static bool IsDurationUnit(const CSSNumericValue& aValue) {
  // TODO: this can use a bit more efficient check once it's available, see:
  // https://drafts.css-houdini.org/css-typed-om-1/#cssnumericvalue-match
  if (RefPtr<CSSUnitValue> asMs = aValue.To("ms"_ns, IgnoreErrors())) {
    return true;
  }
  if (RefPtr<CSSUnitValue> asSeconds = aValue.To("s"_ns, IgnoreErrors())) {
    return true;
  }
  return false;
}

// https://drafts.csswg.org/web-animations-2/#validate-a-cssnumberish-time
/* static */
bool AnimationUtils::ValidateCSSNumberishTime(const CSSNumberish& aValue,
                                              bool aProgressBased,
                                              ErrorResult& aRv) {
  const bool isCSSNumericValue = aValue.IsCSSNumericValue();

  // A CSSNumericValue was passed. This shouldn't be reachable from JS while
  // typed-OM is disabled (the interface is pref-gated), but reject defensively.
  if (isCSSNumericValue && !StaticPrefs::layout_css_typed_om_enabled()) {
    aRv.ThrowTypeError("CSSNumericValue is not supported.");
    return false;
  }

  if (aProgressBased) {
    if (!isCSSNumericValue) {
      aRv.ThrowTypeError(
          "Setting time using absolute time values is not supported for "
          "progress-based animations.");
      return false;
    }

    CSSNumericValue& numeric = aValue.GetAsCSSNumericValue();
    if (!IsPercentUnit(numeric)) {
      aRv.ThrowTypeError(
          "CSSNumericValue must be a percentage for progress-based "
          "animations.");
      return false;
    }
  }

  if (!aProgressBased && isCSSNumericValue) {
    CSSNumericValue& numeric = aValue.GetAsCSSNumericValue();
    if (!IsDurationUnit(numeric)) {
      aRv.ThrowTypeError(
          "CSSNumericValue must be a <time> for non-progress-based "
          "animations.");
      return false;
    }
  }

  return true;
}

namespace {

using TimelineRangeValue =
    OwningTimelineRangeOffsetOrCSSNumericValueOrCSSKeywordValueOrUTF8String;

// True if |aValue| is the default "normal" range boundary, in which case no
// animation range needs to be applied. "normal" may be a string or a
// CSSKeywordValue.
bool IsNormalTimelineRange(const TimelineRangeValue& aValue) {
  // The "normal" keyword is matched ASCII case-insensitively, like any CSS
  // keyword.
  if (aValue.IsUTF8String()) {
    return aValue.GetAsUTF8String().LowerCaseEqualsLiteral("normal");
  }
  if (aValue.IsCSSKeywordValue()) {
    nsAutoCString value;
    aValue.GetAsCSSKeywordValue()->GetValue(value);
    return value.LowerCaseEqualsLiteral("normal");
  }
  return false;
}

// Serializes a KeyframeAnimationOptions rangeStart/rangeEnd value. Returns
// false (the caller throws a TypeError) for a CSSKeywordValue other than
// "normal", which the spec disallows.
bool TimelineRangeValueToCss(const TimelineRangeValue& aValue,
                             nsACString& aOut) {
  if (aValue.IsCSSKeywordValue()) {
    // Only "normal" is a valid keyword, and it is handled by
    // IsNormalTimelineRange, so any keyword reaching here is invalid.
    return false;
  }

  if (aValue.IsUTF8String()) {
    aOut = aValue.GetAsUTF8String();
    return true;
  }

  if (aValue.IsCSSNumericValue()) {
    // A bare CSSNumericValue is interpreted as an offset with no range name.
    aValue.GetAsCSSNumericValue()->Stringify(aOut);
    return true;
  }

  const TimelineRangeOffset& offset = aValue.GetAsTimelineRangeOffset();
  nsAutoCString result;
  if (offset.mRangeName.WasPassed() && !offset.mRangeName.Value().IsVoid()) {
    result.Append(offset.mRangeName.Value());
  }
  if (offset.mOffset.WasPassed()) {
    nsAutoCString offsetStr;
    offset.mOffset.Value().Stringify(offsetStr);
    if (!result.IsEmpty()) {
      result.Append(' ');
    }
    result.Append(offsetStr);
  }
  // An empty TimelineRangeOffset (neither member present) is treated as
  // "normal".
  if (result.IsEmpty()) {
    aOut.AssignLiteral("normal");
  } else {
    aOut = result;
  }
  return true;
}

}  // namespace

/* static */
bool AnimationUtils::ApplyKeyframeAnimationRange(
    const KeyframeAnimationOptions& aOptions, Animation* aAnimation,
    ErrorResult& aRv) {
  const bool startIsNormal = IsNormalTimelineRange(aOptions.mRangeStart);
  const bool endIsNormal = IsNormalTimelineRange(aOptions.mRangeEnd);
  if (startIsNormal && endIsNormal) {
    return true;
  }

  // Values that would require an element context (e.g. em) are a parse error.
  AnimationRange range;
  nsAutoCString css;
  if (!startIsNormal) {
    if (!TimelineRangeValueToCss(aOptions.mRangeStart, css) ||
        !Servo_ParseAnimationRangeStart(&css, &range.mStart)) {
      aRv.ThrowTypeError("Invalid animation range start");
      return false;
    }
  }
  if (!endIsNormal) {
    if (!TimelineRangeValueToCss(aOptions.mRangeEnd, css) ||
        !Servo_ParseAnimationRangeEnd(&css, &range.mEnd)) {
      aRv.ThrowTypeError("Invalid animation range end");
      return false;
    }
  }

  aAnimation->SetTimelineRange(std::move(range));
  return true;
}

/* static */
void AnimationUtils::DoubleToCSSNumberish(double aMs, bool aProgressBased,
                                          nsIGlobalObject* aGlobal,
                                          OwningCSSNumberish& aRetVal) {
  if (aProgressBased) {
    const double progress =
        aMs / static_cast<double>(PROGRESS_TIMELINE_DURATION_MILLISEC) * 100.0;
    aRetVal.SetAsCSSNumericValue() = MakeCSSUnitValue(
        aGlobal, StyleNumericType::Percent(), progress, "percent"_ns);
    return;
  }
  aRetVal.SetAsDouble() = aMs;
}

/* static */
void AnimationUtils::DurationToCSSNumberish(
    const Nullable<TimeDuration>& aTime, bool aProgressBased,
    RTPCallerType aRTPCallerType, nsIGlobalObject* aGlobal,
    Nullable<OwningCSSNumberish>& aRetVal) {
  if (aTime.IsNull()) {
    aRetVal.SetNull();
    return;
  }
  const double ms = TimeDurationToDouble(aTime, aRTPCallerType).Value();
  DoubleToCSSNumberish(ms, aProgressBased, aGlobal, aRetVal.SetValue());
}

/* static */
Nullable<TimeDuration> AnimationUtils::CSSNumberishToDuration(
    const CSSNumberish& aValue, bool aProgressBased) {
  if (aValue.IsDouble()) {
    return Nullable<TimeDuration>(
        TimeDuration::FromMilliseconds(aValue.GetAsDouble()));
  }

  CSSNumericValue& numeric = aValue.GetAsCSSNumericValue();
  if (aProgressBased) {
    RefPtr<CSSUnitValue> asPercent = numeric.To("percent"_ns, IgnoreErrors());
    MOZ_ASSERT(asPercent, "caller should validate value");
    const double ms = asPercent->Value() / 100.0 *
                      static_cast<double>(PROGRESS_TIMELINE_DURATION_MILLISEC);
    return Nullable<TimeDuration>(TimeDuration::FromMilliseconds(ms));
  }

  if (RefPtr<CSSUnitValue> asMs = numeric.To("ms"_ns, IgnoreErrors())) {
    return Nullable<TimeDuration>(
        TimeDuration::FromMilliseconds(asMs->Value()));
  }
  RefPtr<CSSUnitValue> asSeconds = numeric.To("s"_ns, IgnoreErrors());
  MOZ_ASSERT(asSeconds, "caller should validate value");
  return Nullable<TimeDuration>(TimeDuration::FromSeconds(asSeconds->Value()));
}

}  // namespace mozilla
