/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DEV_H
#include "dev.h"
#endif /* DEV_H */

#ifndef PKIM_H
#include "pkim.h"
#endif /* PKIM_H */

#ifndef PKISTORE_H
#include "pkistore.h"
#endif /* PKISTORE_H */

extern const NSSError NSS_ERROR_INVALID_ARGUMENT;

NSS_IMPLEMENT NSSCryptoContext *
nssCryptoContext_Create(
    NSSTrustDomain *td,
    NSSCallback *uhhOpt)
{
    NSSArena *arena;
    NSSCryptoContext *rvCC;
    arena = NSSArena_Create();
    if (!arena) {
        return NULL;
    }
    rvCC = nss_ZNEW(arena, NSSCryptoContext);
    if (!rvCC) {
        return NULL;
    }
    rvCC->td = td;
    rvCC->arena = arena;
    rvCC->certStore = nssCertificateStore_Create(rvCC->arena);
    if (!rvCC->certStore) {
        nssArena_Destroy(arena);
        return NULL;
    }

    return rvCC;
}

NSS_IMPLEMENT PRStatus
NSSCryptoContext_Destroy(NSSCryptoContext *cc)
{
    PRStatus status = PR_SUCCESS;
    PORT_Assert(cc && cc->certStore);
    if (!cc) {
        return PR_FAILURE;
    }
    if (cc->certStore) {
        status = nssCertificateStore_Destroy(cc->certStore);
        if (status == PR_FAILURE) {
            return status;
        }
    } else {
        status = PR_FAILURE;
    }
    nssArena_Destroy(cc->arena);
    return status;
}

NSS_IMPLEMENT NSSCertificate *
NSSCryptoContext_FindOrImportCertificate(
    NSSCryptoContext *cc,
    NSSCertificate *c)
{
    NSSCertificate *rvCert = NULL;

    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        nss_SetError(NSS_ERROR_INVALID_ARGUMENT);
        return rvCert;
    }
    rvCert = nssCertificateStore_FindOrAdd(cc->certStore, c);
    nssPKIObject_Lock(&c->object);
    if (rvCert == c && c->object.cryptoContext != cc) {
        PORT_Assert(!c->object.cryptoContext);
        c->object.cryptoContext = cc;
    }
    nssPKIObject_Unlock(&c->object);
    return rvCert;
}

NSS_IMPLEMENT PRStatus
nssCryptoContext_ImportTrust(
    NSSCryptoContext *cc,
    NSSTrust *trust)
{
    PRStatus nssrv;
    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        return PR_FAILURE;
    }
    nssrv = nssCertificateStore_AddTrust(cc->certStore, trust);
    return nssrv;
}

NSS_IMPLEMENT PRStatus
nssCryptoContext_ImportSMIMEProfile(
    NSSCryptoContext *cc,
    nssSMIMEProfile *profile)
{
    PRStatus nssrv;
    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        return PR_FAILURE;
    }
    nssrv = nssCertificateStore_AddSMIMEProfile(cc->certStore, profile);
    return nssrv;
}

NSS_IMPLEMENT NSSCertificate *
NSSCryptoContext_FindBestCertificateByNickname(
    NSSCryptoContext *cc,
    const NSSUTF8 *name,
    NSSTime *timeOpt, /* NULL for "now" */
    NSSUsage *usage,
    NSSPolicies *policiesOpt /* NULL for none */
)
{
    NSSCertificate **certs;
    NSSCertificate *rvCert = NULL;
    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        return NULL;
    }
    certs = nssCertificateStore_FindCertificatesByNickname(cc->certStore,
                                                           name,
                                                           NULL, 0, NULL);
    if (certs) {
        rvCert = nssCertificateArray_FindBestCertificate(certs,
                                                         timeOpt,
                                                         usage,
                                                         policiesOpt);
        nssCertificateArray_Destroy(certs);
    }
    return rvCert;
}

NSS_IMPLEMENT NSSCertificate *
NSSCryptoContext_FindCertificateByIssuerAndSerialNumber(
    NSSCryptoContext *cc,
    NSSDER *issuer,
    NSSDER *serialNumber)
{
    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        return NULL;
    }
    return nssCertificateStore_FindCertificateByIssuerAndSerialNumber(
        cc->certStore,
        issuer,
        serialNumber);
}

NSS_IMPLEMENT NSSCertificate *
NSSCryptoContext_FindBestCertificateBySubject(
    NSSCryptoContext *cc,
    NSSDER *subject,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt)
{
    NSSCertificate **certs;
    NSSCertificate *rvCert = NULL;
    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        return NULL;
    }
    certs = nssCertificateStore_FindCertificatesBySubject(cc->certStore,
                                                          subject,
                                                          NULL, 0, NULL);
    if (certs) {
        rvCert = nssCertificateArray_FindBestCertificate(certs,
                                                         timeOpt,
                                                         usage,
                                                         policiesOpt);
        nssCertificateArray_Destroy(certs);
    }
    return rvCert;
}

NSS_IMPLEMENT NSSCertificate **
nssCryptoContext_FindCertificatesBySubject(
    NSSCryptoContext *cc,
    NSSDER *subject,
    NSSCertificate *rvOpt[],
    PRUint32 maximumOpt, /* 0 for no max */
    NSSArena *arenaOpt)
{
    NSSCertificate **rvCerts;
    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        return NULL;
    }
    rvCerts = nssCertificateStore_FindCertificatesBySubject(cc->certStore,
                                                            subject,
                                                            rvOpt,
                                                            maximumOpt,
                                                            arenaOpt);
    return rvCerts;
}

NSS_IMPLEMENT NSSCertificate **
NSSCryptoContext_FindCertificatesBySubject(
    NSSCryptoContext *cc,
    NSSDER *subject,
    NSSCertificate *rvOpt[],
    PRUint32 maximumOpt, /* 0 for no max */
    NSSArena *arenaOpt)
{
    return nssCryptoContext_FindCertificatesBySubject(cc, subject,
                                                      rvOpt, maximumOpt,
                                                      arenaOpt);
}

NSS_IMPLEMENT NSSCertificate *
NSSCryptoContext_FindCertificateByEncodedCertificate(
    NSSCryptoContext *cc,
    NSSBER *encodedCertificate)
{
    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        return NULL;
    }
    return nssCertificateStore_FindCertificateByEncodedCertificate(
        cc->certStore,
        encodedCertificate);
}

NSS_IMPLEMENT NSSCertificate *
NSSCryptoContext_FindBestCertificateByEmail(
    NSSCryptoContext *cc,
    NSSASCII7 *email,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt)
{
    NSSCertificate **certs;
    NSSCertificate *rvCert = NULL;

    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        return NULL;
    }
    certs = nssCertificateStore_FindCertificatesByEmail(cc->certStore,
                                                        email,
                                                        NULL, 0, NULL);
    if (certs) {
        rvCert = nssCertificateArray_FindBestCertificate(certs,
                                                         timeOpt,
                                                         usage,
                                                         policiesOpt);
        nssCertificateArray_Destroy(certs);
    }
    return rvCert;
}

NSS_IMPLEMENT NSSTrust *
nssCryptoContext_FindTrustForCertificate(
    NSSCryptoContext *cc,
    NSSCertificate *cert)
{
    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        return NULL;
    }
    return nssCertificateStore_FindTrustForCertificate(cc->certStore, cert);
}

NSS_IMPLEMENT nssSMIMEProfile *
nssCryptoContext_FindSMIMEProfileForCertificate(
    NSSCryptoContext *cc,
    NSSCertificate *cert)
{
    PORT_Assert(cc && cc->certStore);
    if (!cc || !cc->certStore) {
        return NULL;
    }
    return nssCertificateStore_FindSMIMEProfileForCertificate(cc->certStore,
                                                              cert);
}
