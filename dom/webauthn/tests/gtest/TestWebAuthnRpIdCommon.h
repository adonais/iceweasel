/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_TestWebAuthnRpIdCommon_h
#define mozilla_dom_TestWebAuthnRpIdCommon_h

namespace mozilla::dom {

struct RpIdTestCase {
  const char* originOrMatchPattern;
  const char* rpId;
  bool expectSuccess;
};

// When WebAuthn is used from a web origin, the WebAuthn spec says that:
// <https://w3c.github.io/webauthn/#relying-party-identifier>
//  (1) The RP ID must be equal to the origin's effective domain, or a
//  registrable
//      domain suffix of the origin's effective domain.
//  (2) One of the following must be true:
//      * The origin's scheme is https.
//      * The origin's host is localhost and its scheme is http.
//
//  On the web, Firefox relaxes condition (2) to permit http://<domain> where
//  <domain> is on the secure context allowlist (as configured by
//  dom.securecontext.allowlist or dom.securecontext.allowlist_onions).
//
// clang-format off
const RpIdTestCase kOriginRpIdTestCases[] = {
    {
        "https://example.com/",
        "example.com",
        true,
    },
    {
        "https://example.com/",
        "EXAMPLE.COM",
        false,  // not normalized
    },
    {
        "https://example.com/",
        "example.com.",
        false,  // trailing dot
    },
    {
        "https://example.com/",
        "subdomain.example.com",
        false,
    },
    {
        "https://a.b.c.example.com/",
        "c.example.com",
        true,
    },
    {
        "https://a.b.c.example.com/",
        "b.c.example.com",
        true,
    },
    {
        "https://a.b.c.example.com/",
        "a.b.c.example.com",
        true,
    },
    {
        "https://example.com/",
        "com",
        false,
    },
    {
        "https://example.co.uk",
        "co.uk",
        false,
    },
    {
        "https://example.com/",
        "",
        false,
    },
    {
        "https://com/",
        "com",
        false,  // entries on the PSL are not allowed
    },
    {
        "https://127.0.0.1/",
        "127.0.0.1",
        false,
    },
    {
        "http://localhost/",
        "localhost",
        true,
    },
    {
        "https://subdomain.localhost/",
        "subdomain.localhost",
        true,
    },
    {
        "https://subdomain.localhost/",
        "localhost",
        false,
    },
    {
        "http://allowlisted-subdomain.notatld/",
        "notatld",
        false,
    },
    {
        "http://allowlisted-subdomain.example.com/",
        "com",
        false,
    },
    {
        "http://not-an-allowlisted-secure-context.com/",
        "not-an-allowlisted-secure-context.com",
        false,
    },
};
// clang-format on

// The following test cases exercise the relaxation of condition (2) for web
// origins. Firefox allows WebAuthn from http:// origins that are secure
// contexts via the allowlist (dom.securecontext.allowlist) or .onion domains
// (dom.securecontext.allowlist_onions). Extensions do not get these relaxations
// for http:// origins; only loopback is allowed.
//
// clang-format off
static const RpIdTestCase kWebOriginOnlyRpIdTestCases[] = {
    {
        "http://allowlisted-secure-context.com/",
        "allowlisted-secure-context.com",
        true,
    },
    {
        "http://allowlisted-subdomain.example.com/",
        "example.com",
        true,
    },
    {
        "http://example.onion/",
        "example.onion",
        true,  // assumes dom.securecontext.allowlist_onions is true
    },
    {
        "http://subdomain.example.onion/",
        "example.onion",
        true,  // assumes dom.securecontext.allowlist_onions is true
    },
    {
        "https://maybetld/",
        "maybetld",
        true,
    },
    {
        "https://maybetld./",
        "maybetld.",
        true,
    },
};
// clang-format on

// When WebAuthn is used from a web extension in Firefox, the effective origin
// is moz-extension://extension-id and there are no valid RP IDs by the above
// rules.
//
// As a non-standard extension of the spec, Chromium allows a web extension to
// claim an RP ID based on its host permissions
// <https://lists.w3.org/Archives/Public/public-webauthn/2023Dec/0078.html>
// This is reasonable given that an extension with host permissions for an
// origin could script a page to create/assert WebAuthn credentials with RP IDs
// that are valid for that origin.
//
// Since Bug 1956484, Firefox also allows web extensions to claim RP IDs based
// on their host permissions. An extension can claim <domain> or any registrable
// suffix of <domain> as an RP ID if
//  (1) the extension has host permissions for https://<domain>, or
//  (2) the extension has host permissions for http://<domain> and <domain>
//      is a loopback hostname.
//
// Firefox does not currently allow extensions to claim
// "moz-extension://extension-id" as an RP ID.
//
// clang-format off
static const RpIdTestCase kMatchPatternRpIdTestCases[] = {
    {
        "<all_urls>",
        "example.com",
        true,
    },
    {
        "<all_urls>",
        "localhost",
        true,
    },
    {
        "<all_urls>",
        "com",
        false,  // PSL entry
    },
    {
        "<all_urls>",
        "co.uk",
        false,  // multi-level PSL entry
    },
    {
        "<all_urls>",
        "github.io",
        false,  // special PSL entry
    },
    {
        "<all_urls>",
        "moz-extension://id",
        false,
    },
    {
        "https://*.com/",
        "example.com",
        true,
    },
    {
        "https://*.example.com/",
        "example.com",
        true,
    },
    {
        "https://*.subdomain.example.com/",
        "example.com",
        true,
    },
    {
        "http://*.localhost/",
        "localhost",
        true,
    },
    {
        "http://*.allowlisted-secure-context.com/",
        "allowlisted-secure-context.com",
        false,  // extensions only allow http:// for loopback, not allowlisted origins
    },
    {
        "https://*.example.onion/",
        "example.onion",
        true,
    },
    {
        "http://*.example.onion/",
        "example.onion",
        false,  // extensions only allow http:// for loopback, not .onion
    },
    {
        "https://maybetld/",
        "maybetld",
        false,
    },
    {
        "https://maybetld./",
        "maybetld.",
        false,
    },
};
// clang-format on

}  // namespace mozilla::dom

#endif  // mozilla_dom_TestWebAuthnRpIdCommon_h
