/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_PRINTTARGETSKPDF_H
#define MOZILLA_GFX_PRINTTARGETSKPDF_H

#include "PrintTarget.h"
#include "mozilla/UniquePtr.h"

namespace mozilla::gfx {

class GkSkWStream;

/**
 * Skia PDF printing target.
 */
class PrintTargetSkPDF final : public PrintTarget {
 public:
  static already_AddRefed<PrintTargetSkPDF> CreateOrNull(
      nsIOutputStream* aStream, const IntSize& aSizeInPoints);

  nsresult BeginPrinting(const nsAString& aTitle,
                         const nsAString& aPrintToFileName,
                         uint64_t aInnerWindowId, int32_t aStartPage,
                         int32_t aEndPage) override;
  nsresult EndPrinting() override;
  nsresult AbortPrinting() override;

  nsresult BeginPage(const IntSize& aSizeInPoints) override;
  nsresult EndPage() override;

  already_AddRefed<DrawTarget> MakeDrawTarget(
      const IntSize& aSize, DrawEventRecorder* aRecorder = nullptr) final;

  already_AddRefed<DrawTarget> GetReferenceDrawTarget() final;

 private:
  PrintTargetSkPDF(const IntSize& aSize, UniquePtr<GkSkWStream> aStream);
  virtual ~PrintTargetSkPDF();

  struct SkPDFDocState;
  UniquePtr<SkPDFDocState> mState;
  // Needed for reference DT creation.
  UniquePtr<SkPDFDocState> mRefState;

  // Wraps mState->mCanvas for a given page.
  RefPtr<DrawTarget> mPageDT;
};

}  // namespace mozilla::gfx

#endif /* MOZILLA_GFX_PRINTTARGETSKPDF_H */
