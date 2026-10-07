/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Declarative.h"

#include "js/JSON.h"
#include "mozilla/dom/dom_push_rust_generated.h"
#include "mozilla/dom/notification/NotificationUtils.h"
#include "nsNetUtil.h"

namespace mozilla::dom {

using notification::NotificationCallbacksCommon;

class DWPNotificationCallbacks final : public NotificationCallbacksCommon {
 public:
  NS_INLINE_DECL_REFCOUNTING_INHERITED(DWPNotificationCallbacks,
                                       NotificationCallbacksCommon)

  DWPNotificationCallbacks(const nsAString& aScope, nsIPrincipal* aPrincipal,
                           IPCNotification aNotification)
      : NotificationCallbacksCommon(aScope, aPrincipal, aNotification) {}

  NS_IMETHODIMP OnAlertShow() override {
    MOZ_TRY(NotificationCallbacksCommon::OnAlertShow());
    PersistNotification();
    return NS_OK;
  }

  NS_IMETHODIMP OnAlertClick(nsIAlertAction* aAction) override {
    MOZ_TRY(NotificationCallbacksCommon::OnAlertClick(aAction));
    return RespondOnClick(aAction);
  }

  NS_IMETHODIMP OnAlertClosed() override {
    MOZ_TRY(NotificationCallbacksCommon::OnAlertClosed());
    UnpersistNotification();
    return NS_OK;
  }

  NS_IMETHODIMP OnAlertFinished() override {
    MOZ_TRY(NotificationCallbacksCommon::OnAlertFinished());
    UnpersistNotification();
    return NS_OK;
  }

 private:
  virtual ~DWPNotificationCallbacks() = default;
};

static NotificationDirection ConvertNotificationDirection(
    DeclarativePushDir aDir) {
  switch (aDir) {
    case DeclarativePushDir::Ltr:
      return NotificationDirection::Ltr;
    case DeclarativePushDir::Rtl:
      return NotificationDirection::Rtl;
    case DeclarativePushDir::Auto:
      return NotificationDirection::Auto;
  }
  MOZ_CRASH("Invalid DeclarativePushDir.");
  return NotificationDirection::Auto;
}

// Convert JSON to the base 64 format outputted by nsStructuredCloneContainer.
static nsString ConvertJSONToStructuredCloneBase64(const nsAString& aJSON) {
  if (aJSON.IsEmpty()) {
    return EmptyString();
  }
  AutoJSAPI jsapi;
  if (NS_WARN_IF(!jsapi.Init(xpc::PrivilegedJunkScope()))) {
    return EmptyString();
  }
  JSContext* cx = jsapi.cx();
  RefPtr<nsStructuredCloneContainer> dataObjectContainer =
      new nsStructuredCloneContainer();
  JS::Rooted<JS::Value> jsValue(cx);
  if (NS_WARN_IF(!JS_ParseJSON(cx, aJSON.Data(), aJSON.Length(), &jsValue))) {
    return EmptyString();
  }
  if (NS_WARN_IF(NS_FAILED(dataObjectContainer->InitFromJSVal(jsValue, cx)))) {
    return EmptyString();
  }
  nsString serialized;
  if (NS_WARN_IF(NS_FAILED(dataObjectContainer->GetDataAsBase64(serialized)))) {
    return EmptyString();
  }
  return serialized;
}

static Maybe<IPCNotificationOptions> GetNotificationOptionsForDeclarativePush(
    DeclarativePushData&& aPush, nsIURI* aBaseURI) {
  IPCNotificationOptions options;
  nsresult rv = NS_NewURI(getter_AddRefs(options.navigate()), aPush.navigate,
                          nullptr, aBaseURI);
  // https://w3c.github.io/push-api/#dfn-declarative-push-message-parser
  // Step 27: If notification's navigation URL is null, then return failure.
  if (NS_FAILED(rv)) {
    return Nothing();
  }
  options.title() = std::move(aPush.title);
  options.body() = std::move(aPush.body);
  options.dir() = ConvertNotificationDirection(aPush.dir);
  options.silent() = aPush.silent;
  if (StaticPrefs::dom_webnotifications_requireinteraction_enabled()) {
    options.requireInteraction() = aPush.require_interaction;
  }
  options.tag() = std::move(aPush.tag);
  options.lang() = std::move(aPush.lang);
  options.dataSerialized() = ConvertJSONToStructuredCloneBase64(aPush.data);
  for (DeclarativePushAction& action : aPush.actions) {
    IPCNotificationAction ipcAction;
    if (NS_FAILED(NS_NewURI(getter_AddRefs(ipcAction.navigate()),
                            action.navigate, nullptr, aBaseURI))) {
      // Step 28: If the navigation URL of any notification action of
      // notification's actions is null, then return failure.
      return Nothing();
    }
    // We still need to do the check above, even if there are more
    // than kMaxActions actions. So we can't break out of the loop.
    if (options.actions().Length() < notification::kMaxActions) {
      ipcAction.title() = std::move(action.title);
      ipcAction.name() = std::move(action.action);
      options.actions().AppendElement(std::move(ipcAction));
    }
  }
  nsCOMPtr<nsIURI> icon;
  if (NS_SUCCEEDED(
          NS_NewURI(getter_AddRefs(icon), aPush.icon, nullptr, aBaseURI))) {
    options.icon() = icon.forget();
  }
  return Some(std::move(options));
}

bool ParseDeclarativePushAndShowNotification(Span<const uint8_t> aData,
                                             nsIPrincipal* aPrincipal,
                                             const nsACString& aScope) {
  DeclarativePushData declarativePush;
  if (!parse_declarative_push(aData.Elements(), aData.Length(),
                              &declarativePush)) {
    return false;
  }
  RefPtr<nsIURI> baseURI;
  if (NS_FAILED(NS_NewURI(getter_AddRefs(baseURI), aScope))) {
    return false;
  }
  Maybe<IPCNotificationOptions> options =
      GetNotificationOptionsForDeclarativePush(std::move(declarativePush),
                                               baseURI);
  if (!options) {
    return false;
  }
  RefPtr permissionPromise = notification::EnsureValidNotificationPermission(
      aPrincipal, aPrincipal, aPrincipal->GetIsOriginPotentiallyTrustworthy());
  permissionPromise->Then(
      GetCurrentSerialEventTarget(), __func__,
      [options = options.extract(), scope = NS_ConvertUTF8toUTF16(aScope),
       principal = RefPtr(aPrincipal)](
          const notification::NotificationPermissionPromise::
              ResolveOrRejectValue& aResult) {
        if (aResult.IsReject()) {
          // Don't have permission
          return;
        }
        auto result = notification::CreateAlertForNotification(
            options, *principal, Nothing());
        if (result.isErr()) {
          return;
        }
        nsCOMPtr<nsIAlertNotification> notification = result.unwrap();
        nsAutoString id;
        notification->GetId(id);
        RefPtr<DWPNotificationCallbacks> dwpCallbacks =
            new DWPNotificationCallbacks(scope, principal,
                                         IPCNotification(id, options));
        notification::ShowAlertWithCleanup(notification, dwpCallbacks);
      });
  return true;
}

}  // namespace mozilla::dom
