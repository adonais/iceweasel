/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsDeviceContextSpecX_h_
#define nsDeviceContextSpecX_h_

#include <ApplicationServices/ApplicationServices.h>

#include "mozilla/gfx/PrintPromise.h"
#include "nsCOMPtr.h"
#include "nsIDeviceContextSpec.h"
#include "nsIPrinter.h"
#include "nsIPrinterList.h"

class nsDeviceContextSpecX : public nsIDeviceContextSpec {
 public:
  NS_DECL_ISUPPORTS

  nsDeviceContextSpecX();

  NS_IMETHOD Init(nsIPrintSettings* aPS, bool aIsPrintPreview) override;
  already_AddRefed<PrintTarget> MakePrintTarget() final;
  NS_IMETHOD BeginDocument(const nsAString& aTitle,
                           const nsAString& aPrintToFileName,
                           mozilla::dom::WindowContext*, int32_t aStartPage,
                           int32_t aEndPage) override;
  RefPtr<mozilla::gfx::PrintEndDocumentPromise> EndDocument() override;

  void GetPaperRect(double* aTop, double* aLeft, double* aBottom,
                    double* aRight);

  nsresult BeginPage(const IntSize&) final {
    mCurrentPageCount++;
    return NS_OK;
  }

 protected:
  virtual ~nsDeviceContextSpecX();

 protected:
  PMPrintSession mPrintSession = nullptr;
  PMPageFormat mPageFormat = nullptr;
  PMPrintSettings mPMPrintSettings = nullptr;
  nsCOMPtr<nsIOutputStream> mOutputStream;  // Output stream from settings.
  // The temporary PDF we post-process in EndDocument, or the final destination
  // file if mOutputFileIsFinal.
  nsCOMPtr<nsIFile> mOutputFile;
  // Whether the output file is the final destination.
  bool mOutputFileIsFinal = false;
  // The number of pages of the document at a given point in time.
  int32_t mCurrentPageCount = 0;

 private:
  nsresult DoEndDocument();
  nsresult PrintPDFViaPrintSession(CFURLRef aPDFURL);
};

#endif  // nsDeviceContextSpecX_h_
