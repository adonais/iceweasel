/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PathRecording.h"

#include "DrawEventRecorder.h"
#include "RecordedEventImpl.h"

namespace mozilla {
namespace gfx {

inline Maybe<float> PathOps::ArcParams::GetRadius() const {
  // Do a quick check for a uniform scale and/or translation transform. In the
  // worst case scenario, failing just causes a fallback to ArcToBezier.
  if (transform._11 == transform._22 && transform._12 == 0.0f &&
      transform._21 == 0.0f && transform._11 > 0.0f) {
    return Some(transform._11);
  }
  return Nothing();
}

inline void PathOps::ArcParams::ToSink(PathSink& aPathSink,
                                       bool aAntiClockwise) const {
  if (Maybe<float> radius = GetRadius()) {
    aPathSink.Arc(GetOrigin(), *radius, startAngle, endAngle, aAntiClockwise);
  } else {
    ArcToBezier(&aPathSink, Point(), Size(1.0f, 1.0f), startAngle, endAngle,
                aAntiClockwise, 0.0f, transform);
  }
}

#define NEXT_PARAMS(_type)                                        \
  const _type params = *reinterpret_cast<const _type*>(nextByte); \
  nextByte += sizeof(_type);

bool PathOps::StreamToSink(PathSink& aPathSink) const {
  if (mPathData.empty()) {
    return true;
  }

  const uint8_t* nextByte = mPathData.begin();
  const uint8_t* end = mPathData.end();
  while (nextByte < end) {
    const OpType opType = *reinterpret_cast<const OpType*>(nextByte);
    nextByte += sizeof(OpType);
    switch (opType) {
      case OpType::OP_MOVETO: {
        NEXT_PARAMS(Point)
        aPathSink.MoveTo(params);
        break;
      }
      case OpType::OP_LINETO: {
        NEXT_PARAMS(Point)
        aPathSink.LineTo(params);
        break;
      }
      case OpType::OP_BEZIERTO: {
        NEXT_PARAMS(ThreePoints)
        aPathSink.BezierTo(params.p1, params.p2, params.p3);
        break;
      }
      case OpType::OP_QUADRATICBEZIERTO: {
        NEXT_PARAMS(TwoPoints)
        aPathSink.QuadraticBezierTo(params.p1, params.p2);
        break;
      }
      case OpType::OP_ARC_CW:
      case OpType::OP_ARC_CCW: {
        NEXT_PARAMS(ArcParams)
        params.ToSink(aPathSink, opType == OpType::OP_ARC_CCW);
        break;
      }
      case OpType::OP_CLOSE:
        aPathSink.Close();
        break;
      default:
        return false;
    }
  }

  return true;
}

#define CHECKED_NEXT_PARAMS(_type)      \
  if (nextByte + sizeof(_type) > end) { \
    return false;                       \
  }                                     \
  NEXT_PARAMS(_type)

bool PathOps::CheckedStreamToSink(PathSink& aPathSink) const {
  if (mPathData.empty()) {
    return true;
  }

  const uint8_t* nextByte = mPathData.begin();
  const uint8_t* end = mPathData.end();
  while (true) {
    if (nextByte == end) {
      break;
    }

    if (nextByte + sizeof(OpType) > end) {
      return false;
    }

    const OpType opType = *reinterpret_cast<const OpType*>(nextByte);
    nextByte += sizeof(OpType);
    switch (opType) {
      case OpType::OP_MOVETO: {
        CHECKED_NEXT_PARAMS(Point)
        aPathSink.MoveTo(params);
        break;
      }
      case OpType::OP_LINETO: {
        CHECKED_NEXT_PARAMS(Point)
        aPathSink.LineTo(params);
        break;
      }
      case OpType::OP_BEZIERTO: {
        CHECKED_NEXT_PARAMS(ThreePoints)
        aPathSink.BezierTo(params.p1, params.p2, params.p3);
        break;
      }
      case OpType::OP_QUADRATICBEZIERTO: {
        CHECKED_NEXT_PARAMS(TwoPoints)
        aPathSink.QuadraticBezierTo(params.p1, params.p2);
        break;
      }
      case OpType::OP_ARC_CW:
      case OpType::OP_ARC_CCW: {
        CHECKED_NEXT_PARAMS(ArcParams)
        params.ToSink(aPathSink, opType == OpType::OP_ARC_CCW);
        break;
      }
      case OpType::OP_CLOSE:
        aPathSink.Close();
        break;
      default:
        return false;
    }
  }

  return true;
}
#undef CHECKED_NEXT_PARAMS

void PathOps::TransformedCopyTo(const Matrix& aTransform,
                                PathOps& aDest) const {
  MOZ_RELEASE_ASSERT(
      aDest.mPathData.reserve(aDest.mPathData.length() + mPathData.length()));
  const uint8_t* nextByte = mPathData.begin();
  const uint8_t* end = mPathData.end();
  while (nextByte < end) {
    const OpType opType = *reinterpret_cast<const OpType*>(nextByte);
    nextByte += sizeof(OpType);
    switch (opType) {
      case OpType::OP_MOVETO: {
        NEXT_PARAMS(Point)
        aDest.MoveTo(aTransform.TransformPoint(params));
        break;
      }
      case OpType::OP_LINETO: {
        NEXT_PARAMS(Point)
        aDest.LineTo(aTransform.TransformPoint(params));
        break;
      }
      case OpType::OP_BEZIERTO: {
        NEXT_PARAMS(ThreePoints)
        aDest.BezierTo(aTransform.TransformPoint(params.p1),
                       aTransform.TransformPoint(params.p2),
                       aTransform.TransformPoint(params.p3));
        break;
      }
      case OpType::OP_QUADRATICBEZIERTO: {
        NEXT_PARAMS(TwoPoints)
        aDest.QuadraticBezierTo(aTransform.TransformPoint(params.p1),
                                aTransform.TransformPoint(params.p2));
        break;
      }
      case OpType::OP_ARC_CW:
      case OpType::OP_ARC_CCW: {
        NEXT_PARAMS(ArcParams)
        aDest.Arc(params.transform * aTransform, params.startAngle,
                  params.endAngle, opType == OpType::OP_ARC_CCW);
        break;
      }
      case OpType::OP_CLOSE:
        aDest.Close();
        break;
      default:
        MOZ_CRASH("We control mOpTypes, so this should never happen.");
    }
  }
}

#define MODIFY_NEXT_PARAMS(_type)                      \
  _type& params = *reinterpret_cast<_type*>(nextByte); \
  nextByte += sizeof(_type);

void PathOps::TransformInPlace(const Matrix& aTransform) {
  uint8_t* nextByte = mPathData.begin();
  uint8_t* end = mPathData.end();
  while (nextByte < end) {
    const OpType opType = *reinterpret_cast<const OpType*>(nextByte);
    nextByte += sizeof(OpType);
    switch (opType) {
      case OpType::OP_MOVETO: {
        MODIFY_NEXT_PARAMS(Point)
        params = aTransform.TransformPoint(params);
        break;
      }
      case OpType::OP_LINETO: {
        MODIFY_NEXT_PARAMS(Point)
        params = aTransform.TransformPoint(params);
        break;
      }
      case OpType::OP_BEZIERTO: {
        MODIFY_NEXT_PARAMS(ThreePoints)
        params.p1 = aTransform.TransformPoint(params.p1);
        params.p2 = aTransform.TransformPoint(params.p2);
        params.p3 = aTransform.TransformPoint(params.p3);
        break;
      }
      case OpType::OP_QUADRATICBEZIERTO: {
        MODIFY_NEXT_PARAMS(TwoPoints)
        params.p1 = aTransform.TransformPoint(params.p1);
        params.p2 = aTransform.TransformPoint(params.p2);
        break;
      }
      case OpType::OP_ARC_CW:
      case OpType::OP_ARC_CCW: {
        MODIFY_NEXT_PARAMS(ArcParams)
        params.transform *= aTransform;
        break;
      }
      case OpType::OP_CLOSE:
        break;
      default:
        MOZ_CRASH("We control mOpTypes, so this should never happen.");
    }
  }
}

Maybe<Path::Circle> PathOps::AsCircle() const {
  if (mPathData.empty()) {
    return Nothing();
  }

  const uint8_t* nextByte = mPathData.begin();
  const uint8_t* end = mPathData.end();
  const OpType opType = *reinterpret_cast<const OpType*>(nextByte);
  nextByte += sizeof(OpType);
  if (opType == OpType::OP_ARC_CW || opType == OpType::OP_ARC_CCW) {
    NEXT_PARAMS(ArcParams)
    if (fabs(fabs(params.startAngle - params.endAngle) - 2 * M_PI) < 1e-6) {
      if (Maybe<float> radius = params.GetRadius()) {
        // we have a full circle
        if (nextByte < end) {
          const OpType nextOpType = *reinterpret_cast<const OpType*>(nextByte);
          nextByte += sizeof(OpType);
          if (nextOpType == OpType::OP_CLOSE) {
            if (nextByte == end) {
              return Some(Path::Circle{params.GetOrigin(), *radius, true});
            }
          }
        } else {
          // the circle wasn't closed
          return Some(Path::Circle{params.GetOrigin(), *radius, false});
        }
      }
    }
  }

  return Nothing();
}

Maybe<Path::Line> PathOps::AsLine() const {
  if (mPathData.empty()) {
    return Nothing();
  }

  Path::Line retval;

  const uint8_t* nextByte = mPathData.begin();
  const uint8_t* end = mPathData.end();
  OpType opType = *reinterpret_cast<const OpType*>(nextByte);
  nextByte += sizeof(OpType);

  if (opType == OpType::OP_MOVETO) {
    MOZ_ASSERT(nextByte != end);

    NEXT_PARAMS(Point)
    retval.origin = params;
  } else {
    return Nothing();
  }

  if (nextByte >= end) {
    return Nothing();
  }

  opType = *reinterpret_cast<const OpType*>(nextByte);
  nextByte += sizeof(OpType);

  if (opType == OpType::OP_LINETO) {
    MOZ_ASSERT(nextByte != end);

    NEXT_PARAMS(Point)

    if (nextByte == end) {
      retval.destination = params;
      return Some(retval);
    }
  }

  return Nothing();
}

Maybe<Rect> PathOps::AsRect() const {
  if (mPathData.length() !=
      4 * (sizeof(OpType) + sizeof(Point)) + sizeof(OpType)) {
    return Nothing();
  }

  const uint8_t* nextByte = mPathData.begin();
  Point pts[4];
  for (size_t i = 0; i < 4; ++i) {
    const OpType opType = *reinterpret_cast<const OpType*>(nextByte);
    nextByte += sizeof(OpType);
    if (opType != (i == 0 ? OpType::OP_MOVETO : OpType::OP_LINETO)) {
      return Nothing();
    }
    NEXT_PARAMS(Point)
    pts[i] = params;
  }
  if (*reinterpret_cast<const OpType*>(nextByte) != OpType::OP_CLOSE) {
    return Nothing();
  }

  // This mirrors Skia's check for trivial rect contours.
  const Point v0 = pts[1] - pts[0];
  const Point v1 = pts[2] - pts[1];
  const Point v2 = pts[3] - pts[2];
  const Point v3 = pts[0] - pts[3];
  auto axisAlignedOrthogonal = [](const Point& aA, const Point& aB) {
    // Assuming A is axis-aligned, check whether B is orthogonal to it.
    return ((aA.x == 0) != (aB.x == 0)) && ((aA.y == 0) != (aB.y == 0));
  };
  // Check if the vectors are axis-aligned and form right angles.
  if (((v0.x == 0) != (v0.y == 0)) && axisAlignedOrthogonal(v0, v1) &&
      axisAlignedOrthogonal(v1, v2) && axisAlignedOrthogonal(v2, v3)) {
    const float left = std::min(pts[0].x, pts[2].x);
    const float top = std::min(pts[0].y, pts[2].y);
    const float right = std::max(pts[0].x, pts[2].x);
    const float bottom = std::max(pts[0].y, pts[2].y);
    const Rect rect(left, top, right - left, bottom - top);
    // Ensure rect conversion from points to origin/size is lossless.
    if (rect.XMost() == right && rect.YMost() == bottom) {
      return Some(rect);
    }
  }
  return Nothing();
}
#undef NEXT_PARAMS

size_t PathOps::NumberOfOps() const {
  size_t size = 0;
  const uint8_t* nextByte = mPathData.begin();
  const uint8_t* end = mPathData.end();
  while (nextByte < end) {
    size++;
    const OpType opType = *reinterpret_cast<const OpType*>(nextByte);
    nextByte += sizeof(OpType);
    switch (opType) {
      case OpType::OP_MOVETO:
        nextByte += sizeof(Point);
        break;
      case OpType::OP_LINETO:
        nextByte += sizeof(Point);
        break;
      case OpType::OP_BEZIERTO:
        nextByte += sizeof(ThreePoints);
        break;
      case OpType::OP_QUADRATICBEZIERTO:
        nextByte += sizeof(TwoPoints);
        break;
      case OpType::OP_ARC_CW:
      case OpType::OP_ARC_CCW:
        nextByte += sizeof(ArcParams);
        break;
      case OpType::OP_CLOSE:
        break;
      default:
        MOZ_CRASH("We control mOpTypes, so this should never happen.");
    }
  }

  return size;
}

bool PathOps::IsEmpty() const {
  const uint8_t* nextByte = mPathData.begin();
  const uint8_t* end = mPathData.end();
  while (nextByte < end) {
    const OpType opType = *reinterpret_cast<const OpType*>(nextByte);
    nextByte += sizeof(OpType);
    switch (opType) {
      case OpType::OP_MOVETO:
        nextByte += sizeof(Point);
        break;
      case OpType::OP_CLOSE:
        break;
      default:
        return false;
    }
  }
  return true;
}

void PathBuilderRecording::MoveTo(const Point& aPoint) {
  mPath->mPathOps.MoveTo(aPoint);
  mBeginPoint = aPoint;
  mCurrentPoint = aPoint;
}

void PathBuilderRecording::LineTo(const Point& aPoint) {
  mPath->mPathOps.LineTo(aPoint);
  mCurrentPoint = aPoint;
}

void PathBuilderRecording::BezierTo(const Point& aCP1, const Point& aCP2,
                                    const Point& aCP3) {
  mPath->mPathOps.BezierTo(aCP1, aCP2, aCP3);
  mCurrentPoint = aCP3;
}

void PathBuilderRecording::QuadraticBezierTo(const Point& aCP1,
                                             const Point& aCP2) {
  mPath->mPathOps.QuadraticBezierTo(aCP1, aCP2);
  mCurrentPoint = aCP2;
}

void PathBuilderRecording::Close() {
  mPath->mPathOps.Close();
  mCurrentPoint = mBeginPoint;
}

void PathBuilderRecording::Arc(const Point& aOrigin, float aRadius,
                               float aStartAngle, float aEndAngle,
                               bool aAntiClockwise) {
  mPath->mPathOps.Arc(aOrigin, aRadius, aStartAngle, aEndAngle, aAntiClockwise);
  mCurrentPoint = aOrigin + Point(cosf(aEndAngle), sinf(aEndAngle)) * aRadius;
}

PathBuilderRecording::PathBuilderRecording(BackendType aBackend,
                                           FillRule aFillRule)
    : PathBuilder(aFillRule),
      mBackendType(aBackend),
      mPath(MakeAndAddRef<PathRecording>(aBackend, aFillRule)) {}

PathBuilderRecording::PathBuilderRecording(
    BackendType aBackend, FillRule aFillRule,
    already_AddRefed<PathRecording> aPath)
    : PathBuilder(aFillRule), mBackendType(aBackend), mPath(aPath) {
  mPath->ResetCachedState();
  mCurrentPoint = mPath->mCurrentPoint;
  mBeginPoint = mPath->mBeginPoint;
}

already_AddRefed<Path> PathBuilderRecording::Finish() {
  mPath->mFillRule = mFillRule;
  mPath->mCurrentPoint = mCurrentPoint;
  mPath->mBeginPoint = mBeginPoint;
  return mPath.forget();
}

void PathBuilderRecording::Reset(FillRule aFillRule) {
  SetFillRule(aFillRule);
  mCurrentPoint = Point();
  mBeginPoint = Point();
  if (!mPath) {
    mPath = new PathRecording(mBackendType, mFillRule);
  } else {
    mPath->mPathOps.Clear();
  }
}

void PathBuilderRecording::RecyclePath(already_AddRefed<Path> aPath) {
  RefPtr<Path> pathRef(aPath);
  // Only recycle the path if this is the last remaining reference to it
  // and if the PathBuilder is not building an existing path.
  if (pathRef->GetBackendType() == GetBackendType() && pathRef->hasOneRef() &&
      !mPath) {
    mPath = pathRef.forget().downcast<PathRecording>();
    // Before the path can be recycled, remove any references to its old
    // identity.
    mPath->ResetCachedState();
  }
}

void PathBuilderRecording::Transform(const Matrix& aTransform) {
  mPath->mPathOps.TransformInPlace(aTransform);
  mCurrentPoint = aTransform.TransformPoint(mCurrentPoint);
  mBeginPoint = aTransform.TransformPoint(mBeginPoint);
}

PathRecording::PathRecording(BackendType aBackend, FillRule aFillRule)
    : Path(aFillRule), mBackendType(aBackend) {}

PathRecording::PathRecording(BackendType aBackend, FillRule aFillRule,
                             const Point& aCurrentPoint,
                             const Point& aBeginPoint, const PathOps& aPathOps)
    : Path(aFillRule, aCurrentPoint, aBeginPoint),
      mBackendType(aBackend),
      mPathOps(aPathOps) {}

// Ensure any state referring to the path's identity is cleared before reuse.
void PathRecording::ResetCachedState() {
  if (!mStoredRecorders.empty()) {
    for (size_t i = 0; i < mStoredRecorders.size(); i++) {
      mStoredRecorders[i]->RemoveStoredObject(this);
      mStoredRecorders[i]->RecordEvent(RecordedPathDestruction(this));
    }
    mStoredRecorders.clear();
  }
  mPath = nullptr;
}

PathRecording::~PathRecording() { ResetCachedState(); }

void PathRecording::EnsurePath() const {
  if (mPath) {
    return;
  }
  if (RefPtr<PathBuilder> pathBuilder =
          Factory::CreatePathBuilder(mBackendType, mFillRule)) {
    if (!mPathOps.StreamToSink(*pathBuilder)) {
      MOZ_ASSERT(false, "Failed to stream PathOps to PathBuilder");
    } else {
      mPath = pathBuilder->Finish();
      MOZ_ASSERT(!!mPath, "Failed finishing Path from PathBuilder");
    }
  } else {
    MOZ_ASSERT(false, "Failed to create PathBuilder for PathRecording");
  }
}

already_AddRefed<PathBuilder> PathRecording::MoveToBuilder(
    FillRule aFillRule, already_AddRefed<PathBuilder> aBuilder) {
  RefPtr builder(aBuilder.downcast<PathBuilderRecording>());
  if (builder) {
    ResetCachedState();
    builder->mBackendType = mBackendType;
    builder->mFillRule = aFillRule;
    builder->mPath = do_AddRef(this);
    builder->mCurrentPoint = mCurrentPoint;
    builder->mBeginPoint = mBeginPoint;
  } else {
    builder = MakeRefPtr<PathBuilderRecording>(mBackendType, aFillRule,
                                               do_AddRef(this));
  }
  return builder.forget();
}

already_AddRefed<PathBuilder> PathRecording::CopyToBuilder(
    FillRule aFillRule, already_AddRefed<PathBuilder> aBuilder) const {
  RefPtr path = MakeRefPtr<PathRecording>(mBackendType, aFillRule,
                                          mCurrentPoint, mBeginPoint, mPathOps);
  return path->MoveToBuilder(aFillRule, std::move(aBuilder));
}

already_AddRefed<PathBuilder> PathRecording::TransformedCopyToBuilder(
    const Matrix& aTransform, FillRule aFillRule,
    already_AddRefed<PathBuilder> aBuilder) const {
  RefPtr path = MakeRefPtr<PathRecording>(
      mBackendType, aFillRule, aTransform.TransformPoint(mCurrentPoint),
      aTransform.TransformPoint(mBeginPoint));
  mPathOps.TransformedCopyTo(aTransform, path->mPathOps);
  return path->MoveToBuilder(aFillRule, std::move(aBuilder));
}

}  // namespace gfx
}  // namespace mozilla
