/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ProfileAdditionalInformation.h"

#include "ipc/IPCMessageUtilsSpecializations.h"
#include "jsapi.h"
#include "js/JSON.h"
#include "js/PropertyAndElement.h"
#include "js/Value.h"
#include "mozilla/Assertions.h"
#include "mozilla/JSONStringWriteFuncs.h"
#include "platform.h"
#include "mozilla/scache/StartupCacheUtils.h"
#include "nsDirectoryServiceDefs.h"
#include "nsIFile.h"
#include "nsIFileURL.h"
#include "nsNetUtil.h"

namespace {

// Collapses ".." / "." segments via the URL parser. Unlike nsIFile::Normalize()
// it does not resolve symlinks, which non-packaged builds use to point
// chrome/resource sources at the source tree from within the GRE directory.
already_AddRefed<nsIFile> CollapseRelativePathSegments(nsIFile* aFile) {
  nsAutoCString spec;
  nsCOMPtr<nsIURI> uri;
  nsCOMPtr<nsIFileURL> fileURL;
  nsCOMPtr<nsIFile> collapsed;
  if (NS_FAILED(NS_GetURLSpecFromActualFile(aFile, spec)) ||
      NS_FAILED(NS_NewURI(getter_AddRefs(uri), spec)) ||
      !(fileURL = do_QueryInterface(uri)) ||
      NS_FAILED(fileURL->GetFile(getter_AddRefs(collapsed)))) {
    return nullptr;
  }
  return collapsed.forget();
}

bool IsSourceFileWithinGreDir(nsIURI* aURI) {
  // We need to compare the actual backing file against the GRE directory. For
  // nested URIs, NS_GetInnermostURI gives us the innermost backing URI. For
  // example, jar:file:///path/omni.ja!/foo.js unwraps to file:///path/omni.ja.
  // Non-nested URIs are returned unchanged, so plain file: URIs already work.
  // chrome:, resource:, and moz-src: URIs are also non-nested, but they are
  // aliases for another URI through the chrome registry or a substituting
  // protocol handler. Resolve them to their concrete file: or jar: target
  // before unwrapping.
  nsCOMPtr<nsIURI> uri = aURI;
  nsCString scheme;
  if (NS_FAILED(uri->GetScheme(scheme))) {
    return false;
  }
  if (scheme.EqualsLiteral("chrome") || scheme.EqualsLiteral("resource") ||
      scheme.EqualsLiteral("moz-src")) {
    nsCOMPtr<nsIURI> resolved;
    if (NS_FAILED(mozilla::scache::ResolveURI(uri, getter_AddRefs(resolved))) ||
        !resolved) {
      return false;
    }
    uri = std::move(resolved);
  }

  nsCOMPtr<nsIURI> innermost = NS_GetInnermostURI(uri);
  nsCOMPtr<nsIFileURL> fileURL = do_QueryInterface(innermost);
  nsCOMPtr<nsIFile> scriptFile;
  if (!fileURL || NS_FAILED(fileURL->GetFile(getter_AddRefs(scriptFile)))) {
    return false;
  }
  nsCOMPtr<nsIFile> cleanFile = CollapseRelativePathSegments(scriptFile);
  nsCOMPtr<nsIFile> greDir;
  bool contains = false;
  if (!cleanFile ||
      NS_FAILED(NS_GetSpecialDirectory(NS_GRE_DIR, getter_AddRefs(greDir))) ||
      NS_FAILED(greDir->Contains(cleanFile, &contains))) {
    return false;
  }
  return contains;
}

}  // namespace

JSString* mozilla::ProfileGenerationAdditionalInformation::
    MaybeCreateJSStringFromSourceData(
        JSContext* aCx, const ProfilerJSSourceData& aSourceData) const {
  JS::Rooted<JSString*> result(aCx);
  aSourceData.data().match(
      [&](const ProfilerJSSourceData::SourceTextUTF16& srcText) {
        result =
            JS_NewUCStringCopyN(aCx, srcText.chars().get(), srcText.length());
      },
      [&](const ProfilerJSSourceData::SourceTextUTF8& srcText) {
        result =
            JS_NewStringCopyN(aCx, srcText.chars().get(), srcText.length());
      },
      [&](const ProfilerJSSourceData::RetrievableFile&) {
        const char* filename = aSourceData.filePath();
        // Keep it in sync with what ReadSourceFromFilename does.
        const char* arrow;
        while ((arrow = strstr(filename, " -> "))) {
          filename = arrow + strlen(" -> ");
        }

        nsCOMPtr<nsIURI> uri;
        if (NS_FAILED(
                NS_NewURI(getter_AddRefs(uri), nsDependentCString(filename)))) {
          return;
        }

        if (!IsSourceFileWithinGreDir(uri)) {
          return;
        }

        ProfilerJSSourceData retrievedData =
            js::RetrieveProfilerSourceContent(aCx, aSourceData.filePath());
        const auto& data = retrievedData.data();
        if (!data.is<ProfilerJSSourceData::SourceTextUTF8>()) {
          return;
        }

        const auto& srcText = data.as<ProfilerJSSourceData::SourceTextUTF8>();
        result =
            JS_NewStringCopyN(aCx, srcText.chars().get(), srcText.length());
      },
      [&](const ProfilerJSSourceData::Unavailable&) {});
  return result;
}

void mozilla::ProfileGenerationAdditionalInformation::ToJSValue(
    JSContext* aCx, JS::MutableHandle<JS::Value> aRetVal) const {
  // Get the shared libraries array.
  JS::Rooted<JS::Value> sharedLibrariesVal(aCx);
  {
    JSONStringWriteFunc<nsCString> buffer;
    JSONWriter w(buffer, JSONWriter::SingleLineStyle);
    w.StartArrayElement();
    AppendSharedLibraries(w, mSharedLibraries);
    w.EndArray();
    NS_ConvertUTF8toUTF16 buffer16(buffer.StringCRef());
    MOZ_ALWAYS_TRUE(JS_ParseJSON(aCx,
                                 static_cast<const char16_t*>(buffer16.get()),
                                 buffer16.Length(), &sharedLibrariesVal));
  }

  // Create jsSources object, mapping source ID to an object with sourceText,
  // url, and sourceMapURL fields for WebChannel.
  JS::Rooted<JSObject*> jsSourcesObj(aCx, JS_NewPlainObject(aCx));
  if (jsSourcesObj) {
    for (const auto& entry : mJSSourceEntries) {
      JS::Rooted<JSObject*> entryObj(aCx, JS_NewPlainObject(aCx));
      if (!entryObj) {
        continue;
      }

      // Only emit an entry if it has sourceText (for GET_JS_SOURCES) or
      // sourceMapURL (for GET_SOURCE_MAP). A url alone is not useful to
      // either webchannel operation.
      bool hasData = false;

      JSString* sourceStr =
          MaybeCreateJSStringFromSourceData(aCx, entry.sourceData);
      if (sourceStr) {
        JS::Rooted<JS::Value> sourceVal(aCx, JS::StringValue(sourceStr));
        JS_SetProperty(aCx, entryObj, "sourceText", sourceVal);
        hasData = true;
      }

      if (entry.sourceData.filePathLength() > 0) {
        JSString* urlStr = JS_NewStringCopyUTF8N(
            aCx, JS::UTF8Chars(entry.sourceData.filePath(),
                               entry.sourceData.filePathLength()));
        if (urlStr) {
          JS::Rooted<JS::Value> urlVal(aCx, JS::StringValue(urlStr));
          JS_SetProperty(aCx, entryObj, "url", urlVal);
        }
      }

      if (entry.sourceData.sourceMapURLLength() > 0) {
        JSString* sourceMapURLStr =
            JS_NewUCStringCopyN(aCx, entry.sourceData.sourceMapURL(),
                                entry.sourceData.sourceMapURLLength());
        if (sourceMapURLStr) {
          JS::Rooted<JS::Value> sourceMapURLVal(
              aCx, JS::StringValue(sourceMapURLStr));
          JS_SetProperty(aCx, entryObj, "sourceMapURL", sourceMapURLVal);
          hasData = true;
        }
      }

      if (hasData) {
        JS::Rooted<JS::Value> entryVal(aCx, JS::ObjectValue(*entryObj));
        JS_SetProperty(aCx, jsSourcesObj, PromiseFlatCString(entry.id).get(),
                       entryVal);
      }
    }
  }

  JS::Rooted<JSObject*> additionalInfoObj(aCx, JS_NewPlainObject(aCx));
  JS::Rooted<JS::Value> jsSourcesVal(aCx, JS::ObjectValue(*jsSourcesObj));
  JS_SetProperty(aCx, additionalInfoObj, "sharedLibraries", sharedLibrariesVal);
  JS_SetProperty(aCx, additionalInfoObj, "jsSources", jsSourcesVal);
  aRetVal.setObject(*additionalInfoObj);
}

namespace IPC {

DEFINE_IPC_SERIALIZER_WITH_FIELDS(SharedLibrary, mStart, mEnd, mOffset,
                                  mBreakpadId, mCodeId, mModuleName,
                                  mModulePath, mDebugName, mDebugPath, mVersion,
                                  mArch);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(SharedLibraryInfo, mEntries);

DECLARE_IPC_SERIALIZER(ProfilerJSSourceData);

// Type tags for ProfilerJSSourceData IPC serialization
constexpr uint8_t kSourceTextUTF16Tag = 0;
constexpr uint8_t kSourceTextUTF8Tag = 1;
constexpr uint8_t kRetrievableFileTag = 2;
constexpr uint8_t kUnavailableTag = 3;

// Bounded, overflow-safe read of a length-prefixed char buffer from an IPC
// message. The caller has already read aLength (as size_t) from the wire; this
// validates it, allocates, reads the payload, and null-terminates.
template <typename CharT>
static bool ReadSourceBuffer(
    IPC::MessageReader* aReader, size_t aLength,
    mozilla::UniquePtr<CharT[], JS::FreePolicy>* aOut) {
  constexpr size_t kMaxLength = (UINT32_MAX / sizeof(CharT)) - 1;
  if (aLength > kMaxLength) {
    return false;
  }
  uint32_t byteLen = static_cast<uint32_t>(aLength * sizeof(CharT));
  if (!aReader->HasBytesAvailable(byteLen)) {
    return false;
  }
  CharT* chars = static_cast<CharT*>(js_malloc((aLength + 1) * sizeof(CharT)));
  if (!chars) {
    return false;
  }
  if (!aReader->ReadBytesInto(chars, byteLen)) {
    js_free(chars);
    return false;
  }
  chars[aLength] = CharT(0);
  aOut->reset(chars);
  return true;
}

void IPC::ParamTraits<ProfilerJSSourceData>::Write(MessageWriter* aWriter,
                                                   const paramType& aParam) {
  // Write sourceId and filePath first
  WriteParam(aWriter, aParam.sourceId());
  WriteParam(aWriter, aParam.filePathLength());
  if (aParam.filePathLength() > 0) {
    aWriter->WriteBytes(aParam.filePath(),
                        aParam.filePathLength() * sizeof(char));
  }

  // Write startLine and startColumn.
  WriteParam(aWriter, aParam.startLine());
  WriteParam(aWriter, aParam.startColumn());

  // Write sourceMapURL
  WriteParam(aWriter, aParam.sourceMapURLLength());
  if (aParam.sourceMapURLLength() > 0) {
    aWriter->WriteBytes(aParam.sourceMapURL(),
                        aParam.sourceMapURLLength() * sizeof(char16_t));
  }

  // Then write the specific data type
  aParam.data().match(
      [&](const ProfilerJSSourceData::SourceTextUTF16& srcText) {
        WriteParam(aWriter, kSourceTextUTF16Tag);
        WriteParam(aWriter, srcText.length());
        if (srcText.length() > 0) {
          aWriter->WriteBytes(srcText.chars().get(),
                              srcText.length() * sizeof(char16_t));
        }
      },
      [&](const ProfilerJSSourceData::SourceTextUTF8& srcText) {
        WriteParam(aWriter, kSourceTextUTF8Tag);
        WriteParam(aWriter, srcText.length());
        if (srcText.length() > 0) {
          aWriter->WriteBytes(srcText.chars().get(),
                              srcText.length() * sizeof(char));
        }
      },
      [&](const ProfilerJSSourceData::RetrievableFile&) {
        WriteParam(aWriter, kRetrievableFileTag);
      },
      [&](const ProfilerJSSourceData::Unavailable&) {
        WriteParam(aWriter, kUnavailableTag);
      });
}

bool IPC::ParamTraits<ProfilerJSSourceData>::Read(MessageReader* aReader,
                                                  paramType* aResult) {
  // Read sourceId and filePath first
  uint32_t sourceId;
  size_t pathLength;
  if (!ReadParam(aReader, &sourceId) || !ReadParam(aReader, &pathLength)) {
    return false;
  }

  // Read filePath if present
  JS::UniqueChars filePath;
  if (pathLength > 0 && !ReadSourceBuffer(aReader, pathLength, &filePath)) {
    return false;
  }

  // Read startLine and startColumn.
  uint32_t startLine;
  uint32_t startColumn;
  if (!ReadParam(aReader, &startLine) || !ReadParam(aReader, &startColumn)) {
    return false;
  }

  // Read sourceMapURL if present
  size_t sourceMapURLLength;
  if (!ReadParam(aReader, &sourceMapURLLength)) {
    return false;
  }

  JS::UniqueTwoByteChars sourceMapURL;
  if (sourceMapURLLength > 0 &&
      !ReadSourceBuffer(aReader, sourceMapURLLength, &sourceMapURL)) {
    return false;
  }

  // Then read the specific data type
  uint8_t typeTag;
  if (!ReadParam(aReader, &typeTag)) {
    return false;
  }

  switch (typeTag) {
    case kSourceTextUTF16Tag: {
      size_t length;
      if (!ReadParam(aReader, &length)) {
        return false;
      }
      JS::UniqueTwoByteChars chars;
      if (length > 0 && !ReadSourceBuffer(aReader, length, &chars)) {
        return false;
      }
      *aResult = ProfilerJSSourceData(
          sourceId, std::move(chars), length, std::move(filePath), pathLength,
          startLine, startColumn, std::move(sourceMapURL), sourceMapURLLength);
      return true;
    }
    case kSourceTextUTF8Tag: {
      size_t length;
      if (!ReadParam(aReader, &length)) {
        return false;
      }
      JS::UniqueChars chars;
      if (length > 0 && !ReadSourceBuffer(aReader, length, &chars)) {
        return false;
      }
      *aResult = ProfilerJSSourceData(
          sourceId, std::move(chars), length, std::move(filePath), pathLength,
          startLine, startColumn, std::move(sourceMapURL), sourceMapURLLength);
      return true;
    }
    case kRetrievableFileTag: {
      *aResult = ProfilerJSSourceData::CreateRetrievableFile(
          sourceId, std::move(filePath), pathLength, startLine, startColumn,
          std::move(sourceMapURL), sourceMapURLLength);
      return true;
    }
    case kUnavailableTag: {
      *aResult = ProfilerJSSourceData(
          sourceId, std::move(filePath), pathLength, startLine, startColumn,
          std::move(sourceMapURL), sourceMapURLLength);
      return true;
    }
    default:
      return false;
  }
}

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::JSSourceEntry, id, sourceData);

IMPLEMENT_IPC_SERIALIZER_WITH_FIELDS(
    mozilla::ProfileGenerationAdditionalInformation, mSharedLibraries,
    mJSSourceEntries);

IMPLEMENT_IPC_SERIALIZER_WITH_FIELDS(mozilla::ProfileAndAdditionalInformation,
                                     mProfile, mAdditionalInformation);

}  // namespace IPC
