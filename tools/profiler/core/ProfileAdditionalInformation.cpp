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
#include "nsDirectoryServiceDefs.h"
#include "nsIFile.h"
#include "nsIFileURL.h"

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
        nsCString scheme;
        if (NS_FAILED(uri->GetScheme(scheme))) {
          return;
        }
        if (scheme.EqualsLiteral("file")) {
          nsCOMPtr<nsIFileURL> fileURL = do_QueryInterface(uri);
          if (!fileURL) {
            return;
          }
          nsCOMPtr<nsIFile> scriptFile;
          if (NS_FAILED(fileURL->GetFile(getter_AddRefs(scriptFile)))) {
            return;
          }
          nsCOMPtr<nsIFile> greDir;
          if (NS_FAILED(
                  NS_GetSpecialDirectory(NS_GRE_DIR, getter_AddRefs(greDir)))) {
            return;
          }
          bool contains = false;
          if (NS_FAILED(greDir->Contains(scriptFile, &contains)) || !contains) {
            return;
          }
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

  // Create jsSources object, which is ID to source text mapping for
  // WebChannel.
  JS::Rooted<JSObject*> jsSourcesObj(aCx, JS_NewPlainObject(aCx));
  if (jsSourcesObj) {
    for (const auto& entry : mJSSourceEntries) {
      JSString* sourceStr =
          MaybeCreateJSStringFromSourceData(aCx, entry.sourceData);
      if (sourceStr) {
        JS::Rooted<JS::Value> sourceVal(aCx, JS::StringValue(sourceStr));
        JS_SetProperty(aCx, jsSourcesObj, PromiseFlatCString(entry.id).get(),
                       sourceVal);
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

template <>
struct ParamTraits<SharedLibrary> {
  typedef SharedLibrary paramType;

  static void Write(MessageWriter* aWriter, const paramType& aParam);
  static bool Read(MessageReader* aReader, paramType* aResult);
};

template <>
struct ParamTraits<SharedLibraryInfo> {
  typedef SharedLibraryInfo paramType;

  static void Write(MessageWriter* aWriter, const paramType& aParam);
  static bool Read(MessageReader* aReader, paramType* aResult);
};

template <>
struct ParamTraits<ProfilerJSSourceData> {
  typedef ProfilerJSSourceData paramType;

  static void Write(MessageWriter* aWriter, const paramType& aParam);
  static bool Read(MessageReader* aReader, paramType* aResult);
};

template <>
struct ParamTraits<mozilla::JSSourceEntry> {
  typedef mozilla::JSSourceEntry paramType;

  static void Write(MessageWriter* aWriter, const paramType& aParam);
  static bool Read(MessageReader* aReader, paramType* aResult);
};

void IPC::ParamTraits<SharedLibrary>::Write(MessageWriter* aWriter,
                                            const paramType& aParam) {
  WriteParam(aWriter, aParam.mStart);
  WriteParam(aWriter, aParam.mEnd);
  WriteParam(aWriter, aParam.mOffset);
  WriteParam(aWriter, aParam.mBreakpadId);
  WriteParam(aWriter, aParam.mCodeId);
  WriteParam(aWriter, aParam.mModuleName);
  WriteParam(aWriter, aParam.mModulePath);
  WriteParam(aWriter, aParam.mDebugName);
  WriteParam(aWriter, aParam.mDebugPath);
  WriteParam(aWriter, aParam.mVersion);
  WriteParam(aWriter, aParam.mArch);
}

bool IPC::ParamTraits<SharedLibrary>::Read(MessageReader* aReader,
                                           paramType* aResult) {
  return ReadParam(aReader, &aResult->mStart) &&
         ReadParam(aReader, &aResult->mEnd) &&
         ReadParam(aReader, &aResult->mOffset) &&
         ReadParam(aReader, &aResult->mBreakpadId) &&
         ReadParam(aReader, &aResult->mCodeId) &&
         ReadParam(aReader, &aResult->mModuleName) &&
         ReadParam(aReader, &aResult->mModulePath) &&
         ReadParam(aReader, &aResult->mDebugName) &&
         ReadParam(aReader, &aResult->mDebugPath) &&
         ReadParam(aReader, &aResult->mVersion) &&
         ReadParam(aReader, &aResult->mArch);
}

void IPC::ParamTraits<SharedLibraryInfo>::Write(MessageWriter* aWriter,
                                                const paramType& aParam) {
  paramType& p = const_cast<paramType&>(aParam);
  WriteParam(aWriter, p.mEntries);
}

bool IPC::ParamTraits<SharedLibraryInfo>::Read(MessageReader* aReader,
                                               paramType* aResult) {
  return ReadParam(aReader, &aResult->mEntries);
}

// Type tags for ProfilerJSSourceData IPC serialization
constexpr uint8_t kSourceTextUTF16Tag = 0;
constexpr uint8_t kSourceTextUTF8Tag = 1;
constexpr uint8_t kRetrievableFileTag = 2;
constexpr uint8_t kUnavailableTag = 3;

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
  if (pathLength > 0) {
    char* chars =
        static_cast<char*>(js_malloc((pathLength + 1) * sizeof(char)));
    if (!chars || !aReader->ReadBytesInto(chars, pathLength * sizeof(char))) {
      js_free(chars);
      return false;
    }
    chars[pathLength] = '\0';
    filePath.reset(chars);
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
  if (sourceMapURLLength > 0) {
    char16_t* chars = static_cast<char16_t*>(
        js_malloc((sourceMapURLLength + 1) * sizeof(char16_t)));
    if (!chars ||
        !aReader->ReadBytesInto(chars, sourceMapURLLength * sizeof(char16_t))) {
      js_free(chars);
      return false;
    }
    chars[sourceMapURLLength] = u'\0';
    sourceMapURL.reset(chars);
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
      if (length > 0) {
        // Allocate one extra element for null terminator
        char16_t* chars =
            static_cast<char16_t*>(js_malloc((length + 1) * sizeof(char16_t)));
        if (!chars ||
            !aReader->ReadBytesInto(chars, length * sizeof(char16_t))) {
          js_free(chars);
          return false;
        }
        // Ensure null termination
        chars[length] = u'\0';
        *aResult = ProfilerJSSourceData(
            sourceId, JS::UniqueTwoByteChars(chars), length,
            std::move(filePath), pathLength, startLine, startColumn,
            std::move(sourceMapURL), sourceMapURLLength);
      } else {
        *aResult = ProfilerJSSourceData(
            sourceId, JS::UniqueTwoByteChars(), 0, std::move(filePath),
            pathLength, startLine, startColumn, std::move(sourceMapURL),
            sourceMapURLLength);
      }
      return true;
    }
    case kSourceTextUTF8Tag: {
      size_t length;
      if (!ReadParam(aReader, &length)) {
        return false;
      }
      if (length > 0) {
        // Allocate one extra byte for null terminator
        char* chars =
            static_cast<char*>(js_malloc((length + 1) * sizeof(char)));
        if (!chars || !aReader->ReadBytesInto(chars, length * sizeof(char))) {
          js_free(chars);
          return false;
        }
        // Ensure null termination
        chars[length] = '\0';
        *aResult = ProfilerJSSourceData(
            sourceId, JS::UniqueChars(chars), length, std::move(filePath),
            pathLength, startLine, startColumn, std::move(sourceMapURL),
            sourceMapURLLength);
      } else {
        *aResult = ProfilerJSSourceData(
            sourceId, JS::UniqueChars(), 0, std::move(filePath), pathLength,
            startLine, startColumn, std::move(sourceMapURL),
            sourceMapURLLength);
      }
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

void IPC::ParamTraits<mozilla::JSSourceEntry>::Write(MessageWriter* aWriter,
                                                     const paramType& aParam) {
  WriteParam(aWriter, aParam.id);
  WriteParam(aWriter, aParam.sourceData);
}

bool IPC::ParamTraits<mozilla::JSSourceEntry>::Read(MessageReader* aReader,
                                                    paramType* aResult) {
  return (ReadParam(aReader, &aResult->id) &&
          ReadParam(aReader, &aResult->sourceData));
}

void IPC::ParamTraits<mozilla::ProfileGenerationAdditionalInformation>::Write(
    MessageWriter* aWriter, const paramType& aParam) {
  WriteParam(aWriter, aParam.mSharedLibraries);
  WriteParam(aWriter, aParam.mJSSourceEntries);
}

bool IPC::ParamTraits<mozilla::ProfileGenerationAdditionalInformation>::Read(
    MessageReader* aReader, paramType* aResult) {
  if (!ReadParam(aReader, &aResult->mSharedLibraries)) {
    return false;
  }

  if (!ReadParam(aReader, &aResult->mJSSourceEntries)) {
    return false;
  }

  return true;
}

}  // namespace IPC
