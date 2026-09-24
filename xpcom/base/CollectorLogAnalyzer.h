/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_CollectorLogAnalyzer_h
#define mozilla_CollectorLogAnalyzer_h

#include <cstdarg>

#include "mozilla/Attributes.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "nsCOMPtr.h"
#include "nsISupports.h"
#include "nsISupportsImpl.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsTStringHasher.h"
#include "nsWrapperCache.h"

class nsIGlobalObject;

namespace mozilla {

namespace dom {
class Promise;
struct CollectorLogNode;
struct CollectorLogNodeAdjacents;
struct CollectorLogRootPath;
}  // namespace dom

class CollectorLogAnalyzerBackground;

class CollectorLogAnalyzer final : public nsISupports, public nsWrapperCache {
 public:
  class LogError {
   public:
    LogError(nsresult aErrorCode, const nsCString& aMsg)
        : mCode(aErrorCode), mMessage(aMsg) {}

    LogError(nsresult aErrorCode, const char* const aFmt, ...)
        MOZ_FORMAT_PRINTF(3, 4)
        : mCode(aErrorCode) {
      va_list ap;
      va_start(ap, aFmt);
      mMessage.AppendVprintf(aFmt, ap);
      va_end(ap);
    }

    static LogError WithCause(const LogError& aCause, const nsCString& aMsg) {
      LogError e(aCause.mCode, aMsg);
      e.mMessage.AppendPrintf(": %s", aCause.mMessage.get());
      return e;
    }

    static LogError WithCause(const LogError& aCause, const char* const aFmt,
                              ...) MOZ_FORMAT_PRINTF(2, 3) {
      va_list ap;
      va_start(ap, aFmt);

      LogError e(aCause.mCode, EmptyCString());
      e.mMessage.AppendVprintf(aFmt, ap);
      e.mMessage.AppendPrintf(": %s", aCause.mMessage.get());

      va_end(ap);
      return e;
    }

    nsresult Code() const { return mCode; }
    const nsCString& Message() const { return mMessage; }

   private:
    nsresult mCode;
    nsCString mMessage;
  };

  NS_DECL_CYCLE_COLLECTING_ISUPPORTS
  NS_DECL_CYCLE_COLLECTION_WRAPPERCACHE_CLASS(CollectorLogAnalyzer)

  static already_AddRefed<CollectorLogAnalyzer> Constructor(
      dom::GlobalObject& aGlobal, const nsAString& aCCLogPath,
      const nsAString& aGCLogPath);

  already_AddRefed<dom::Promise> Init(ErrorResult& aRv);
  double GetInitProgress();
  already_AddRefed<dom::Promise> QueryNodes(const nsACString& aQuery,
                                            ErrorResult& aRv);
  double GetQueryProgress();
  already_AddRefed<dom::Promise> SampleNodes(ErrorResult& aRv);
  already_AddRefed<dom::Promise> GetPathToRoot(
      const dom::CollectorLogNode& aNode, ErrorResult& aRv);
  already_AddRefed<dom::Promise> GetNodeAdjacents(
      const dom::CollectorLogNode& aNode, ErrorResult& aRv);

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;
  nsIGlobalObject* GetParentObject() const { return mGlobal; }

 private:
  CollectorLogAnalyzer(nsIGlobalObject* aGlobal, const nsAString& aCCLogPath,
                       const nsAString& aGCLogPath);
  ~CollectorLogAnalyzer() = default;

  template <typename OkT, typename Fn>
  already_AddRefed<dom::Promise> DispatchToBackground(ErrorResult& aError,
                                                      Fn aFunc);

  nsCOMPtr<nsIGlobalObject> mGlobal;
  RefPtr<CollectorLogAnalyzerBackground> mBackground;
  nsString mCCLogPath;
  nsString mGCLogPath;
  nsCOMPtr<nsISerialEventTarget> mBackgroundEventTarget;
};

}  // namespace mozilla

#endif  // mozilla_CollectorLogAnalyzer_h
