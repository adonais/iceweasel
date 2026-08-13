/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_identitycredentialserializationhelpers_h_
#define mozilla_dom_identitycredentialserializationhelpers_h_

#include "mozilla/dom/BindingIPCUtils.h"
#include "mozilla/dom/CredentialManagementBinding.h"
#include "mozilla/dom/IdentityCredential.h"
#include "mozilla/dom/IdentityCredentialBinding.h"
#include "mozilla/dom/LoginStatusBinding.h"

namespace IPC {

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::IdentityProviderConfig,
                                  mConfigURL, mClientId);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::IdentityProviderRequestOptions,
                                  mConfigURL, mClientId, mNonce, mLoginHint,
                                  mDomainHint);

DEFINE_IPC_SERIALIZER_WITH_FIELDS(
    mozilla::dom::IdentityCredentialDisconnectOptions, mConfigURL, mClientId,
    mAccountHint);

template <>
struct ParamTraits<mozilla::dom::CredentialMediationRequirement>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::CredentialMediationRequirement> {};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(
    mozilla::dom::IdentityCredentialRequestOptions, mProviders, mMode);

template <>
struct ParamTraits<mozilla::dom::LoginStatus>
    : public mozilla::dom::WebIDLEnumSerializer<mozilla::dom::LoginStatus> {};

template <>
struct ParamTraits<mozilla::dom::IdentityCredentialRequestOptionsMode>
    : public mozilla::dom::WebIDLEnumSerializer<
          mozilla::dom::IdentityCredentialRequestOptionsMode> {};

DEFINE_IPC_SERIALIZER_WITH_FIELDS(mozilla::dom::IdentityResolveOptions,
                                  mAccountId);

}  // namespace IPC

#endif  // mozilla_dom_identitycredentialserializationhelpers_h_
