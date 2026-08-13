/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef LAYOUT_SVG_SVGCONTEXTPAINT_H_
#define LAYOUT_SVG_SVGCONTEXTPAINT_H_

#include "DrawMode.h"
#include "ImgDrawResult.h"
#include "gfxMatrix.h"
#include "gfxPattern.h"
#include "gfxTypes.h"
#include "gfxUtils.h"
#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/Assertions.h"
#include "mozilla/EnumeratedArray.h"
#include "mozilla/gfx/2D.h"
#include "nsColor.h"
#include "nsRefPtrHashtable.h"
#include "nsStyleStruct.h"
#include "nsTArray.h"

class gfxContext;

namespace mozilla {
class SVGPaintServerFrame;

namespace dom {
class Document;
}

enum class SVGContextPaintTypeTag : uint8_t {
  Fill,
  Stroke,
};

// Glue to make EnumeratedArray work with SVGContextPaintTypeTag.
template <>
struct MaxContiguousEnumValue<SVGContextPaintTypeTag> {
  static constexpr auto value = SVGContextPaintTypeTag::Stroke;
};

/**
 * This class is used to pass information about a context element through to
 * SVG painting code in order to resolve the 'context-fill' and related
 * keywords. See:
 *
 *   https://www.w3.org/TR/SVG2/painting.html#context-paint
 *
 * This feature allows the color in an SVG-in-OpenType glyph to come from the
 * computed style for the text that is being drawn, for example, or for color
 * in an SVG embedded by an <img> element to come from the embedding <img>
 * element.
 *
 * This class is reference counted so that it can be shared among many similar
 * SVGImageContext objects. (SVGImageContext objects are frequently
 * copy-constructed with small modifications, and we'd like for those copies to
 * be able to share their context-paint data cheaply.)  However, in most cases,
 * SVGContextPaint instances are stored in a local RefPtr and only last for the
 * duration of a function call.
 */
class SVGContextPaint : public RefCounted<SVGContextPaint> {
 public:
  using DrawTarget = mozilla::gfx::DrawTarget;
  using Float = mozilla::gfx::Float;
  using imgDrawingParams = mozilla::image::imgDrawingParams;
  using Tag = SVGContextPaintTypeTag;

  SVGContextPaint(const DrawTarget* aDrawTarget,
                  const gfxMatrix& aContextMatrix, nsIFrame* aFrame,
                  SVGContextPaint* aOuterContextPaint,
                  imgDrawingParams& aImgParams);
  explicit SVGContextPaint(gfxContext* aContext);
  SVGContextPaint(Maybe<nscolor> aFill, Maybe<nscolor> aStroke)
      : SVGContextPaint(aFill, Some(1.0f), aStroke, Some(1.0f)) {}
  SVGContextPaint(Maybe<nscolor> aFill, Maybe<float> aFillOpacity,
                  Maybe<nscolor> aStroke, Maybe<float> aStrokeOpacity) {
    if (aFill) {
      mPaint[Tag::Fill].SetColor(aFill.value());
    }
    mOpacity[Tag::Fill] = aFillOpacity ? aFillOpacity.value() : 1.0f;
    if (aStroke) {
      mPaint[Tag::Stroke].SetColor(aStroke.value());
    }
    mOpacity[Tag::Stroke] = aStrokeOpacity ? aStrokeOpacity.value() : 1.0f;
  }

  bool operator==(const SVGContextPaint& aOther) const {
    MOZ_ASSERT(GetStrokeWidth() == aOther.GetStrokeWidth() &&
                   GetStrokeDashOffset() == aOther.GetStrokeDashOffset() &&
                   GetStrokeDashArray() == aOther.GetStrokeDashArray(),
               "We don't currently include these in the context information "
               "from an embedding element");
    return std::equal(mPaint.begin(), mPaint.end(), aOther.mPaint.begin(),
                      aOther.mPaint.end()) &&
           std::equal(mOpacity.begin(), mOpacity.end(), aOther.mOpacity.begin(),
                      aOther.mOpacity.end());
  }

  MOZ_DECLARE_REFCOUNTED_TYPENAME(SVGContextPaint)

  bool IsSolidColor(Tag aTag) const;
  gfx::DeviceColor AsSolidColor(Tag aTag) const;
  already_AddRefed<gfxPattern> GetPattern(Tag aTag,
                                          const DrawTarget* aDrawTarget,
                                          float aOpacity, const gfxMatrix& aCTM,
                                          imgDrawingParams& aImgParams) const;

  already_AddRefed<gfxPattern> GetPattern(Tag aTag,
                                          const DrawTarget* aDrawTarget,
                                          const gfxMatrix& aCTM,
                                          imgDrawingParams& aImgParams) const {
    return GetPattern(aTag, aDrawTarget, GetOpacity(aTag), aCTM, aImgParams);
  }

  float GetOpacity(Tag aTag) const { return mOpacity[aTag]; }

  static SVGContextPaint* GetContextPaint(nsIContent* aContent);

  // XXX This gets the geometry params from the gfxContext.  We should get that
  // information from the actual paint context!
  void InitStrokeGeometry(gfxContext* aContext, float devUnitsPerSVGUnit);

  const FallibleTArray<Float>& GetStrokeDashArray() const { return mDashes; }

  Float GetStrokeDashOffset() const { return mDashOffset; }

  Float GetStrokeWidth() const { return mStrokeWidth; }

  uint32_t Hash() const;

  /**
   * Returns true if image context paint is allowed to be used in an image that
   * has the given URI, else returns false.
   */
  static bool IsAllowedForImageFromURI(nsIURI* aURI);

  struct Paint {
    enum class Tag : uint8_t {
      None,
      Color,
      Pattern,
      PaintServer,
      ContextFill,
      ContextStroke,
    };

    Paint() : mPaintDefinition{}, mPaintType(Tag::None) {}
    ~Paint() {
      if (mPaintType == Tag::Pattern) {
        mPaintDefinition.mPattern->Release();
      }
    }

    bool operator==(const Paint& aOther) const {
      if (mPaintType != aOther.mPaintType) {
        return false;
      }
      switch (mPaintType) {
        case Tag::None:
          return true;
        case Tag::Color:
          return mPaintDefinition.mColor == aOther.mPaintDefinition.mColor;
        case Tag::Pattern:
          return mPaintDefinition.mPattern == aOther.mPaintDefinition.mPattern;
        case Tag::PaintServer:
          return mPaintDefinition.mPaintServerFrame ==
                 aOther.mPaintDefinition.mPaintServerFrame;
        case Tag::ContextFill:
        case Tag::ContextStroke:
          return mPaintDefinition.mContextPaint ==
                 aOther.mPaintDefinition.mContextPaint;
      }
      return false;
    }

    void SetPaintServer(nsIFrame* aFrame, const gfxMatrix& aContextMatrix,
                        SVGPaintServerFrame* aPaintServerFrame) {
      mPaintType = Tag::PaintServer;
      mPaintDefinition.mPaintServerFrame = aPaintServerFrame;
      mFrame = aFrame;
      mContextMatrix = aContextMatrix;
    }

    void SetColor(const nscolor& aColor) {
      mPaintType = Tag::Color;
      mPaintDefinition.mColor = aColor;
    }

    bool IsSolidColor() const { return mPaintType == Tag::Color; }

    void SetPattern(gfxPattern* aPattern, const gfxMatrix& aCTM) {
      mPaintType = Tag::Pattern;
      mPaintDefinition.mPattern = aPattern;
      mPaintDefinition.mPattern->AddRef();
      mContextMatrix = SetupDeviceToPatternMatrix(aPattern, aCTM);
    }

    void SetContextPaint(SVGContextPaint* aContextPaint, Tag aTag) {
      MOZ_ASSERT(aTag == Tag::ContextFill || aTag == Tag::ContextStroke);
      mPaintType = aTag;
      mPaintDefinition.mContextPaint = aContextPaint;
    }

    already_AddRefed<gfxPattern> GetPattern(
        const DrawTarget* aDrawTarget, float aOpacity,
        StyleSVGPaint nsStyleSVG::* aFillOrStroke, const gfxMatrix& aCTM,
        imgDrawingParams& aImgParams) const;

   private:
    static gfxMatrix SetupDeviceToPatternMatrix(const gfxPattern* aPattern,
                                                const gfxMatrix& aCTM) {
      gfxMatrix deviceToUser = aCTM;
      if (!deviceToUser.Invert()) {
        return gfxMatrix(0, 0, 0, 0, 0, 0);  // singular
      }
      return deviceToUser * aPattern->GetMatrix();
    }

    union {
      SVGPaintServerFrame* mPaintServerFrame;
      SVGContextPaint* mContextPaint;
      nscolor mColor;
      gfxPattern* mPattern;
    } mPaintDefinition;

    // Initialized (if needed) in SetPaintServer():
    MOZ_INIT_OUTSIDE_CTOR nsIFrame* mFrame;
    // CTM defining the user space for the pattern we will use.
    gfxMatrix mContextMatrix;
    Tag mPaintType;

    // Device-space-to-pattern-space
    mutable gfxMatrix mPatternMatrix;
    mutable nsRefPtrHashtable<nsFloatHashKey, gfxPattern> mPatternCache;
  };

  DrawMode GetDrawMode() const { return mDrawMode; }

 private:
  EnumeratedArray<Tag, Paint> mPaint;
  EnumeratedArray<Tag, float> mOpacity;

  // Member-vars are initialized in InitStrokeGeometry.
  FallibleTArray<Float> mDashes;
  Float mDashOffset = 0.0f;
  Float mStrokeWidth = 0.0f;

  DrawMode mDrawMode = DrawMode(0);
};

/**
 * RAII class used to temporarily set and remove an SVGContextPaint while a
 * piece of SVG is being painted.  The context paint is set on the SVG's owner
 * document, as expected by SVGContextPaint::GetContextPaint.  Any pre-existing
 * context paint is restored after this class removes the context paint that it
 * set.
 */
class MOZ_RAII AutoSetRestoreSVGContextPaint {
 public:
  AutoSetRestoreSVGContextPaint(const SVGContextPaint* aContextPaint,
                                dom::Document* aDocument);
  ~AutoSetRestoreSVGContextPaint();

 private:
  dom::Document* mDocument;
  // The context paint that needs to be restored by our dtor after it removes
  // aContextPaint:
  const SVGContextPaint* mOuterContextPaint;
};

}  // namespace mozilla

#endif  // LAYOUT_SVG_SVGCONTEXTPAINT_H_
