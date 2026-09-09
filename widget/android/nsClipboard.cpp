/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsClipboard.h"

#include "mozilla/java/ClipboardWrappers.h"
#include "mozilla/java/GeckoAppShellWrappers.h"
#include "mozilla/widget/WebCustomFormatUtils.h"
#include "nsArrayUtils.h"
#include "nsCOMPtr.h"
#include "nsComponentManagerUtils.h"
#include "nsIMutableArray.h"
#include "nsISupportsPrimitives.h"
#include "nsMemory.h"
#include "nsPrimitiveHelpers.h"
#include "nsStringStream.h"

using namespace mozilla;

// Per the W3C clipboard-apis spec, Appendix A, Android shares the
// Linux/ChromeOS atoms: one map atom, plus a per-essence atom
// "application/web;type=\"custom/formatN\"" for each payload.
static constexpr char16_t kWebCustomFormatMapMime[] =
    u"application/web;type=\"custom/formatmap\"";
static constexpr char kWebCustomFormatMimePrefix[] =
    "application/web;type=\"custom/format";

static constexpr uint32_t kWebCustomFormatPrefixLength =
    nsLiteralCString(kWebCustomFormatPrefix).Length();

NS_IMPL_ISUPPORTS_INHERITED0(nsClipboard, nsBaseClipboard)

/* The Android clipboard only supports text and doesn't support mime types
 * so we assume all clipboard data is text/plain for now. Documentation
 * indicates that support for other data types is planned for future
 * releases.
 */

nsClipboard::nsClipboard()
    : nsBaseClipboard(mozilla::dom::ClipboardCapabilities(
          false /* supportsSelectionClipboard */,
          false /* supportsFindClipboard */,
          false /* supportsSelectionCache */)) {
  java::Clipboard::StartTrackingClipboardData(
      java::GeckoAppShell::GetApplicationContext());
}

nsClipboard::~nsClipboard() {
  java::Clipboard::StopTrackingClipboardData(
      java::GeckoAppShell::GetApplicationContext());
}

// static
nsresult nsClipboard::GetTextFromTransferable(nsITransferable* aTransferable,
                                              nsString& aText,
                                              nsString& aHTML) {
  nsTArray<nsCString> flavors;
  nsresult rv = aTransferable->FlavorsTransferableCanImport(flavors);
  if (NS_FAILED(rv)) {
    return rv;
  }

  for (auto& flavorStr : flavors) {
    if (flavorStr.EqualsLiteral(kTextMime)) {
      nsCOMPtr<nsISupports> item;
      nsresult rv =
          aTransferable->GetTransferData(kTextMime, getter_AddRefs(item));
      if (NS_WARN_IF(NS_FAILED(rv))) {
        continue;
      }
      nsCOMPtr<nsISupportsString> supportsString = do_QueryInterface(item);
      if (supportsString) {
        supportsString->GetData(aText);
      }
    } else if (flavorStr.EqualsLiteral(kHTMLMime)) {
      nsCOMPtr<nsISupports> item;
      nsresult rv =
          aTransferable->GetTransferData(kHTMLMime, getter_AddRefs(item));
      if (NS_WARN_IF(NS_FAILED(rv))) {
        continue;
      }
      nsCOMPtr<nsISupportsString> supportsString = do_QueryInterface(item);
      if (supportsString) {
        supportsString->GetData(aHTML);
      }
    }
  }
  return NS_OK;
}

// Fetch the "application/web;type=\"custom/formatmap\"" JSON from the
// primary clip and decode it into aMap. Returns false when the map atom
// isn't published or the JSON fails to parse.
static bool GetWebCustomFormatMapFromClipboard(
    mozilla::widget::WebCustomFormatMap& aMap) {
  auto jsonRef = java::Clipboard::GetWebCustomFormatMapJson(
      java::GeckoAppShell::GetApplicationContext());
  if (!jsonRef) {
    return false;
  }
  return mozilla::widget::JSONToWebCustomFormatMap(jsonRef->ToCString(), aMap);
}

NS_IMETHODIMP
nsClipboard::SetNativeClipboardData(nsITransferable* aTransferable,
                                    ClipboardType aWhichClipboard) {
  MOZ_DIAGNOSTIC_ASSERT(aTransferable);
  MOZ_DIAGNOSTIC_ASSERT(
      nsIClipboard::IsClipboardTypeSupported(aWhichClipboard));

  if (!jni::IsAvailable()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  // Standard text/HTML flavors live in the same transferable as web custom
  // formats and must be co-published, otherwise readers asking for text/plain
  // after a {text/plain, web foo/bar} write see nothing.
  nsString text;
  nsString html;
  nsresult rv = GetTextFromTransferable(aTransferable, text, html);
  if (NS_FAILED(rv)) {
    return rv;
  }

  bool isPrivate = aTransferable->GetIsPrivateData();

  // Collect "web foo/bar" flavors. If any are present, the loop below packs
  // them into a single multi-MIME ClipData via GeckoClipboardContentProvider;
  // otherwise we fall through to the legacy text/HTML write path.
  nsTArray<nsCString> flavors;
  aTransferable->FlavorsTransferableCanExport(flavors);

  mozilla::widget::WebCustomFormatMap webCustomFormatMap;
  uint32_t webCustomFormatIndex = 0;
  struct WebPayload {
    nsCString mMime;
    nsTArray<uint8_t> mBytes;
  };
  nsTArray<WebPayload> webPayloads;
  for (const auto& flavorStr : flavors) {
    if (!StringBeginsWith(flavorStr,
                          nsLiteralCString(kWebCustomFormatPrefix))) {
      continue;
    }
    if (!nsBaseClipboard::IsValidFlavor(flavorStr)) {
      continue;
    }
    nsCOMPtr<nsISupports> data;
    if (NS_FAILED(aTransferable->GetTransferData(flavorStr.get(),
                                                 getter_AddRefs(data))) ||
        !data) {
      continue;
    }
    nsCOMPtr<nsISupportsCString> cstr = do_QueryInterface(data);
    if (!cstr) {
      continue;
    }
    nsAutoCString bytes;
    cstr->GetData(bytes);

    nsAutoCString perTargetMime(kWebCustomFormatMimePrefix);
    perTargetMime.AppendInt(webCustomFormatIndex);
    perTargetMime.Append('"');

    nsDependentCSubstring essence(
        Substring(flavorStr, kWebCustomFormatPrefixLength));
    webCustomFormatMap.InsertOrUpdate(essence, perTargetMime);

    WebPayload* payload = webPayloads.AppendElement();
    payload->mMime = perTargetMime;
    payload->mBytes.AppendElements(
        reinterpret_cast<const uint8_t*>(bytes.BeginReading()), bytes.Length());
    webCustomFormatIndex++;
  }

  if (!webCustomFormatMap.IsEmpty()) {
    // Session is MIME-agnostic: the first added payload becomes ClipData
    // Item[0]'s URI, so we push the web custom format map JSON first, then
    // each per-essence payload.
    int64_t sessionId = java::Clipboard::OpenWriteSession();
    nsAutoCString mapJson;
    mozilla::widget::WebCustomFormatMapToJSON(webCustomFormatMap, mapJson);
    jni::ByteArray::LocalRef mapArr = jni::ByteArray::New(
        reinterpret_cast<const int8_t*>(mapJson.BeginReading()),
        mapJson.Length());
    java::Clipboard::AddPayload(sessionId, kWebCustomFormatMapMime, mapArr);
    for (const auto& payload : webPayloads) {
      jni::ByteArray::LocalRef arr = jni::ByteArray::New(
          reinterpret_cast<const int8_t*>(payload.mBytes.Elements()),
          payload.mBytes.Length());
      java::Clipboard::AddPayload(sessionId,
                                  NS_ConvertUTF8toUTF16(payload.mMime), arr);
    }
    if (!java::Clipboard::CommitWriteSession(
            java::GeckoAppShell::GetApplicationContext(), sessionId, text, html,
            isPrivate)) {
      java::Clipboard::CancelWriteSession(sessionId);
      return NS_ERROR_FAILURE;
    }
    return NS_OK;
  }

  if (!html.IsEmpty() &&
      java::Clipboard::SetHTML(java::GeckoAppShell::GetApplicationContext(),
                               text, html, isPrivate)) {
    return NS_OK;
  }
  if (!text.IsEmpty() &&
      java::Clipboard::SetText(java::GeckoAppShell::GetApplicationContext(),
                               text, isPrivate)) {
    return NS_OK;
  }

  return NS_ERROR_FAILURE;
}

mozilla::Result<nsCOMPtr<nsISupports>, nsresult>
nsClipboard::GetNativeClipboardData(const nsACString& aFlavor,
                                    ClipboardType aWhichClipboard,
                                    uint64_t aThreshold) {
  MOZ_DIAGNOSTIC_ASSERT(
      nsIClipboard::IsClipboardTypeSupported(aWhichClipboard));
  MOZ_DIAGNOSTIC_ASSERT(IsValidFlavor(aFlavor));

  if (!jni::IsAvailable()) {
    return Err(NS_ERROR_NOT_AVAILABLE);
  }

  if (aFlavor.EqualsLiteral(kTextMime) || aFlavor.EqualsLiteral(kHTMLMime)) {
    auto text = java::Clipboard::GetTextData(
        java::GeckoAppShell::GetApplicationContext(), aFlavor);
    if (!text) {
      return nsCOMPtr<nsISupports>{};
    }
    nsAutoString buffer(text->ToString());
    buffer.StripChar(char16_t(0));
    if (buffer.IsEmpty()) {
      return nsCOMPtr<nsISupports>{};
    }

    if (aThreshold && aFlavor.EqualsLiteral(kTextMime) &&
        buffer.Length() * 2 > aThreshold) {
      return mozilla::Err(NS_ERROR_CLIPBOARD_TOO_BIG);
    }

    nsCOMPtr<nsISupports> wrapper;
    nsPrimitiveHelpers::CreatePrimitiveForData(
        aFlavor, buffer.get(), buffer.Length() * 2, getter_AddRefs(wrapper));
    return std::move(wrapper);
  }

  // Web custom format map: pull the JSON, parse it, and surface the per-
  // essence "web foo/bar" flavors as an nsIMutableArray.
  if (aFlavor.EqualsLiteral(kWebCustomFormatMapType)) {
    mozilla::widget::WebCustomFormatMap parsed;
    if (!GetWebCustomFormatMapFromClipboard(parsed) || parsed.IsEmpty()) {
      return nsCOMPtr<nsISupports>{};
    }
    nsCOMPtr<nsIMutableArray> customFormats =
        do_CreateInstance(NS_ARRAY_CONTRACTID);
    for (const auto& essence : parsed.Keys()) {
      nsCOMPtr<nsISupportsCString> customFormat =
          do_CreateInstance(NS_SUPPORTS_CSTRING_CONTRACTID);
      customFormat->SetData(nsLiteralCString(kWebCustomFormatPrefix) + essence);
      customFormats->AppendElement(customFormat);
    }
    return nsCOMPtr<nsISupports>(std::move(customFormats));
  }

  // Specific "web foo/bar": fetch the map, look up the essence, then read
  // the bytes from the per-essence MIME entry the map points at.
  if (StringBeginsWith(aFlavor, nsLiteralCString(kWebCustomFormatPrefix))) {
    mozilla::widget::WebCustomFormatMap parsed;
    if (!GetWebCustomFormatMapFromClipboard(parsed)) {
      return nsCOMPtr<nsISupports>{};
    }
    nsDependentCSubstring essence(
        Substring(aFlavor, kWebCustomFormatPrefixLength));
    auto entry = parsed.Lookup(essence);
    if (!entry) {
      return nsCOMPtr<nsISupports>{};
    }
    jni::ByteArray::LocalRef bytes;
    bytes = java::Clipboard::GetWebCustomFormatPayload(
        java::GeckoAppShell::GetApplicationContext(),
        NS_ConvertUTF8toUTF16(entry.Data()));
    if (!bytes) {
      return nsCOMPtr<nsISupports>{};
    }
    auto elements = bytes->GetElements();
    nsCOMPtr<nsISupports> wrapper;
    nsPrimitiveHelpers::CreatePrimitiveForData(
        aFlavor, reinterpret_cast<const char*>(elements.Elements()),
        elements.Length(), getter_AddRefs(wrapper));
    return std::move(wrapper);
  }

  mozilla::jni::ByteArray::LocalRef bytes;
  nsresult rv = java::Clipboard::GetRawData(aFlavor, &bytes);
  if (NS_FAILED(rv) || !bytes) {
    return nsCOMPtr<nsISupports>{};
  }

  nsCOMPtr<nsIInputStream> byteStream;
  rv = NS_NewByteInputStream(getter_AddRefs(byteStream),
                             mozilla::Span(reinterpret_cast<const char*>(
                                               bytes->GetElements().Elements()),
                                           bytes->Length()),
                             NS_ASSIGNMENT_COPY);
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return nsCOMPtr<nsISupports>{};
  }

  return nsCOMPtr<nsISupports>(std::move(byteStream));
}

nsresult nsClipboard::EmptyNativeClipboardData(ClipboardType aWhichClipboard) {
  MOZ_DIAGNOSTIC_ASSERT(
      nsIClipboard::IsClipboardTypeSupported(aWhichClipboard));

  if (!jni::IsAvailable()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  java::Clipboard::Clear(java::GeckoAppShell::GetApplicationContext());

  return NS_OK;
}

mozilla::Result<int32_t, nsresult>
nsClipboard::GetNativeClipboardSequenceNumber(ClipboardType aWhichClipboard) {
  MOZ_DIAGNOSTIC_ASSERT(
      nsIClipboard::IsClipboardTypeSupported(aWhichClipboard));

  if (!jni::IsAvailable()) {
    return Err(NS_ERROR_NOT_AVAILABLE);
  }

  return java::Clipboard::GetSequenceNumber(
      java::GeckoAppShell::GetApplicationContext());
}

mozilla::Result<bool, nsresult>
nsClipboard::HasNativeClipboardDataMatchingFlavors(
    const nsTArray<nsCString>& aFlavorList, ClipboardType aWhichClipboard) {
  MOZ_DIAGNOSTIC_ASSERT(
      nsIClipboard::IsClipboardTypeSupported(aWhichClipboard));

  if (!jni::IsAvailable()) {
    return Err(NS_ERROR_NOT_AVAILABLE);
  }

  // The web custom format map JSON is loaded lazily on the first "web "
  // query so we don't pay the cost when the caller is only asking about
  // standard flavors.
  mozilla::widget::WebCustomFormatMap webCustomFormatMap;
  bool didLoadWebCustomFormatMap = false;
  auto loadWebMap = [&]() {
    if (didLoadWebCustomFormatMap) {
      return;
    }
    didLoadWebCustomFormatMap = true;
    GetWebCustomFormatMapFromClipboard(webCustomFormatMap);
  };

  for (auto& flavor : aFlavorList) {
    if (flavor.EqualsLiteral(kWebCustomFormatMapType)) {
      if (java::Clipboard::HasWebCustomFormatMap(
              java::GeckoAppShell::GetApplicationContext())) {
        return true;
      }
      continue;
    }
    if (StringBeginsWith(flavor, nsLiteralCString(kWebCustomFormatPrefix))) {
      loadWebMap();
      nsDependentCSubstring essence(
          Substring(flavor, kWebCustomFormatPrefixLength));
      if (webCustomFormatMap.Lookup(essence)) {
        return true;
      }
      continue;
    }
    if (java::Clipboard::HasData(java::GeckoAppShell::GetApplicationContext(),
                                 NS_ConvertASCIItoUTF16(flavor))) {
      return true;
    }
  }

  return false;
}
