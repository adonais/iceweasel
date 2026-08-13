/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "WebCustomFormatUtils.h"

#include "js/JSON.h"
#include "mozilla/JSONStringWriteFuncs.h"
#include "mozilla/JSONWriter.h"
#include "mozilla/Logging.h"

static mozilla::LazyLogModule gWebCustomFormatLog("WebCustomFormat");

#ifdef LOG
#  undef LOG
#endif
#define LOG(...) \
  MOZ_LOG(gWebCustomFormatLog, mozilla::LogLevel::Debug, (__VA_ARGS__))

namespace mozilla::widget {

void WebCustomFormatMapToJSON(const WebCustomFormatMap& aWebCustomFormatMap,
                              nsACString& aResult) {
  JSONStringWriteFunc<nsAutoCString> data;
  JSONWriter writer(data, JSONWriter::CollectionStyle::SingleLineStyle);
  const auto& flavors = aWebCustomFormatMap.Keys();
  writer.Start();
  for (const auto& flavor : flavors) {
    writer.StringProperty(flavor, aWebCustomFormatMap.Lookup(flavor).Data());
  }
  writer.End();
  aResult = std::move(data).StringRRef();
}

namespace {

class WebCustomFormatMapJSONHandler final : public JS::JSONParseHandler {
 public:
  bool propertyName(const JS::Latin1Char* name, size_t length) override {
    mCurrentProperty =
        nsDependentCSubstring(reinterpret_cast<const char*>(name), length);
    return true;
  }

  bool stringValue(const JS::Latin1Char* str, size_t length) override {
    nsAutoCString value(reinterpret_cast<const char*>(str), length);
    if (!mResult.WithEntryHandle(mCurrentProperty, [&value](auto&& entry) {
          if (entry.HasEntry()) {
            return false;
          }
          entry.Insert(std::move(value));
          return true;
        })) {
      LOG("%s: web custom format %s exists", __FUNCTION__,
          mCurrentProperty.get());
    }
    return true;
  }

  // WebCustomFormatMap only handles UTF8 encoded property and string value
  bool propertyName(const char16_t* name, size_t length) override {
    return false;
  }

  bool stringValue(const char16_t* str, size_t length) override {
    return false;
  }

  bool startObject() override {
    if (mStartTopLevelObject) {
      return false;
    }
    mStartTopLevelObject = true;
    return true;
  }

  bool endObject() override { return mStartTopLevelObject; }

  bool startArray() override { return false; }

  bool endArray() override { return false; }

  bool numberValue(double d) override { return false; }

  bool booleanValue(bool v) override { return false; }

  bool nullValue() override { return false; }

  void error(const char* msg, uint32_t line, uint32_t column) override {}

  explicit WebCustomFormatMapJSONHandler(WebCustomFormatMap& aResult)
      : mResult(aResult) {}

 private:
  nsCString mCurrentProperty;
  bool mStartTopLevelObject{false};
  WebCustomFormatMap& mResult;
};

}  // namespace

bool JSONToWebCustomFormatMap(const nsACString& aJSON,
                              WebCustomFormatMap& aResult) {
  // Parse into a local map first so the caller's map is only mutated on
  // success.
  const nsPromiseFlatCString flatJSON(aJSON);
  WebCustomFormatMap parsed;
  WebCustomFormatMapJSONHandler handler(parsed);
  if (!JS::ParseJSONWithHandler(
          reinterpret_cast<const JS::Latin1Char*>(flatJSON.get()),
          flatJSON.Length(), &handler)) {
    LOG("Fail to parse JSON string data: %s to WebCustomFormatMap",
        flatJSON.get());
    return false;
  }
  aResult = std::move(parsed);
  return true;
}

}  // namespace mozilla::widget
