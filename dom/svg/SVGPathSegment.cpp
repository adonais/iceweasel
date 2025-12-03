/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/SVGPathSegment.h"

#include "SVGPathSegUtils.h"
#include "mozilla/dom/SVGPathElementBinding.h"

namespace mozilla::dom {

JSObject* SVGPathSegment::WrapObject(JSContext* aCx,
                                     JS::Handle<JSObject*> aGivenProto) {
  return SVGPathSegment_Binding::Wrap(aCx, this, aGivenProto);
}

NS_IMPL_CYCLE_COLLECTION_WRAPPERCACHE(SVGPathSegment, mSVGPathElement)

//----------------------------------------------------------------------
// Implementation
void SVGPathSegment::AppendEndPoint(
    const StyleCommandEndPoint<StyleCSSFloat>& point) {
  if (point.IsToPosition()) {
    const auto& pos = point.AsToPosition();
    mValues.AppendElement(pos.horizontal);
    mValues.AppendElement(pos.vertical);
  } else if (point.IsByCoordinate()) {
    const auto& coord = point.AsByCoordinate();
    mValues.AppendElement(coord.x);
    mValues.AppendElement(coord.y);
  }
}

void SVGPathSegment::AppendControlPoint(
    const StyleControlPoint<StyleCSSFloat>& point) {
  if (point.IsPosition()) {
    const auto& pos = point.AsPosition();
    mValues.AppendElement(pos.horizontal);
    mValues.AppendElement(pos.vertical);
  } else if (point.IsRelative()) {
    const auto& rel_point = point.AsRelative();
    mValues.AppendElement(rel_point.coord.x);
    mValues.AppendElement(rel_point.coord.y);
  }
}

SVGPathSegment::SVGPathSegment(SVGPathElement* aSVGPathElement,
                               const StylePathCommand& aCommand)
    : mSVGPathElement(aSVGPathElement) {
  switch (aCommand.tag) {
    case StylePathCommand::Tag::Close:
      mCommand.AssignLiteral("Z");
      break;
    case StylePathCommand::Tag::Move:
      mCommand.AssignLiteral(aCommand.move.point.IsToPosition() ? "M" : "m");
      AppendEndPoint(aCommand.move.point);
      break;
    case StylePathCommand::Tag::Line:
      mCommand.AssignLiteral(aCommand.line.point.IsToPosition() ? "L" : "l");
      AppendEndPoint(aCommand.line.point);
      break;
    case StylePathCommand::Tag::CubicCurve:
      mCommand.AssignLiteral(aCommand.cubic_curve.point.IsToPosition() ? "C"
                                                                       : "c");
      AppendControlPoint(aCommand.cubic_curve.control1);
      AppendControlPoint(aCommand.cubic_curve.control2);
      AppendEndPoint(aCommand.cubic_curve.point);
      break;
    case StylePathCommand::Tag::QuadCurve:
      mCommand.AssignLiteral(aCommand.quad_curve.point.IsToPosition() ? "Q"
                                                                      : "q");
      AppendControlPoint(aCommand.quad_curve.control1);
      AppendEndPoint(aCommand.quad_curve.point);
      break;
    case StylePathCommand::Tag::Arc:
      mCommand.AssignLiteral(aCommand.arc.point.IsToPosition() ? "A" : "a");
      mValues.AppendElement(aCommand.arc.radii.x);
      mValues.AppendElement(aCommand.arc.radii.y);
      mValues.AppendElement(aCommand.arc.rotate);
      mValues.AppendElement(aCommand.arc.arc_size == StyleArcSize::Large);
      mValues.AppendElement(aCommand.arc.arc_sweep == StyleArcSweep::Cw);
      AppendEndPoint(aCommand.arc.point);
      break;
    case StylePathCommand::Tag::HLine:
      mCommand.AssignLiteral(aCommand.h_line.by_to == StyleByTo::To ? "H"
                                                                    : "h");
      mValues.AppendElement(aCommand.h_line.x);
      break;
    case StylePathCommand::Tag::VLine:
      mCommand.AssignLiteral(aCommand.v_line.by_to == StyleByTo::To ? "V"
                                                                    : "v");
      mValues.AppendElement(aCommand.v_line.y);
      break;
    case StylePathCommand::Tag::SmoothCubic:
      mCommand.AssignLiteral(aCommand.smooth_cubic.point.IsToPosition() ? "S"
                                                                        : "s");
      AppendControlPoint(aCommand.smooth_cubic.control2);
      AppendEndPoint(aCommand.smooth_cubic.point);
      break;
    case StylePathCommand::Tag::SmoothQuad:
      mCommand.AssignLiteral(aCommand.smooth_quad.point.IsToPosition() ? "T"
                                                                       : "t");
      AppendEndPoint(aCommand.smooth_quad.point);
      break;
  }
}

void SVGPathSegment::GetType(DOMString& aType) {
  aType.SetKnownLiveString(mCommand);
}

void SVGPathSegment::SetType(const nsAString& aType) { mCommand = aType; }

void SVGPathSegment::GetValues(nsTArray<float>& aValues) {
  aValues = mValues.Clone();
}

void SVGPathSegment::SetValues(const nsTArray<float>& aValues) {
  mValues = aValues.Clone();
}

}  // namespace mozilla::dom
