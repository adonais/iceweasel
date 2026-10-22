/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "IPCClientCertsParent.h"

#include "ScopedNSSTypes.h"
#include "mozilla/SyncRunnable.h"
#include "nsNSSComponent.h"
#include "nsNSSIOLayer.h"
#include "nsNetCID.h"

namespace mozilla::psm {

IPCClientCertsParent::IPCClientCertsParent() = default;

// When the IPC client certs module needs to find certificate and key objects
// in the socket process, it will cause this function to be called in the
// parent process. The parent process needs to find all certificates with
// private keys (because these are potential client certificates).
mozilla::ipc::IPCResult IPCClientCertsParent::RecvFindObjects(
    nsTArray<IPCClientCertObject>* aObjects) {
  nsCOMPtr<nsIEventTarget> socketThread(
      do_GetService(NS_SOCKETTRANSPORTSERVICE_CONTRACTID));
  if (!socketThread) {
    return IPC_OK();
  }
  // Look for client certificates on the socket thread.
  UniqueCERTCertList certList;
  mozilla::SyncRunnable::DispatchToThread(
      socketThread, NS_NewRunnableFunction(
                        "IPCClientCertsParent::RecvFindObjects", [&certList]() {
                          certList =
                              psm::FindClientCertificatesWithPrivateKeys();
                        }));
  if (!certList) {
    return IPC_OK();
  }
  CERTCertListNode* n = CERT_LIST_HEAD(certList);
  while (!CERT_LIST_END(n, certList)) {
    nsTArray<uint8_t> certDER(n->cert->derCert.data, n->cert->derCert.len);
    UniqueSECKEYPublicKey pubkey(CERT_ExtractPublicKey(n->cert));
    if (!pubkey) {
      return IPC_OK();
    }
    switch (SECKEY_GetPublicKeyType(pubkey.get())) {
      case rsaKey:
      case rsaPssKey: {
        nsTArray<uint8_t> modulus(pubkey->u.rsa.modulus.data,
                                  pubkey->u.rsa.modulus.len);
        RSAKey rsakey(modulus, certDER);
        aObjects->AppendElement(std::move(rsakey));
        break;
      }
      case ecKey: {
        nsTArray<uint8_t> params(pubkey->u.ec.DEREncodedParams.data,
                                 pubkey->u.ec.DEREncodedParams.len);
        ECKey eckey(params, certDER);
        aObjects->AppendElement(std::move(eckey));
        break;
      }
      default:
        n = CERT_LIST_NEXT(n);
        continue;
    }
    Certificate cert(certDER, false);
    aObjects->AppendElement(std::move(cert));

    n = CERT_LIST_NEXT(n);
  }
  return IPC_OK();
}

// When the IPC client certs module needs to sign data using a key managed by
// the parent process, it will cause this function to be called in the parent
// process. The parent process needs to find the key corresponding to the
// given certificate and sign the given data with the given parameters.
mozilla::ipc::IPCResult IPCClientCertsParent::RecvSign(ByteArray aCert,
                                                       ByteArray aData,
                                                       ByteArray aParams,
                                                       ByteArray* aSignature) {
  aSignature->data().Clear();
  nsTArray<uint8_t> signature;
  SignDataGivenCertificate(aCert.data(), aData.data(), aParams.data(),
                           signature, nullptr);
  aSignature->data().Assign(signature);
  return IPC_OK();
}

void SignDataGivenCertificate(const nsTArray<uint8_t>& certificate,
                              const nsTArray<uint8_t>& data,
                              const nsTArray<uint8_t>& params,
                              nsTArray<uint8_t>& signature, void* ctx) {
  signature.Clear();
  SECItem certItem = {siBuffer, const_cast<uint8_t*>(certificate.Elements()),
                      static_cast<unsigned int>(certificate.Length())};
  UniqueCERTCertificate cert(CERT_NewTempCertificate(
      CERT_GetDefaultCertDB(), &certItem, nullptr, false, true));
  if (!cert) {
    return;
  }
  UniqueSECKEYPrivateKey key(PK11_FindKeyByAnyCert(cert.get(), ctx));
  if (!key) {
    return;
  }
  SECItem hashItem = {siBuffer, const_cast<uint8_t*>(data.Elements()),
                      static_cast<unsigned int>(data.Length())};
  SECItem paramsItem = {siBuffer, const_cast<uint8_t*>(params.Elements()),
                        static_cast<unsigned int>(params.Length())};
  SECItem* paramsPtr = params.Length() > 0 ? &paramsItem : nullptr;
  CK_MECHANISM_TYPE mechanism;
  switch (key->keyType) {
    case ecKey:
      mechanism = CKM_ECDSA;
      break;
    case rsaKey:
      // If we have params, this is RSA-PSS.
      if (params.Length() > 0) {
        mechanism = CKM_RSA_PKCS_PSS;
      } else {
        // If this is a DigestInfo or a TLS 1.0 MD5/SHA1 hash, this is RSA-PKCS.
        // Otherwise, this is an emsa-pss-encoded digest that should be signed
        // with raw RSA.
        UniqueSGNDigestInfo digestInfo(SGN_DecodeDigestInfo(&hashItem));
        if (digestInfo || data.Length() == 36) {
          mechanism = CKM_RSA_PKCS;
        } else {
          mechanism = CKM_RSA_X_509;
        }
      }
      break;
    default:
      return;
  }
  uint32_t len = PK11_SignatureLen(key.get());
  UniqueSECItem sig(::SECITEM_AllocItem(nullptr, nullptr, len));
  SECStatus srv = PK11_SignWithMechanism(key.get(), mechanism, paramsPtr,
                                         sig.get(), &hashItem);
  if (srv != SECSuccess) {
    return;
  }
  signature.AppendElements(sig->data, sig->len);
}

}  // namespace mozilla::psm
