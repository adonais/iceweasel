/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* DOM object holding utility CSS functions */

#include "CSS.h"

#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/ServoBindings.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/CSSUnitValue.h"
#include "mozilla/dom/Document.h"
#include "mozilla/dom/DocumentInlines.h"
#include "mozilla/dom/HighlightRegistry.h"
#include "nsContentUtils.h"
#include "nsStyleUtil.h"
#include "xpcpublic.h"

namespace mozilla::dom {

/* static */
bool CSS::Supports(const GlobalObject&, const nsACString& aProperty,
                   const nsACString& aValue) {
  return Servo_CSSSupports2(&aProperty, &aValue);
}

/* static */
bool CSS::Supports(const GlobalObject& aGlobal, const nsACString& aCondition) {
  StyleCssSupportsParams params{
      .origin = StyleOrigin::Author,
      .url_context = StyleCssSupportsUrlContext::Default,
      .quirks = nsCompatibility::eCompatibility_FullStandards,
  };
  URLExtraData* urlData = nullptr;
  if (Document* doc = nsContentUtils::TryGetDocumentFromWindowGlobal(
          aGlobal.GetAsSupports())) {
    urlData = doc->DefaultStyleAttrURLData();
  }
  return Servo_CSSSupports(&aCondition, &params, urlData);
}

/* static */
void CSS::Escape(const GlobalObject&, const nsAString& aIdent,
                 nsAString& aReturn) {
  nsStyleUtil::AppendEscapedCSSIdent(aIdent, aReturn);
}

/* static */
HighlightRegistry* CSS::GetHighlights(const GlobalObject& aGlobal,
                                      ErrorResult& aRv) {
  Document* doc =
      nsContentUtils::TryGetDocumentFromWindowGlobal(aGlobal.GetAsSupports());
  if (!doc) {
    aRv.ThrowUnknownError("No document associated to this global?");
    return nullptr;
  }
  return &doc->HighlightRegistry();
}

/* static */
void CSS::RegisterProperty(const GlobalObject& aGlobal,
                           const PropertyDefinition& aDefinition,
                           ErrorResult& aRv) {
  Document* doc =
      nsContentUtils::TryGetDocumentFromWindowGlobal(aGlobal.GetAsSupports());
  if (!doc) {
    return aRv.ThrowUnknownError("No document associated to this global?");
  }
  doc->EnsureStyleSet().RegisterProperty(aDefinition, aRv);
}

// start of CSS Typed OM Web IDL implementation

/* static */
already_AddRefed<CSSUnitValue> CSS::Number(const GlobalObject& aGlobal,
                                           double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Number(),
                          aValue, "number"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Percent(const GlobalObject& aGlobal,
                                            double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Percent(),
                          aValue, "percent"_ns);
}

// <length>
/* static */
already_AddRefed<CSSUnitValue> CSS::Cap(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "cap"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Ch(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "ch"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Em(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "em"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Ex(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "ex"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Ic(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "ic"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Lh(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "lh"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Rcap(const GlobalObject& aGlobal,
                                         double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "rcap"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Rch(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "rch"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Rem(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "rem"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Rex(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "rex"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Ric(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "ric"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Rlh(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "rlh"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Vw(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "vw"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Vh(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "vh"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Vi(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "vi"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Vb(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "vb"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Vmin(const GlobalObject& aGlobal,
                                         double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "vmin"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Vmax(const GlobalObject& aGlobal,
                                         double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "vmax"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Svw(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "svw"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Svh(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "svh"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Svi(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "svi"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Svb(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "svb"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Svmin(const GlobalObject& aGlobal,
                                          double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "svmin"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Svmax(const GlobalObject& aGlobal,
                                          double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "svmax"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Lvw(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "lvw"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Lvh(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "lvh"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Lvi(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "lvi"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Lvb(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "lvb"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Lvmin(const GlobalObject& aGlobal,
                                          double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "lvmin"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Lvmax(const GlobalObject& aGlobal,
                                          double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "lvmax"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Dvw(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "dvw"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Dvh(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "dvh"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Dvi(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "dvi"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Dvb(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "dvb"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Dvmin(const GlobalObject& aGlobal,
                                          double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "dvmin"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Dvmax(const GlobalObject& aGlobal,
                                          double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "dvmax"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Cqw(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "cqw"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Cqh(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "cqh"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Cqi(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "cqi"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Cqb(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "cqb"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Cqmin(const GlobalObject& aGlobal,
                                          double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "cqmin"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Cqmax(const GlobalObject& aGlobal,
                                          double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "cqmax"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Cm(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "cm"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Mm(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "mm"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Q(const GlobalObject& aGlobal,
                                      double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "q"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::In(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "in"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Pt(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "pt"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Pc(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "pc"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Px(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Length(),
                          aValue, "px"_ns);
}

// <angle>
/* static */
already_AddRefed<CSSUnitValue> CSS::Deg(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Angle(),
                          aValue, "deg"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Grad(const GlobalObject& aGlobal,
                                         double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Angle(),
                          aValue, "grad"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Rad(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Angle(),
                          aValue, "rad"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Turn(const GlobalObject& aGlobal,
                                         double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Angle(),
                          aValue, "turn"_ns);
}

// <time>
/* static */
already_AddRefed<CSSUnitValue> CSS::S(const GlobalObject& aGlobal,
                                      double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Time(),
                          aValue, "s"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Ms(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Time(),
                          aValue, "ms"_ns);
}

// <frequency>
/* static */
already_AddRefed<CSSUnitValue> CSS::Hz(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(),
                          StyleNumericType::Frequency(), aValue, "hz"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::KHz(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(),
                          StyleNumericType::Frequency(), aValue, "khz"_ns);
}

// <resolution>
/* static */
already_AddRefed<CSSUnitValue> CSS::Dpi(const GlobalObject& aGlobal,
                                        double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(),
                          StyleNumericType::Resolution(), aValue, "dpi"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Dpcm(const GlobalObject& aGlobal,
                                         double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(),
                          StyleNumericType::Resolution(), aValue, "dpcm"_ns);
}

/* static */
already_AddRefed<CSSUnitValue> CSS::Dppx(const GlobalObject& aGlobal,
                                         double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(),
                          StyleNumericType::Resolution(), aValue, "dppx"_ns);
}

// <flex>
/* static */
already_AddRefed<CSSUnitValue> CSS::Fr(const GlobalObject& aGlobal,
                                       double aValue) {
  return MakeCSSUnitValue(aGlobal.GetAsSupports(), StyleNumericType::Flex(),
                          aValue, "fr"_ns);
}

// end of CSS Typed OM Web IDL implementation

}  // namespace mozilla::dom
