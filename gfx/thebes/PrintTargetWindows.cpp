/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PrintTargetWindows.h"

#include "cairo-win32.h"
#include "gdi/SkGDIDocument.h"
#include "mozilla/StaticPrefs_browser.h"
#include "mozilla/StaticPrefs_print.h"
#include "mozilla/WidgetUtils.h"
#include "mozilla/gfx/DrawEventRecorder.h"
#include "mozilla/gfx/HelpersCairo.h"
#include "mozilla/gfx/HelpersSkia.h"
#include "mozilla/gfx/InlineTranslator.h"
#include "nsCoord.h"
#include "nsIContentAnalysis.h"
#include "nsIWidget.h"
#include "nsIWindowMediator.h"
#include "nsPIDOMWindow.h"
#include "nsServiceManagerUtils.h"
#include "nsString.h"
#include "skia/include/core/SkCanvas.h"

namespace mozilla {
namespace gfx {

PrintTargetWindows::PrintTargetWindows(cairo_surface_t* aCairoSurface, HDC aDC)
    : mDC(aDC), mCairoSurface(aCairoSurface) {
  MOZ_ASSERT(aCairoSurface);
  // CreateOrNull hands over ownership of aCairoSurface, so we don't call
  // cairo_surface_reference(aSurface) here.
  // This code was copied from gfxASurface::Init:
  if (cairo_surface_get_content(mCairoSurface) != CAIRO_CONTENT_COLOR) {
    cairo_surface_set_subpixel_antialiasing(
        mCairoSurface, CAIRO_SUBPIXEL_ANTIALIASING_DISABLED);
  }
  // TODO: At least add basic memory reporting.
  // 4 * mSize.width * mSize.height + sizeof(PrintTargetWindows) ?
}

PrintTargetWindows::PrintTargetWindows(
    std::unique_ptr<SkGDI::Document> aDocument, HDC aDC)
    : mDC(aDC),
      mDocument(std::move(aDocument)),
      mRecorder(MakeRefPtr<DrawEventRecorderMemory>()) {
  // Printing always records with glyph source text, since the content
  // process currently has no way to know whether printing will end up at a
  // target that supports it (e.g. SkPDF) or one that doesn't (e.g. this GDI
  // back-end). This recorder is only an intermediate step toward GDI output,
  // which has no use for the text, but it still needs to be able to tolerate
  // the text without asserting.
  mRecorder->SetSupportsGlyphSourceText(true);
  RefPtr<DrawTarget> refDT = GetReferenceDrawTarget();
  mTranslator = std::make_unique<InlineTranslator>(refDT);
}

PrintTargetWindows::~PrintTargetWindows() {
  if (mCairoSurface) {
    cairo_surface_destroy(mCairoSurface);
  }
}

void PrintTargetWindows::Finish() {
  if (mIsFinished) {
    return;
  }
  mIsFinished = true;
  if (mCairoSurface) {
    cairo_surface_finish(mCairoSurface);
  }
}

/* static */
already_AddRefed<PrintTargetWindows> PrintTargetWindows::CreateOrNull(HDC aDC) {
  // Sanity-check the paper size, the actual surface size will be the printable
  // area which is likely smaller.
  // Note: we only scale the printing using the LOGPIXELSY,
  // so we use that when calculating the surface width as well as the height.
  int32_t heightDPI = ::GetDeviceCaps(aDC, LOGPIXELSY);
  float width =
      (::GetDeviceCaps(aDC, PHYSICALWIDTH) * POINTS_PER_INCH_FLOAT) / heightDPI;
  float height =
      (::GetDeviceCaps(aDC, PHYSICALHEIGHT) * POINTS_PER_INCH_FLOAT) /
      heightDPI;
  IntSize size = IntSize::Truncate(width, height);

  if (!Factory::CheckSurfaceSize(size)) {
    return nullptr;
  }

  if (StaticPrefs::print_windows_skia_gdi_enabled()) {
    SkGDI::Options options;
    options.fRasterScale =
        float(StaticPrefs::print_windows_skia_gdi_raster_dpi()) /
        ::GetDeviceCaps(aDC, LOGPIXELSX);
    std::unique_ptr<SkGDI::Document> doc = SkGDI::MakeDocument(aDC, options);
    if (!doc) {
      return nullptr;
    }
    return do_AddRef(new PrintTargetWindows(std::move(doc), aDC));
  }

  cairo_surface_t* surface = cairo_win32_printing_surface_create(aDC);

  if (cairo_surface_status(surface)) {
    return nullptr;
  }

  // The new object takes ownership of our surface reference.
  RefPtr<PrintTargetWindows> target = new PrintTargetWindows(surface, aDC);

  return target.forget();
}

LazyLogModule gPrintingLog("printing");

nsresult PrintTargetWindows::BeginPrinting(const nsAString& aTitle,
                                           const nsAString& aPrintToFileName,
                                           uint64_t aInnerWindowId,
                                           int32_t aStartPage,
                                           int32_t aEndPage) {
  const uint32_t DOC_TITLE_LENGTH = MAX_PATH - 1;

  DOCINFOW docinfo;

  nsString titleStr(aTitle);
  if (titleStr.Length() > DOC_TITLE_LENGTH) {
    titleStr.SetLength(DOC_TITLE_LENGTH - 3);
    titleStr.AppendLiteral("...");
  }

  nsString docName(aPrintToFileName);
  docinfo.cbSize = sizeof(docinfo);
  docinfo.lpszDocName =
      titleStr.Length() > 0 ? titleStr.get() : L"Mozilla Document";
  docinfo.lpszOutput = docName.Length() > 0 ? docName.get() : nullptr;
  docinfo.lpszDatatype = nullptr;
  docinfo.fwType = 0;

  // If we just did content analysis on this print request, it may have popped
  // up a dialog, and this can prevent StartDocW() from working properly if the
  // printer wants to pop up a dialog window (to get a file name to save to, for
  // example). Setting the foreground window to any browser window seems to work
  // around this. See bug 1980225.
  if (nsIContentAnalysis::MightBeActive() &&
      StaticPrefs::browser_contentanalysis_print_set_foreground_window()) {
    nsCOMPtr<nsIWindowMediator> winMediator =
        do_GetService(NS_WINDOWMEDIATOR_CONTRACTID);
    if (winMediator) {
      nsCOMPtr<mozIDOMWindowProxy> domWindow;
      nsresult rv =
          winMediator->GetMostRecentBrowserWindow(getter_AddRefs(domWindow));
      if (NS_SUCCEEDED(rv) && domWindow) {
        nsPIDOMWindowOuter* win = nsPIDOMWindowOuter::From(domWindow);
        if (win) {
          nsCOMPtr<nsIWidget> widget =
              widget::WidgetUtils::DOMWindowToWidget(win);
          if (widget) {
            HWND hwnd =
                static_cast<HWND>(widget->GetNativeData(NS_NATIVE_WINDOW));
            BOOL foregroundReturn = ::SetForegroundWindow(hwnd);
            MOZ_LOG(gPrintingLog, mozilla::LogLevel::Debug,
                    ("Called SetForegroundWindow(), which returned %d",
                     foregroundReturn));
          }
        }
      }
    }
  }
  // If the user selected Microsoft Print to PDF or XPS Document Printer, then
  // the following StartDoc call will put up a dialog window to prompt the
  // user to provide the name and location of the file to be saved.  A zero or
  // negative return value indicates failure.  In that case we want to check
  // whether that is because the user hit Cancel, since we want to treat that
  // specially to avoid notifying the user that the print "failed" in that
  // case.
  // XXX We should perhaps introduce a new NS_ERROR_USER_CANCELLED errer.
  int result = ::StartDocW(mDC, &docinfo);
  if (result <= 0) {
    DWORD lastError = ::GetLastError();
    if (lastError == ERROR_CANCELLED) {
      return NS_ERROR_ABORT;
    }
    return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

nsresult PrintTargetWindows::EndPrinting() {
  if (mRecorder) {
    mRecorder->DetachResources();
  }
  int result = ::EndDoc(mDC);
  return (result <= 0) ? NS_ERROR_FAILURE : NS_OK;
}

nsresult PrintTargetWindows::AbortPrinting() {
  PrintTarget::AbortPrinting();
  if (mRecorder) {
    mRecorder->DetachResources();
  }
  int result = ::AbortDoc(mDC);
  return (result <= 0) ? NS_ERROR_FAILURE : NS_OK;
}

nsresult PrintTargetWindows::BeginPage(const IntSize& aSizeInPoints) {
  MOZ_ALWAYS_SUCCEEDS(PrintTarget::BeginPage(aSizeInPoints));
  int result = ::StartPage(mDC);
  return (result <= 0) ? NS_ERROR_FAILURE : NS_OK;
}

nsresult PrintTargetWindows::EndPage() {
  bool failure = false;
  if (mDocument) {
    // The page is in device units of the printable area, which is what the
    // content is drawn in (see nsIDeviceContextSpec::GetPrintingScale).
    SkISize size = SkISize::Make(::GetDeviceCaps(mDC, HORZRES),
                                 ::GetDeviceCaps(mDC, VERTRES));
    // The recording may refer to objects created by previous pages, and every
    // pass needs to start from the same state.
    InlineTranslator::State pageStart;
    mTranslator->SaveState(pageStart);
    MemStream& recording = mRecorder->mOutputStream;
    bool firstPass = true;
    mDocument->drawPage(size, [&](SkCanvas* aCanvas) {
      RefPtr<DrawTarget> dt = Factory::CreateDrawTargetWithSkCanvas(aCanvas);
      if (!dt || !recording.mValid) {
        failure = true;
        return;
      }
      if (!firstPass) {
        mTranslator->RestoreState(pageStart);
      }
      firstPass = false;
      // The canvas may be transformed (e.g. to rasterize part of the page),
      // and the recording sets absolute transforms.
      const Matrix baseTransform =
          SkiaMatrixToGfxMatrix(aCanvas->getTotalMatrix()).As2D();
      dt->SetTransform(baseTransform);
      mTranslator->SetReferenceDrawTargetTransform(baseTransform);
      mTranslator->SetBaseDrawTarget(dt);
      if (!mTranslator->TranslateRecording(recording.mData,
                                           recording.mLength)) {
        failure = true;
      }
    });
    // CreateDrawTargetWithSkCanvas wraps a stack pointer, make sure it doesn't
    // persist. Each page has its own recording anyway so it's not supposed to
    // reference DTs across pages.
    mTranslator->ForgetDrawTargets();
    RefPtr<DrawTarget> refDT = GetReferenceDrawTarget();
    mTranslator->SetReferenceDrawTargetTransform(Matrix());
    mTranslator->SetBaseDrawTarget(refDT);
    mRecorder->WipeRecording();
  } else {
    cairo_surface_show_page(mCairoSurface);
    failure = cairo_surface_status(mCairoSurface);
  }
  MOZ_ALWAYS_SUCCEEDS(PrintTarget::EndPage());
  int result = ::EndPage(mDC);
  return (result <= 0 || failure) ? NS_ERROR_FAILURE : NS_OK;
}

already_AddRefed<DrawTarget> PrintTargetWindows::MakeDrawTarget(
    const IntSize& aSize, DrawEventRecorder* aRecorder) {
  // This should not be called outside of BeginPage()/EndPage() calls since
  // some backends can only provide a valid DrawTarget at that time.
  MOZ_ASSERT(mHasActivePage, "We can't guarantee a valid DrawTarget");

  RefPtr<DrawTarget> dt;
  if (mDocument) {
    RefPtr<DrawTarget> refDT = GetReferenceDrawTarget();
    dt = Factory::CreateRecordingDrawTarget(mRecorder, refDT,
                                            IntRect(IntPoint(), aSize));
  } else {
    if (cairo_surface_status(mCairoSurface)) {
      return nullptr;
    }
    // Note than aSize may not be the same as the size of mCairoSurface. If the
    // sizes are different a clip will be applied to mCairoSurface.
    dt = Factory::CreateDrawTargetForCairoSurface(mCairoSurface, aSize);
  }
  if (!dt || !dt->IsValid()) {
    return nullptr;
  }
  if (aRecorder) {
    return CreateRecordingDrawTarget(aRecorder, dt);
  }
  return dt.forget();
}

already_AddRefed<DrawTarget> PrintTargetWindows::GetReferenceDrawTarget() {
  if (mRefDT) {
    return do_AddRef(mRefDT);
  }
  const IntSize size(1, 1);
  if (mDocument) {
    mRefDT = Factory::CreateDrawTarget(BackendType::SKIA, size,
                                       SurfaceFormat::B8G8R8A8);
    return do_AddRef(mRefDT);
  }

  cairo_surface_t* similar = cairo_surface_create_similar(
      mCairoSurface, cairo_surface_get_content(mCairoSurface), size.width,
      size.height);
  if (cairo_surface_status(similar)) {
    return nullptr;
  }
  RefPtr<DrawTarget> dt =
      Factory::CreateDrawTargetForCairoSurface(similar, size);
  // The DT addrefs the surface, so we need drop our own reference to it:
  cairo_surface_destroy(similar);
  if (!dt || !dt->IsValid()) {
    return nullptr;
  }
  mRefDT = std::move(dt);
  return do_AddRef(mRefDT);
}

}  // namespace gfx
}  // namespace mozilla
