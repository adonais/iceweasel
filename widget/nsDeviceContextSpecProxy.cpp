/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsDeviceContextSpecProxy.h"

#include "gfxASurface.h"
#include "mozilla/RefPtr.h"
#include "mozilla/gfx/PrintTargetRecording.h"
#include "mozilla/layout/RemotePrintJobChild.h"
#include "nsIPrintSettings.h"

using namespace mozilla;
using namespace mozilla::gfx;

NS_IMPL_ISUPPORTS(nsDeviceContextSpecProxy, nsIDeviceContextSpec)

nsDeviceContextSpecProxy::nsDeviceContextSpecProxy(
    RemotePrintJobChild* aRemotePrintJob)
    : mRemotePrintJob(aRemotePrintJob) {}
nsDeviceContextSpecProxy::~nsDeviceContextSpecProxy() = default;

NS_IMETHODIMP
nsDeviceContextSpecProxy::Init(nsIPrintSettings* aPrintSettings,
                               bool aIsPrintPreview) {
  mPrintSettings = aPrintSettings;

  if (aIsPrintPreview) {
    return NS_OK;
  }

  if (!mRemotePrintJob) {
    NS_WARNING("We can't print via the parent without a RemotePrintJobChild.");
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

already_AddRefed<PrintTarget> nsDeviceContextSpecProxy::MakePrintTarget() {
  double width, height;
  mPrintSettings->GetEffectiveSheetSize(&width, &height);
  if (width <= 0 || height <= 0) {
    return nullptr;
  }

  // convert twips to points
  width /= TWIPS_PER_POINT_FLOAT;
  height /= TWIPS_PER_POINT_FLOAT;

  return PrintTargetRecording::CreateOrNull(IntSize::Ceil(width, height));
}

NS_IMETHODIMP
nsDeviceContextSpecProxy::GetDrawEventRecorder(
    DrawEventRecorder** aDrawEventRecorder) {
  MOZ_ASSERT(aDrawEventRecorder);
  RefPtr<DrawEventRecorder> result = mRecorder;
  result.forget(aDrawEventRecorder);
  return NS_OK;
}

NS_IMETHODIMP
nsDeviceContextSpecProxy::BeginDocument(const nsAString& aTitle,
                                        const nsAString& aPrintToFileName,
                                        dom::WindowContext* aWindowContext,
                                        int32_t aStartPage, int32_t aEndPage) {
  if (!mRemotePrintJob || mRemotePrintJob->IsDestroyed()) {
    mRemotePrintJob = nullptr;
    return NS_ERROR_NOT_AVAILABLE;
  }

  mRecorder = new mozilla::layout::DrawEventRecorderPRFileDesc();
  mRecorder->SetSupportsGlyphSourceText(true);
  nsresult rv = mRemotePrintJob->InitializePrint(
      nsString(aTitle), aWindowContext, aStartPage, aEndPage);
  if (NS_FAILED(rv)) {
    // The parent process will send a 'delete' message to tell this process to
    // delete our RemotePrintJobChild.  As soon as we return to the event loop
    // and evaluate that message we will crash if we try to access
    // mRemotePrintJob.  We must not try to use it again.
    mRemotePrintJob = nullptr;
  }
  return rv;
}

RefPtr<mozilla::gfx::PrintEndDocumentPromise>
nsDeviceContextSpecProxy::EndDocument() {
  if (!mRemotePrintJob || mRemotePrintJob->IsDestroyed()) {
    mRemotePrintJob = nullptr;
    return mozilla::gfx::PrintEndDocumentPromise::CreateAndReject(
        NS_ERROR_NOT_AVAILABLE, __func__);
  }

  (void)mRemotePrintJob->SendFinalizePrint();

  if (mRecorder) {
    MOZ_ASSERT(!mRecorder->IsOpen());
    mRecorder->DetachResources();
    mRecorder = nullptr;
  }

  return mozilla::gfx::PrintEndDocumentPromise::CreateAndResolve(true,
                                                                 __func__);
}

nsresult nsDeviceContextSpecProxy::BeginPage(const IntSize& aSizeInPoints) {
  if (!mRemotePrintJob || mRemotePrintJob->IsDestroyed()) {
    mRemotePrintJob = nullptr;
    return NS_ERROR_NOT_AVAILABLE;
  }

  mRecorder->OpenFD(mRemotePrintJob->GetNextPageFD());
  mCurrentPageSizeInPoints = aSizeInPoints;

  return NS_OK;
}

nsresult nsDeviceContextSpecProxy::EndPage() {
  if (!mRemotePrintJob || mRemotePrintJob->IsDestroyed()) {
    mRemotePrintJob = nullptr;
    return NS_ERROR_NOT_AVAILABLE;
  }

  // Send the page recording to the parent.
  mRecorder->Close();
  mRemotePrintJob->ProcessPage(mCurrentPageSizeInPoints,
                               std::move(mRecorder->TakeDependentSurfaces()));

  return NS_OK;
}
