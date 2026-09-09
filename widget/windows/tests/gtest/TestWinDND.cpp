/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// #include <windows.h>
#include <ole2.h>
#include <shlobj.h>

#include <cstddef>
#include <cstdint>
#include <cstring>

#include "gtest/gtest.h"
#include "nsArray.h"
#include "nsArrayUtils.h"
#include "nsClipboard.h"
#include "nsComponentManagerUtils.h"
#include "nsDataObjCollection.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsIFile.h"
#include "nsISupportsPrimitives.h"
#include "nsITransferable.h"
#include "nsNetUtil.h"

// shims for conversion from cppunittest to gtest
template <size_t N>
void fail(const char (&msg)[N]) {
  ADD_FAILURE() << "TEST-UNEXPECTED-FAIL | " << msg;
}
template <size_t N>
void passed(const char (&msg)[N]) {
  GTEST_SUCCEED() << "TEST-PASS | " << msg;
}

nsIFile* xferFile;

nsresult CheckValidHDROP(STGMEDIUM* pSTG) {
  if (pSTG->tymed != TYMED_HGLOBAL) {
    fail("Received data is not in an HGLOBAL");
    return NS_ERROR_UNEXPECTED;
  }

  HGLOBAL hGlobal = pSTG->hGlobal;
  DROPFILES* pDropFiles;
  pDropFiles = (DROPFILES*)GlobalLock(hGlobal);
  if (!pDropFiles) {
    fail("There is no data at the given HGLOBAL");
    return NS_ERROR_UNEXPECTED;
  }

  if (pDropFiles->pFiles != sizeof(DROPFILES)) {
    fail("DROPFILES struct has wrong size");
  }

  if (!pDropFiles->fWide) {
    fail("Received data is not Unicode");
    return NS_ERROR_UNEXPECTED;
  }
  nsString s;
  unsigned long offset = 0;
  while (true) {
    s = (char16_t*)((char*)pDropFiles + pDropFiles->pFiles + offset);
    if (s.IsEmpty()) break;
    nsresult rv;
    nsCOMPtr<nsIFile> localFile;
    rv = NS_NewLocalFile(s, getter_AddRefs(localFile));
    if (NS_FAILED(rv)) {
      fail("File could not be opened");
      return NS_ERROR_UNEXPECTED;
    }
    offset += sizeof(char16_t) * (s.Length() + 1);
  }
  return NS_OK;
}

nsresult CheckValidTEXT(STGMEDIUM* pSTG) {
  if (pSTG->tymed != TYMED_HGLOBAL) {
    fail("Received data is not in an HGLOBAL");
    return NS_ERROR_UNEXPECTED;
  }

  HGLOBAL hGlobal = pSTG->hGlobal;
  char* pText;
  pText = (char*)GlobalLock(hGlobal);
  if (!pText) {
    fail("There is no data at the given HGLOBAL");
    return NS_ERROR_UNEXPECTED;
  }

  nsCString string;
  string = pText;

  if (!string.EqualsLiteral("Mozilla can drag and drop")) {
    fail("Text passed through drop object wrong");
    return NS_ERROR_UNEXPECTED;
  }
  return NS_OK;
}

nsresult CheckValidTEXTTwo(STGMEDIUM* pSTG) {
  if (pSTG->tymed != TYMED_HGLOBAL) {
    fail("Received data is not in an HGLOBAL");
    return NS_ERROR_UNEXPECTED;
  }

  HGLOBAL hGlobal = pSTG->hGlobal;
  char* pText;
  pText = (char*)GlobalLock(hGlobal);
  if (!pText) {
    fail("There is no data at the given HGLOBAL");
    return NS_ERROR_UNEXPECTED;
  }

  nsCString string;
  string = pText;

  if (!string.EqualsLiteral("Mozilla can drag and drop twice over")) {
    fail("Text passed through drop object wrong");
    return NS_ERROR_UNEXPECTED;
  }
  return NS_OK;
}

nsresult CheckValidUNICODE(STGMEDIUM* pSTG) {
  if (pSTG->tymed != TYMED_HGLOBAL) {
    fail("Received data is not in an HGLOBAL");
    return NS_ERROR_UNEXPECTED;
  }

  HGLOBAL hGlobal = pSTG->hGlobal;
  char16_t* pText;
  pText = (char16_t*)GlobalLock(hGlobal);
  if (!pText) {
    fail("There is no data at the given HGLOBAL");
    return NS_ERROR_UNEXPECTED;
  }

  nsString string;
  string = pText;

  if (!string.EqualsLiteral("Mozilla can drag and drop")) {
    fail("Text passed through drop object wrong");
    return NS_ERROR_UNEXPECTED;
  }
  return NS_OK;
}

nsresult CheckValidUNICODETwo(STGMEDIUM* pSTG) {
  if (pSTG->tymed != TYMED_HGLOBAL) {
    fail("Received data is not in an HGLOBAL");
    return NS_ERROR_UNEXPECTED;
  }

  HGLOBAL hGlobal = pSTG->hGlobal;
  char16_t* pText;
  pText = (char16_t*)GlobalLock(hGlobal);
  if (!pText) {
    fail("There is no data at the given HGLOBAL");
    return NS_ERROR_UNEXPECTED;
  }

  nsString string;
  string = pText;

  if (!string.EqualsLiteral("Mozilla can drag and drop twice over")) {
    fail("Text passed through drop object wrong");
    return NS_ERROR_UNEXPECTED;
  }
  return NS_OK;
}

nsresult GetTransferableFile(nsCOMPtr<nsITransferable>& pTransferable) {
  nsresult rv;

  nsCOMPtr<nsISupports> genericWrapper = do_QueryInterface(xferFile);

  pTransferable = do_CreateInstance("@mozilla.org/widget/transferable;1");
  pTransferable->Init(nullptr);
  rv = pTransferable->SetTransferData("application/x-moz-file", genericWrapper);
  return rv;
}

nsresult GetTransferableText(nsCOMPtr<nsITransferable>& pTransferable) {
  nsresult rv;
  constexpr auto mozString = u"Mozilla can drag and drop"_ns;
  nsCOMPtr<nsISupportsString> xferString =
      do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID);
  rv = xferString->SetData(mozString);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISupports> genericWrapper = do_QueryInterface(xferString);

  pTransferable = do_CreateInstance("@mozilla.org/widget/transferable;1");
  pTransferable->Init(nullptr);
  rv = pTransferable->SetTransferData("text/plain", genericWrapper);
  return rv;
}

nsresult GetTransferableTextTwo(nsCOMPtr<nsITransferable>& pTransferable) {
  nsresult rv;
  constexpr auto mozString = u" twice over"_ns;
  nsCOMPtr<nsISupportsString> xferString =
      do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID);
  rv = xferString->SetData(mozString);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISupports> genericWrapper = do_QueryInterface(xferString);

  pTransferable = do_CreateInstance("@mozilla.org/widget/transferable;1");
  pTransferable->Init(nullptr);
  rv = pTransferable->SetTransferData("text/plain", genericWrapper);
  return rv;
}

nsresult GetTransferableURI(nsCOMPtr<nsITransferable>& pTransferable) {
  nsresult rv;

  nsCOMPtr<nsIURI> xferURI;

  rv = NS_NewURI(getter_AddRefs(xferURI), "http://www.mozilla.org");
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISupports> genericWrapper = do_QueryInterface(xferURI);

  pTransferable = do_CreateInstance("@mozilla.org/widget/transferable;1");
  pTransferable->Init(nullptr);
  rv = pTransferable->SetTransferData("text/x-moz-url", genericWrapper);
  return rv;
}

nsresult MakeDataObject(nsIArray* transferableArray,
                        RefPtr<IDataObject>& itemToDrag) {
  nsresult rv;
  uint32_t itemCount = 0;

  nsCOMPtr<nsIURI> uri;
  rv = NS_NewURI(getter_AddRefs(uri), "http://www.mozilla.org");
  NS_ENSURE_SUCCESS(rv, rv);

  rv = transferableArray->GetLength(&itemCount);
  NS_ENSURE_SUCCESS(rv, rv);

  // Copied more or less exactly from nsDragService::InvokeDragSession
  // This is what lets us play fake Drag Service for the test
  if (itemCount > 1) {
    nsDataObjCollection* dataObjCollection = new nsDataObjCollection();
    if (!dataObjCollection) return NS_ERROR_OUT_OF_MEMORY;
    itemToDrag = dataObjCollection;
    for (uint32_t i = 0; i < itemCount; ++i) {
      nsCOMPtr<nsITransferable> trans = do_QueryElementAt(transferableArray, i);
      if (trans) {
        RefPtr<IDataObject> dataObj;
        rv = nsClipboard::CreateNativeDataObject(trans, getter_AddRefs(dataObj),
                                                 uri);
        NS_ENSURE_SUCCESS(rv, rv);
        // Add the flavors to the collection object too
        rv = nsClipboard::SetupNativeDataObject(trans, dataObjCollection);
        NS_ENSURE_SUCCESS(rv, rv);

        dataObjCollection->AddDataObject(dataObj);
      }
    }
  }  // if dragging multiple items
  else {
    nsCOMPtr<nsITransferable> trans = do_QueryElementAt(transferableArray, 0);
    if (trans) {
      rv = nsClipboard::CreateNativeDataObject(trans,
                                               getter_AddRefs(itemToDrag), uri);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }  // else dragging a single object
  return rv;
}

nsresult Do_CheckOneFile() {
  nsresult rv;
  nsCOMPtr<nsITransferable> transferable;
  nsCOMPtr<nsIMutableArray> transferableArray = nsArray::Create();
  nsCOMPtr<nsISupports> genericWrapper;
  RefPtr<IDataObject> dataObj;

  rv = GetTransferableFile(transferable);
  if (NS_FAILED(rv)) {
    fail("Could not create the proper nsITransferable!");
    return rv;
  }
  genericWrapper = do_QueryInterface(transferable);
  rv = transferableArray->AppendElement(genericWrapper);
  if (NS_FAILED(rv)) {
    fail("Could not append element to transferable array");
    return rv;
  }

  rv = MakeDataObject(transferableArray, dataObj);
  if (NS_FAILED(rv)) {
    fail("Could not create data object");
    return rv;
  }

  FORMATETC fe;
  SET_FORMATETC(fe, CF_HDROP, 0, DVASPECT_CONTENT, -1, TYMED_HGLOBAL);
  if (dataObj->QueryGetData(&fe) != S_OK) {
    fail("File data object does not support the file data type!");
    return NS_ERROR_UNEXPECTED;
  }

  STGMEDIUM* stg;
  stg = (STGMEDIUM*)CoTaskMemAlloc(sizeof(STGMEDIUM));
  if (dataObj->GetData(&fe, stg) != S_OK) {
    fail("File data object did not provide data on request");
    return NS_ERROR_UNEXPECTED;
  }

  rv = CheckValidHDROP(stg);
  if (NS_FAILED(rv)) {
    fail("HDROP was invalid");
    return rv;
  }

  ReleaseStgMedium(stg);

  return NS_OK;
}

nsresult Do_CheckTwoFiles() {
  nsresult rv;
  nsCOMPtr<nsITransferable> transferable;
  nsCOMPtr<nsIMutableArray> transferableArray = nsArray::Create();
  nsCOMPtr<nsISupports> genericWrapper;
  RefPtr<IDataObject> dataObj;

  rv = GetTransferableFile(transferable);
  if (NS_FAILED(rv)) {
    fail("Could not create the proper nsITransferable!");
    return rv;
  }
  genericWrapper = do_QueryInterface(transferable);
  rv = transferableArray->AppendElement(genericWrapper);
  if (NS_FAILED(rv)) {
    fail("Could not append element to transferable array");
    return rv;
  }

  rv = GetTransferableFile(transferable);
  if (NS_FAILED(rv)) {
    fail("Could not create the proper nsITransferable!");
    return rv;
  }
  genericWrapper = do_QueryInterface(transferable);
  rv = transferableArray->AppendElement(genericWrapper);
  if (NS_FAILED(rv)) {
    fail("Could not append element to transferable array");
    return rv;
  }

  rv = MakeDataObject(transferableArray, dataObj);
  if (NS_FAILED(rv)) {
    fail("Could not create data object");
    return rv;
  }

  FORMATETC fe;
  SET_FORMATETC(fe, CF_HDROP, 0, DVASPECT_CONTENT, -1, TYMED_HGLOBAL);
  if (dataObj->QueryGetData(&fe) != S_OK) {
    fail("File data object does not support the file data type!");
    return NS_ERROR_UNEXPECTED;
  }

  STGMEDIUM* stg;
  stg = (STGMEDIUM*)CoTaskMemAlloc(sizeof(STGMEDIUM));
  if (dataObj->GetData(&fe, stg) != S_OK) {
    fail("File data object did not provide data on request");
    return NS_ERROR_UNEXPECTED;
  }

  rv = CheckValidHDROP(stg);
  if (NS_FAILED(rv)) {
    fail("HDROP was invalid");
    return rv;
  }

  ReleaseStgMedium(stg);

  return NS_OK;
}

nsresult Do_CheckOneString() {
  nsresult rv;
  nsCOMPtr<nsITransferable> transferable;
  nsCOMPtr<nsIMutableArray> transferableArray = nsArray::Create();
  nsCOMPtr<nsISupports> genericWrapper;
  RefPtr<IDataObject> dataObj;

  rv = GetTransferableText(transferable);
  if (NS_FAILED(rv)) {
    fail("Could not create the proper nsITransferable!");
    return rv;
  }
  genericWrapper = do_QueryInterface(transferable);
  rv = transferableArray->AppendElement(genericWrapper);
  if (NS_FAILED(rv)) {
    fail("Could not append element to transferable array");
    return rv;
  }

  rv = MakeDataObject(transferableArray, dataObj);
  if (NS_FAILED(rv)) {
    fail("Could not create data object");
    return rv;
  }

  FORMATETC fe;
  SET_FORMATETC(fe, CF_TEXT, 0, DVASPECT_CONTENT, -1, TYMED_HGLOBAL);
  if (dataObj->QueryGetData(&fe) != S_OK) {
    fail("String data object does not support the ASCII text data type!");
    return NS_ERROR_UNEXPECTED;
  }

  STGMEDIUM* stg;
  stg = (STGMEDIUM*)CoTaskMemAlloc(sizeof(STGMEDIUM));
  if (dataObj->GetData(&fe, stg) != S_OK) {
    fail("String data object did not provide ASCII data on request");
    return NS_ERROR_UNEXPECTED;
  }

  rv = CheckValidTEXT(stg);
  if (NS_FAILED(rv)) {
    fail("TEXT was invalid");
    return rv;
  }

  ReleaseStgMedium(stg);

  SET_FORMATETC(fe, CF_UNICODETEXT, 0, DVASPECT_CONTENT, -1, TYMED_HGLOBAL);
  if (dataObj->QueryGetData(&fe) != S_OK) {
    fail("String data object does not support the wide text data type!");
    return NS_ERROR_UNEXPECTED;
  }

  if (dataObj->GetData(&fe, stg) != S_OK) {
    fail("String data object did not provide wide data on request");
    return NS_ERROR_UNEXPECTED;
  }

  rv = CheckValidUNICODE(stg);
  if (NS_FAILED(rv)) {
    fail("UNICODE was invalid");
    return rv;
  }

  return NS_OK;
}

nsresult Do_CheckTwoStrings() {
  nsresult rv;
  nsCOMPtr<nsITransferable> transferable;
  nsCOMPtr<nsIMutableArray> transferableArray = nsArray::Create();
  nsCOMPtr<nsISupports> genericWrapper;
  RefPtr<IDataObject> dataObj;

  rv = GetTransferableText(transferable);
  if (NS_FAILED(rv)) {
    fail("Could not create the proper nsITransferable!");
    return rv;
  }
  genericWrapper = do_QueryInterface(transferable);
  rv = transferableArray->AppendElement(genericWrapper);
  if (NS_FAILED(rv)) {
    fail("Could not append element to transferable array");
    return rv;
  }

  rv = GetTransferableTextTwo(transferable);
  if (NS_FAILED(rv)) {
    fail("Could not create the proper nsITransferable!");
    return rv;
  }
  genericWrapper = do_QueryInterface(transferable);
  rv = transferableArray->AppendElement(genericWrapper);
  if (NS_FAILED(rv)) {
    fail("Could not append element to transferable array");
    return rv;
  }

  rv = MakeDataObject(transferableArray, dataObj);
  if (NS_FAILED(rv)) {
    fail("Could not create data object");
    return rv;
  }

  FORMATETC fe;
  SET_FORMATETC(fe, CF_TEXT, 0, DVASPECT_CONTENT, -1, TYMED_HGLOBAL);
  if (dataObj->QueryGetData(&fe) != S_OK) {
    fail("String data object does not support the ASCII text data type!");
    return NS_ERROR_UNEXPECTED;
  }

  STGMEDIUM* stg;
  stg = (STGMEDIUM*)CoTaskMemAlloc(sizeof(STGMEDIUM));
  if (dataObj->GetData(&fe, stg) != S_OK) {
    fail("String data object did not provide ASCII data on request");
    return NS_ERROR_UNEXPECTED;
  }

  rv = CheckValidTEXTTwo(stg);
  if (NS_FAILED(rv)) {
    fail("TEXT was invalid");
    return rv;
  }

  ReleaseStgMedium(stg);

  SET_FORMATETC(fe, CF_UNICODETEXT, 0, DVASPECT_CONTENT, -1, TYMED_HGLOBAL);
  if (dataObj->QueryGetData(&fe) != S_OK) {
    fail("String data object does not support the wide text data type!");
    return NS_ERROR_UNEXPECTED;
  }

  if (dataObj->GetData(&fe, stg) != S_OK) {
    fail("String data object did not provide wide data on request");
    return NS_ERROR_UNEXPECTED;
  }

  rv = CheckValidUNICODETwo(stg);
  if (NS_FAILED(rv)) {
    fail("UNICODE was invalid");
    return rv;
  }

  return NS_OK;
}

nsresult Do_CheckSetArbitraryData(bool aMultiple) {
  nsresult rv;
  nsCOMPtr<nsITransferable> transferable;
  nsCOMPtr<nsIMutableArray> transferableArray = nsArray::Create();
  nsCOMPtr<nsISupports> genericWrapper;
  RefPtr<IDataObject> dataObj;

  rv = GetTransferableText(transferable);
  if (NS_FAILED(rv)) {
    fail("Could not create the proper nsITransferable!");
    return rv;
  }
  genericWrapper = do_QueryInterface(transferable);
  rv = transferableArray->AppendElement(genericWrapper);
  if (NS_FAILED(rv)) {
    fail("Could not append element to transferable array");
    return rv;
  }

  if (aMultiple) {
    rv = GetTransferableText(transferable);
    if (NS_FAILED(rv)) {
      fail("Could not create the proper nsITransferable!");
      return rv;
    }
    genericWrapper = do_QueryInterface(transferable);
    rv = transferableArray->AppendElement(genericWrapper);
    if (NS_FAILED(rv)) {
      fail("Could not append element to transferable array");
      return rv;
    }
  }

  rv = MakeDataObject(transferableArray, dataObj);
  if (NS_FAILED(rv)) {
    fail("Could not create data object");
    return rv;
  }

  static CLIPFORMAT mozArbitraryFormat =
      ::RegisterClipboardFormatW(L"MozillaTestFormat");
  FORMATETC fe;
  STGMEDIUM stg;
  SET_FORMATETC(fe, mozArbitraryFormat, 0, DVASPECT_CONTENT, -1, TYMED_HGLOBAL);

  HGLOBAL hg = GlobalAlloc(GPTR, 1024);
  stg.tymed = TYMED_HGLOBAL;
  stg.hGlobal = hg;
  stg.pUnkForRelease = nullptr;

  if (dataObj->SetData(&fe, &stg, true) != S_OK) {
    if (aMultiple) {
      fail("Unable to set arbitrary data type on data object collection!");
    } else {
      fail("Unable to set arbitrary data type on data object!");
    }
    return NS_ERROR_UNEXPECTED;
  }

  if (dataObj->QueryGetData(&fe) != S_OK) {
    fail("Arbitrary data set on data object is not advertised!");
    return NS_ERROR_UNEXPECTED;
  }

  STGMEDIUM* stg2;
  stg2 = (STGMEDIUM*)CoTaskMemAlloc(sizeof(STGMEDIUM));
  if (dataObj->GetData(&fe, stg2) != S_OK) {
    fail("Data object did not provide arbitrary data upon request!");
    return NS_ERROR_UNEXPECTED;
  }

  if (stg2->hGlobal != hg) {
    fail("Arbitrary data was not returned properly!");
    return rv;
  }
  ReleaseStgMedium(stg2);

  return NS_OK;
}

// This function performs basic drop tests, testing a data object consisting
// of one transferable
nsresult Do_Test1() {
  nsresult rv = NS_OK;
  nsresult workingrv;

  workingrv = Do_CheckOneFile();
  if (NS_FAILED(workingrv)) {
    fail("Drag object tests failed on a single file");
    rv = NS_ERROR_UNEXPECTED;
  } else {
    passed("Successfully created a working file drag object!");
  }

  workingrv = Do_CheckOneString();
  if (NS_FAILED(workingrv)) {
    fail("Drag object tests failed on a single string");
    rv = NS_ERROR_UNEXPECTED;
  } else {
    passed("Successfully created a working string drag object!");
  }

  workingrv = Do_CheckSetArbitraryData(false);
  if (NS_FAILED(workingrv)) {
    fail("Drag object tests failed on setting arbitrary data");
    rv = NS_ERROR_UNEXPECTED;
  } else {
    passed("Successfully set arbitrary data on a drag object");
  }

  return rv;
}

// This function performs basic drop tests, testing a data object consisting of
// two transferables.
nsresult Do_Test2() {
  nsresult rv = NS_OK;
  nsresult workingrv;

  workingrv = Do_CheckTwoFiles();
  if (NS_FAILED(workingrv)) {
    fail("Drag object tests failed on multiple files");
    rv = NS_ERROR_UNEXPECTED;
  } else {
    passed("Successfully created a working multiple file drag object!");
  }

  workingrv = Do_CheckTwoStrings();
  if (NS_FAILED(workingrv)) {
    fail("Drag object tests failed on multiple strings");
    rv = NS_ERROR_UNEXPECTED;
  } else {
    passed("Successfully created a working multiple string drag object!");
  }

  workingrv = Do_CheckSetArbitraryData(true);
  if (NS_FAILED(workingrv)) {
    fail("Drag object tests failed on setting arbitrary data");
    rv = NS_ERROR_UNEXPECTED;
  } else {
    passed("Successfully set arbitrary data on a drag object");
  }

  return rv;
}

// This function performs advanced drag and drop tests, testing a data object
// consisting of multiple transferables that have different data types
nsresult Do_Test3() {
  nsresult rv = NS_OK;
  // nsresult workingrv;

  // XXX TODO Write more advanced tests in Bug 535860
  return rv;
}

nsCOMPtr<nsIFile> GetTemporaryDirectory() {
  nsCOMPtr<nsIFile> tmpdir;

#define ENSURE(expr) NS_ENSURE_SUCCESS(expr, nullptr);

  ENSURE(NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(tmpdir)));
  MOZ_RELEASE_ASSERT(tmpdir);

  ENSURE(tmpdir->AppendNative("TestWinDND"_ns));
  ENSURE(tmpdir->CreateUnique(nsIFile::DIRECTORY_TYPE, 0777));

#undef ENSURE

  return tmpdir;
}

TEST(TestWinDND, All)
{
  nsCOMPtr<nsIFile> file = GetTemporaryDirectory();
  if (!file) {
    fail("could not create temporary directory!");
    return;
  }
  xferFile = file;

  if (NS_SUCCEEDED(Do_Test1())) {
    passed(
        "Basic Drag and Drop data type tests (single transferable) succeeded!");
  }

  if (NS_SUCCEEDED(Do_Test2())) {
    passed(
        "Basic Drag and Drop data type tests (multiple transferables) "
        "succeeded!");
  }

  // if (NS_SUCCEEDED(Do_Test3()))
  //  passed("Advanced Drag and Drop data type tests succeeded!");
}

// A drag source that claims more descriptor entries (cItems) than its
// allocation holds.
class TruncatedFileGroupDescriptorDataObject final : public IDataObject {
 public:
  explicit TruncatedFileGroupDescriptorDataObject(HGLOBAL aDescriptor)
      : mRefCnt(1), mDescriptor(aDescriptor) {}

  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID aIid, void** aOut) override {
    if (!aOut) {
      return E_POINTER;
    }
    if (aIid == IID_IUnknown || aIid == IID_IDataObject) {
      *aOut = static_cast<IDataObject*>(this);
      AddRef();
      return S_OK;
    }
    *aOut = nullptr;
    return E_NOINTERFACE;
  }

  ULONG STDMETHODCALLTYPE AddRef() override {
    return InterlockedIncrement(&mRefCnt);
  }

  ULONG STDMETHODCALLTYPE Release() override {
    ULONG count = InterlockedDecrement(&mRefCnt);
    if (!count) {
      delete this;
    }
    return count;
  }

  HRESULT STDMETHODCALLTYPE GetData(FORMATETC* aFormat,
                                    STGMEDIUM* aMedium) override {
    if (!aFormat || !aMedium || !MatchesDescriptorW(*aFormat)) {
      return DV_E_FORMATETC;
    }
    // Hand back a fresh copy; the caller owns it via ReleaseStgMedium.
    const SIZE_T size = ::GlobalSize(mDescriptor);
    HGLOBAL copy = ::GlobalAlloc(GMEM_MOVEABLE, size);
    if (!copy) {
      return E_OUTOFMEMORY;
    }
    void* dst = ::GlobalLock(copy);
    void* src = ::GlobalLock(mDescriptor);
    memcpy(dst, src, size);
    ::GlobalUnlock(mDescriptor);
    ::GlobalUnlock(copy);

    memset(aMedium, 0, sizeof(*aMedium));
    aMedium->tymed = TYMED_HGLOBAL;
    aMedium->hGlobal = copy;
    return S_OK;
  }

  HRESULT STDMETHODCALLTYPE QueryGetData(FORMATETC* aFormat) override {
    if (!aFormat) {
      return E_INVALIDARG;
    }
    return MatchesDescriptorW(*aFormat) ? S_OK : DV_E_FORMATETC;
  }

  HRESULT STDMETHODCALLTYPE GetDataHere(FORMATETC*, STGMEDIUM*) override {
    return E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE GetCanonicalFormatEtc(FORMATETC*,
                                                  FORMATETC* aOut) override {
    if (aOut) {
      aOut->ptd = nullptr;
    }
    return E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE SetData(FORMATETC*, STGMEDIUM*, BOOL) override {
    return E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE EnumFormatEtc(DWORD, IEnumFORMATETC**) override {
    return E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE DAdvise(FORMATETC*, DWORD, IAdviseSink*,
                                    DWORD*) override {
    return OLE_E_ADVISENOTSUPPORTED;
  }
  HRESULT STDMETHODCALLTYPE DUnadvise(DWORD) override {
    return OLE_E_ADVISENOTSUPPORTED;
  }
  HRESULT STDMETHODCALLTYPE EnumDAdvise(IEnumSTATDATA**) override {
    return OLE_E_ADVISENOTSUPPORTED;
  }

 private:
  ~TruncatedFileGroupDescriptorDataObject() {
    if (mDescriptor) {
      ::GlobalFree(mDescriptor);
    }
  }

  static bool MatchesDescriptorW(const FORMATETC& aFormat) {
    static CLIPFORMAT sFileDescriptorW =
        ::RegisterClipboardFormatW(CFSTR_FILEDESCRIPTORW);
    return aFormat.cfFormat == sFileDescriptorW &&
           (aFormat.tymed & TYMED_HGLOBAL) &&
           aFormat.dwAspect == DVASPECT_CONTENT;
  }

  volatile LONG mRefCnt;
  HGLOBAL mDescriptor;
};

// Reject a group descriptor whose backing HGLOBAL is too small to hold the
// requested number of entries.
TEST(TestWinDND, FileGroupDescriptorHasItems)
{
  EXPECT_FALSE(nsClipboard::FileGroupDescriptorHasItems<FILEGROUPDESCRIPTORW>(
      nullptr, 1));

  // Header only, room for zero descriptor entries.
  HGLOBAL headerOnly = ::GlobalAlloc(GMEM_MOVEABLE, sizeof(UINT));
  ASSERT_NE(headerOnly, nullptr);
  EXPECT_TRUE(nsClipboard::FileGroupDescriptorHasItems<FILEGROUPDESCRIPTORW>(
      headerOnly, 0));
  EXPECT_FALSE(nsClipboard::FileGroupDescriptorHasItems<FILEGROUPDESCRIPTORW>(
      headerOnly, 1));
  EXPECT_FALSE(nsClipboard::FileGroupDescriptorHasItems<FILEGROUPDESCRIPTORA>(
      headerOnly, 1));
  // Overflowing the size computation must fail.
  EXPECT_FALSE(nsClipboard::FileGroupDescriptorHasItems<FILEGROUPDESCRIPTORW>(
      headerOnly, UINT64_MAX));
  ::GlobalFree(headerOnly);

  // Room for exactly two wide descriptor entries, but not 3.
  HGLOBAL twoEntries =
      ::GlobalAlloc(GMEM_MOVEABLE, offsetof(FILEGROUPDESCRIPTORW, fgd) +
                                       2 * sizeof(FILEDESCRIPTORW));
  ASSERT_NE(twoEntries, nullptr);
  EXPECT_TRUE(nsClipboard::FileGroupDescriptorHasItems<FILEGROUPDESCRIPTORW>(
      twoEntries, 2));
  EXPECT_FALSE(nsClipboard::FileGroupDescriptorHasItems<FILEGROUPDESCRIPTORW>(
      twoEntries, 3));
  ::GlobalFree(twoEntries);
}

TEST(TestWinDND, TruncatedFileGroupDescriptorIsRejected)
{
  // Allocate room for the cItems header only, but claim two entries.
  HGLOBAL descriptor = ::GlobalAlloc(GMEM_MOVEABLE, sizeof(UINT));
  ASSERT_NE(descriptor, nullptr);
  auto* group = static_cast<FILEGROUPDESCRIPTORW*>(::GlobalLock(descriptor));
  ASSERT_NE(group, nullptr);
  group->cItems = 2;
  ::GlobalUnlock(descriptor);

  // mRefCnt is initialized to 1.
  RefPtr<IDataObject> dataObj = dont_AddRef(static_cast<IDataObject*>(
      new TruncatedFileGroupDescriptorDataObject(descriptor)));

  void* data = nullptr;
  uint32_t len = 0;
  nsresult rv = nsClipboard::GetNativeDataOffClipboard(
      dataObj, /* aIndex */ 1, CF_HDROP, /* aMIMEImageFormat */ nullptr, &data,
      &len);

  EXPECT_EQ(rv, NS_ERROR_INVALID_ARG);
  EXPECT_EQ(data, nullptr);
  EXPECT_EQ(len, 0u);
}

static HGLOBAL MakeDropFiles(DWORD aPFiles, BOOL aWide, const void* aList,
                             size_t aListBytes) {
  HGLOBAL hglobal =
      ::GlobalAlloc(GMEM_MOVEABLE, sizeof(DROPFILES) + aListBytes);
  if (!hglobal) {
    return nullptr;
  }
  auto* bytes = static_cast<BYTE*>(::GlobalLock(hglobal));
  if (!bytes) {
    ::GlobalFree(hglobal);
    return nullptr;
  }
  // Fill the whole allocation, padding included, with non-NUL bytes so that it
  // cannot accidentally terminate the file list.
  memset(bytes, 0x41, ::GlobalSize(hglobal));
  auto* header = reinterpret_cast<DROPFILES*>(bytes);
  memset(header, 0, sizeof(*header));
  header->pFiles = aPFiles;
  header->fWide = aWide;
  memcpy(bytes + sizeof(DROPFILES), aList, aListBytes);
  ::GlobalUnlock(hglobal);
  return hglobal;
}

// Reject invalid DROPFILES data
TEST(TestWinDND, IsValidDropFilesData)
{
  const wchar_t terminatedW[] = {L'C', L':', L'\\', L'a', L'\0', L'\0'};
  const wchar_t singleNulW[] = {L'C', L':', L'\\', L'a', L'\0'};
  const wchar_t unterminatedW[] = {L'C', L':', L'\\', L'a'};
  const char terminatedA[] = {'C', ':', '\\', 'a', '\0', '\0'};

  EXPECT_FALSE(nsClipboard::IsValidDropFilesData(nullptr));

  // Too small to hold a DROPFILES header.
  HGLOBAL tooSmall = ::GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, 1);
  ASSERT_NE(tooSmall, nullptr);
  ASSERT_LT(::GlobalSize(tooSmall), sizeof(DROPFILES));
  EXPECT_FALSE(nsClipboard::IsValidDropFilesData(tooSmall));
  ::GlobalFree(tooSmall);

  struct TestData {
    const char* mDescription;
    DWORD mPFiles;
    BOOL mWide;
    const void* mList;
    size_t mListBytes;
    bool mValid;
  };

  const TestData tests[] = {
      {"wide, terminated", sizeof(DROPFILES), TRUE, terminatedW,
       sizeof(terminatedW), true},
      {"ansi, terminated", sizeof(DROPFILES), FALSE, terminatedA,
       sizeof(terminatedA), true},
      {"wide, single NUL", sizeof(DROPFILES), TRUE, singleNulW,
       sizeof(singleNulW), false},
      {"wide, unterminated", sizeof(DROPFILES), TRUE, unterminatedW,
       sizeof(unterminatedW), false},
      {"list starts past the end", 0x40000000, TRUE, terminatedW,
       sizeof(terminatedW), false},
      {"list starts inside the header", 4, TRUE, terminatedW,
       sizeof(terminatedW), false},
  };

  for (const auto& test : tests) {
    HGLOBAL hglobal =
        MakeDropFiles(test.mPFiles, test.mWide, test.mList, test.mListBytes);
    ASSERT_NE(hglobal, nullptr);
    EXPECT_EQ(nsClipboard::IsValidDropFilesData(hglobal), test.mValid)
        << test.mDescription;
    ::GlobalFree(hglobal);
  }
}
