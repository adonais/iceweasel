/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GFX_SVG_GLYPHS_WRAPPER_H
#define GFX_SVG_GLYPHS_WRAPPER_H

#include "gfxFontUtils.h"
#include "gfxPattern.h"
#include "mozilla/SVGContextPaint.h"
#include "mozilla/gfx/2D.h"
#include "mozilla/gfx/UserData.h"
#include "nsBaseHashtable.h"
#include "nsClassHashtable.h"
#include "nsHashKeys.h"
#include "nsRefreshObservers.h"
#include "nsString.h"

class nsIDocumentViewer;
class gfxSVGGlyphs;

namespace mozilla {
class PresShell;
class SVGContextPaint;
namespace dom {
class Document;
class Element;
}  // namespace dom
}  // namespace mozilla

/**
 * Wraps an SVG document contained in the SVG table of an OpenType font.
 * There may be multiple SVG documents in an SVG table which we lazily parse
 *   so we have an instance of this class for every document in the SVG table
 *   which contains a glyph ID which has been used
 * Finds and looks up elements contained in the SVG document which have glyph
 *   mappings to be drawn by gfxSVGGlyphs
 */
class gfxSVGGlyphsDocument final : public nsAPostRefreshObserver {
  typedef mozilla::dom::Element Element;

 public:
  gfxSVGGlyphsDocument(const uint8_t* aBuffer, uint32_t aBufLen,
                       gfxSVGGlyphs* aSVGGlyphs);

  Element* GetGlyphElement(uint32_t aGlyphId);

  ~gfxSVGGlyphsDocument();

  void DidRefresh() override;

  size_t SizeOfIncludingThis(mozilla::MallocSizeOf aMallocSizeOf) const;

 private:
  nsresult ParseDocument(const uint8_t* aBuffer, uint32_t aBufLen);

  nsresult SetupPresentation();

  void FindGlyphElements(Element* aElement);

  void InsertGlyphId(Element* aGlyphElement);

  // Weak so as not to create a cycle. mOwner owns us so this can't dangle.
  gfxSVGGlyphs* mOwner;
  RefPtr<mozilla::dom::Document> mDocument;
  nsCOMPtr<nsIDocumentViewer> mViewer;
  RefPtr<mozilla::PresShell> mPresShell;

  nsBaseHashtable<nsUint32HashKey, Element*, Element*> mGlyphIdMap;
};

/**
 * Used by |gfxFontEntry| to represent the SVG table of an OpenType font.
 * Handles lazy parsing of the SVG documents in the table, looking up SVG glyphs
 *   and rendering SVG glyphs.
 * Each |gfxFontEntry| owns at most one |gfxSVGGlyphs| instance.
 */
class gfxSVGGlyphs {
 private:
  typedef mozilla::dom::Element Element;

 public:
  /**
   * @param aSVGTable The SVG table from the OpenType font
   *
   * The gfxSVGGlyphs object takes over ownership of the blob references
   * that are passed in, and will hb_blob_destroy() them when finished;
   * the caller should -not- destroy these references.
   */
  gfxSVGGlyphs(hb_blob_t* aSVGTable, gfxFontEntry* aFontEntry);

  /**
   * Releases our references to the SVG table and cleans up everything else.
   */
  ~gfxSVGGlyphs();

  /**
   * This is called when the refresh driver has ticked.
   */
  void DidRefresh();

  /**
   * Find the |gfxSVGGlyphsDocument| containing an SVG glyph for |aGlyphId|.
   * If |aGlyphId| does not map to an SVG document, return null.
   * If a |gfxSVGGlyphsDocument| has not been created for the document, create
   * one.
   */
  gfxSVGGlyphsDocument* FindOrCreateGlyphsDocument(uint32_t aGlyphId);

  /**
   * Return true iff there is an SVG glyph for |aGlyphId|
   */
  bool HasSVGGlyph(uint32_t aGlyphId);

  /**
   * Render the SVG glyph for |aGlyphId|
   * @param aContextPaint Information on text context paints.
   *   See |SVGContextPaint|.
   */
  void RenderGlyph(gfxContext* aContext, uint32_t aGlyphId,
                   mozilla::SVGContextPaint* aContextPaint,
                   mozilla::image::imgDrawingParams& aImgParams);

  /**
   * Get the extents for the SVG glyph associated with |aGlyphId|
   * @param aSVGToAppSpace The matrix mapping the SVG glyph space to the
   *   target context space
   */
  bool GetGlyphExtents(uint32_t aGlyphId, const gfxMatrix& aSVGToAppSpace,
                       gfxRect* aResult);

  size_t SizeOfIncludingThis(mozilla::MallocSizeOf aMallocSizeOf) const;

  gfxFontEntry* FontEntry() const { return mFontEntry; }

 private:
  Element* GetGlyphElement(uint32_t aGlyphId);

  nsClassHashtable<nsUint32HashKey, gfxSVGGlyphsDocument> mGlyphDocs;
  nsBaseHashtable<nsUint32HashKey, Element*, Element*> mGlyphIdMap;

  hb_blob_t* mSVGData;

  // pointer to the font entry that owns this gfxSVGGlyphs object
  gfxFontEntry* MOZ_NON_OWNING_REF mFontEntry;

  const struct Header {
    mozilla::AutoSwap_PRUint16 mVersion;
    mozilla::AutoSwap_PRUint32 mDocIndexOffset;
    mozilla::AutoSwap_PRUint32 mColorPalettesOffset;
  }* mHeader;

  struct IndexEntry {
    mozilla::AutoSwap_PRUint16 mStartGlyph;
    mozilla::AutoSwap_PRUint16 mEndGlyph;
    mozilla::AutoSwap_PRUint32 mDocOffset;
    mozilla::AutoSwap_PRUint32 mDocLength;
  };

  const struct DocIndex {
    mozilla::AutoSwap_PRUint16 mNumEntries;
    IndexEntry mEntries[1]; /* actual length = mNumEntries */
  }* mDocIndex;

  static int CompareIndexEntries(const void* _a, const void* _b);
};

#endif
