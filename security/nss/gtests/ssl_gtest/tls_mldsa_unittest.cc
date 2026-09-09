/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "secoidt.h"
#include "ssl.h"
#include "sslerr.h"
#include "sslproto.h"

#include "gtest_utils.h"
#include "nss_scoped_ptrs.h"
#include "tls_connect.h"
#include "tls_filter.h"
#include "tls_parser.h"

namespace nss_test {

// A bare list of 2-byte SignatureScheme codepoints.
static std::vector<SSLSignatureScheme> ParseSchemeList(const DataBuffer& list) {
  std::vector<SSLSignatureScheme> schemes;
  TlsParser parser(list);
  while (parser.remaining()) {
    uint32_t scheme = 0;
    EXPECT_TRUE(parser.Read(&scheme, 2));
    schemes.push_back(static_cast<SSLSignatureScheme>(scheme));
  }
  return schemes;
}

// The signature_algorithms extension is a 2-byte length followed by the list.
static std::vector<SSLSignatureScheme> GetSignatureSchemes(
    const DataBuffer& extension) {
  TlsParser parser(extension);
  DataBuffer list;
  EXPECT_TRUE(parser.ReadVariable(&list, 2));
  EXPECT_EQ(0U, parser.remaining());
  return ParseSchemeList(list);
}

static bool HasScheme(const std::vector<SSLSignatureScheme>& schemes,
                      SSLSignatureScheme scheme) {
  return std::find(schemes.begin(), schemes.end(), scheme) != schemes.end();
}

// Every ML-DSA parameter set is a distinct auth type, so that the server can
// pick the certificate that matches the scheme the client asked for.
TEST_P(TlsConnectTls13, MlDsa44Connect) {
  Reset(TlsAgent::kServerMlDsa44);
  Connect();
  CheckKeys(ssl_auth_mldsa44, ssl_sig_mldsa44);
}

TEST_P(TlsConnectTls13, MlDsa65Connect) {
  Reset(TlsAgent::kServerMlDsa65);
  Connect();
  CheckKeys(ssl_auth_mldsa65, ssl_sig_mldsa65);
}

TEST_P(TlsConnectTls13, MlDsa87Connect) {
  Reset(TlsAgent::kServerMlDsa87);
  Connect();
  CheckKeys(ssl_auth_mldsa87, ssl_sig_mldsa87);
}

// All three parameter sets are offered by default in TLS 1.3.
TEST_P(TlsConnectTls13, MlDsaAdvertisedByDefault) {
  auto sig_algs =
      MakeTlsFilter<TlsExtensionCapture>(client_, ssl_signature_algorithms_xtn);
  Connect();

  ASSERT_TRUE(sig_algs->captured());
  auto schemes = GetSignatureSchemes(sig_algs->extension());
  EXPECT_TRUE(HasScheme(schemes, ssl_sig_mldsa44));
  EXPECT_TRUE(HasScheme(schemes, ssl_sig_mldsa65));
  EXPECT_TRUE(HasScheme(schemes, ssl_sig_mldsa87));
}

// ML-DSA is TLS 1.3 and later only, so a client that cannot negotiate TLS 1.3
// must not offer it. This exercises the maxVersion argument that was threaded
// through ssl3_EncodeSigAlgs()/ssl3_FilterSigAlgs().
TEST_P(TlsConnectTls12Plus, MlDsaAdvertisedOnlyForTls13) {
  auto sig_algs =
      MakeTlsFilter<TlsExtensionCapture>(client_, ssl_signature_algorithms_xtn);
  Connect();

  ASSERT_TRUE(sig_algs->captured());
  auto schemes = GetSignatureSchemes(sig_algs->extension());
  bool expected = version_ >= SSL_LIBRARY_VERSION_TLS_1_3;
  EXPECT_EQ(expected, HasScheme(schemes, ssl_sig_mldsa44));
  EXPECT_EQ(expected, HasScheme(schemes, ssl_sig_mldsa65));
  EXPECT_EQ(expected, HasScheme(schemes, ssl_sig_mldsa87));
}

// The same filtering applies to the server's CertificateRequest, which is
// encoded with forCert = PR_TRUE. In TLS 1.3 that list is an extension.
TEST_P(TlsConnectTls13, MlDsaInTls13CertificateRequest) {
  client_->SetupClientAuth();
  server_->RequestClientAuth(true);

  auto cr =
      MakeTlsFilter<TlsExtensionCapture>(server_, ssl_signature_algorithms_xtn);
  cr->SetHandshakeTypes({kTlsHandshakeCertificateRequest});
  cr->EnableDecryption();
  Connect();
  ASSERT_TRUE(cr->captured());

  auto schemes = GetSignatureSchemes(cr->extension());
  EXPECT_TRUE(HasScheme(schemes, ssl_sig_mldsa44));
  EXPECT_TRUE(HasScheme(schemes, ssl_sig_mldsa65));
  EXPECT_TRUE(HasScheme(schemes, ssl_sig_mldsa87));
}

// In TLS 1.2 the list lives in the CertificateRequest body, and must not
// mention ML-DSA.
TEST_P(TlsConnectTls12, MlDsaNotInTls12CertificateRequest) {
  client_->SetupClientAuth();
  server_->RequestClientAuth(true);

  auto cr = MakeTlsFilter<TlsHandshakeRecorder>(
      server_, kTlsHandshakeCertificateRequest);
  Connect();
  ASSERT_LT(0U, cr->buffer().len());

  TlsParser parser(cr->buffer());
  ASSERT_TRUE(parser.SkipVariable(1));  // certificate_types
  DataBuffer list;
  ASSERT_TRUE(parser.ReadVariable(&list, 2));  // supported_signature_algorithms
  ASSERT_LT(0U, list.len());

  auto schemes = ParseSchemeList(list);
  EXPECT_FALSE(HasScheme(schemes, ssl_sig_mldsa44));
  EXPECT_FALSE(HasScheme(schemes, ssl_sig_mldsa65));
  EXPECT_FALSE(HasScheme(schemes, ssl_sig_mldsa87));
  // Sanity check that we parsed a real list rather than garbage.
  EXPECT_TRUE(HasScheme(schemes, ssl_sig_rsa_pss_rsae_sha256));
}

// A server that only holds an ML-DSA certificate cannot authenticate at all
// below TLS 1.3.
TEST_F(TlsConnectStreamTls13, MlDsaCertUnusableInTls12) {
  Reset(TlsAgent::kServerMlDsa44);
  client_->SetVersionRange(SSL_LIBRARY_VERSION_TLS_1_2,
                           SSL_LIBRARY_VERSION_TLS_1_2);
  server_->SetVersionRange(SSL_LIBRARY_VERSION_TLS_1_2,
                           SSL_LIBRARY_VERSION_TLS_1_2);
  ConnectExpectAlert(server_, kTlsAlertHandshakeFailure);
  server_->CheckErrorCode(SSL_ERROR_NO_CYPHER_OVERLAP);
  client_->CheckErrorCode(SSL_ERROR_NO_CYPHER_OVERLAP);
}

// Restricting both peers to a single parameter set still works, and picks the
// matching certificate.
TEST_P(TlsConnectTls13, MlDsa65Only) {
  Reset(TlsAgent::kServerMlDsa65);
  static const SSLSignatureScheme kSchemes[] = {ssl_sig_mldsa65};
  client_->SetSignatureSchemes(kSchemes, PR_ARRAY_SIZE(kSchemes));
  server_->SetSignatureSchemes(kSchemes, PR_ARRAY_SIZE(kSchemes));
  Connect();
  CheckKeys(ssl_auth_mldsa65, ssl_sig_mldsa65);
}

// A client that only accepts ML-DSA-44 must not accept an ML-DSA-87
// certificate; the parameter sets are not interchangeable.
TEST_P(TlsConnectTls13, MlDsaParameterSetMismatch) {
  Reset(TlsAgent::kServerMlDsa87);
  static const SSLSignatureScheme kSchemes[] = {ssl_sig_mldsa44};
  client_->SetSignatureSchemes(kSchemes, PR_ARRAY_SIZE(kSchemes));
  ConnectExpectAlert(server_, kTlsAlertHandshakeFailure);
  server_->CheckErrorCode(SSL_ERROR_UNSUPPORTED_SIGNATURE_ALGORITHM);
}

// Policy gates each parameter set separately, via its own OID.
TEST_P(TlsConnectTls13, MlDsa44ClientDisabledByPolicy) {
  Reset(TlsAgent::kServerMlDsa44);
  client_->SetPolicy(SEC_OID_ML_DSA_44, 0, NSS_USE_ALG_IN_SSL_KX);
  ConnectExpectAlert(server_, kTlsAlertHandshakeFailure);
  server_->CheckErrorCode(SSL_ERROR_UNSUPPORTED_SIGNATURE_ALGORITHM);
}

TEST_P(TlsConnectTls13, MlDsa44ServerDisabledByPolicy) {
  Reset(TlsAgent::kServerMlDsa44);
  server_->SetPolicy(SEC_OID_ML_DSA_44, 0, NSS_USE_ALG_IN_SSL_KX);
  ConnectExpectAlert(server_, kTlsAlertHandshakeFailure);
}

// Disabling one parameter set leaves the others alone.
TEST_P(TlsConnectTls13, MlDsa44DisabledByPolicyDoesNotAffectMlDsa87) {
  Reset(TlsAgent::kServerMlDsa87);
  client_->SetPolicy(SEC_OID_ML_DSA_44, 0, NSS_USE_ALG_IN_SSL_KX);

  auto sig_algs =
      MakeTlsFilter<TlsExtensionCapture>(client_, ssl_signature_algorithms_xtn);
  Connect();
  CheckKeys(ssl_auth_mldsa87, ssl_sig_mldsa87);

  ASSERT_TRUE(sig_algs->captured());
  auto schemes = GetSignatureSchemes(sig_algs->extension());
  EXPECT_FALSE(HasScheme(schemes, ssl_sig_mldsa44));
  EXPECT_TRUE(HasScheme(schemes, ssl_sig_mldsa65));
  EXPECT_TRUE(HasScheme(schemes, ssl_sig_mldsa87));
}

// Client authentication with an ML-DSA certificate.
TEST_F(TlsConnectStreamTls13, MlDsaClientAuth) {
  Reset(TlsAgent::kServerMlDsa65, TlsAgent::kServerMlDsa44);
  client_->SetupClientAuth();
  server_->RequestClientAuth(true);
  Connect();
  CheckKeys(ssl_auth_mldsa65, ssl_sig_mldsa65);
}

// Adding the three ML-DSA schemes must not push the number of supported
// schemes past MAX_SIGNATURE_SCHEMES, or SSL_SignatureSchemePrefSet() starts
// rejecting the full set.
TEST_F(TlsConnectStreamTls13, AllSupportedSignatureSchemesAccepted) {
  static const SSLSignatureScheme kAllSchemes[] = {
      ssl_sig_rsa_pkcs1_sha1,
      ssl_sig_rsa_pkcs1_sha256,
      ssl_sig_rsa_pkcs1_sha384,
      ssl_sig_rsa_pkcs1_sha512,
      ssl_sig_ecdsa_sha1,
      ssl_sig_ecdsa_secp256r1_sha256,
      ssl_sig_ecdsa_secp384r1_sha384,
      ssl_sig_ecdsa_secp521r1_sha512,
      ssl_sig_rsa_pss_rsae_sha256,
      ssl_sig_rsa_pss_rsae_sha384,
      ssl_sig_rsa_pss_rsae_sha512,
      ssl_sig_rsa_pss_pss_sha256,
      ssl_sig_rsa_pss_pss_sha384,
      ssl_sig_rsa_pss_pss_sha512,
      ssl_sig_dsa_sha1,
      ssl_sig_dsa_sha256,
      ssl_sig_dsa_sha384,
      ssl_sig_dsa_sha512,
      ssl_sig_mldsa44,
      ssl_sig_mldsa65,
      ssl_sig_mldsa87,
  };
  EXPECT_LE(PR_ARRAY_SIZE(kAllSchemes), SSL_SignatureMaxCount());

  EnsureTlsSetup();
  EXPECT_EQ(SECSuccess,
            SSL_SignatureSchemePrefSet(client_->ssl_fd(), kAllSchemes,
                                       PR_ARRAY_SIZE(kAllSchemes)));
  EXPECT_EQ(SECSuccess,
            SSL_SignatureSchemePrefSet(server_->ssl_fd(), kAllSchemes,
                                       PR_ARRAY_SIZE(kAllSchemes)));
}

}  // namespace nss_test
