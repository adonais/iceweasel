/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef NSSPKI_H
#define NSSPKI_H

/*
 * nsspki.h
 *
 * This file prototypes the methods of the top-level PKI objects.
 */

#ifndef NSSDEVT_H
#include "nssdevt.h"
#endif /* NSSDEVT_H */

#ifndef NSSPKIT_H
#include "nsspkit.h"
#endif /* NSSPKIT_H */

#ifndef BASE_H
#include "base.h"
#endif /* BASE_H */

#include "pkcs11uri.h"

PR_BEGIN_EXTERN_C

/*
 * NSSCertificate
 *
 * These things can do crypto ops like public keys, except that the trust,
 * usage, and other constraints are checked.  These objects are "high-level,"
 * so trust, usages, etc. are in the form we throw around (client auth,
 * email signing, etc.).  Remember that theoretically another implementation
 * (think PGP) could be beneath this object.
 */

/*
 * NSSCertificate_Destroy
 *
 * Free a pointer to a certificate object.
 */

NSS_EXTERN PRStatus
NSSCertificate_Destroy(NSSCertificate *c);

/*
 * NSSCertificate_DeleteStoredObject
 *
 * Permanently remove this certificate from storage.  If this is the
 * only (remaining) certificate corresponding to a private key,
 * public key, and/or other object; then that object (those objects)
 * are deleted too.
 */

NSS_EXTERN PRStatus
NSSCertificate_DeleteStoredObject(
    NSSCertificate *c,
    NSSCallback *uhh);

/*
 * NSSCertificate_Validate
 *
 * Verify that this certificate is trusted, for the specified usage(s),
 * at the specified time, {word word} the specified policies.
 */

NSS_EXTERN PRStatus
NSSCertificate_Validate(
    NSSCertificate *c,
    NSSTime *timeOpt, /* NULL for "now" */
    NSSUsage *usage,
    NSSPolicies *policiesOpt /* NULL for none */
);

/*
 * NSSCertificate_ValidateCompletely
 *
 * Verify that this certificate is trusted.  The difference between
 * this and the previous call is that NSSCertificate_Validate merely
 * returns success or failure with an appropriate error stack.
 * However, there may be (and often are) multiple problems with a
 * certificate.  This routine returns an array of errors, specifying
 * every problem.
 */

/*
 * Return value must be an array of objects, each of which has
 * an NSSError, and any corresponding certificate (in the chain)
 * and/or policy.
 */

NSS_EXTERN void ** /* void *[] */
NSSCertificate_ValidateCompletely(
    NSSCertificate *c,
    NSSTime *timeOpt, /* NULL for "now" */
    NSSUsage *usage,
    NSSPolicies *policiesOpt, /* NULL for none */
    void **rvOpt,             /* NULL for allocate */
    PRUint32 rvLimit,         /* zero for no limit */
    NSSArena *arenaOpt        /* NULL for heap */
);

/*
 * NSSCertificate_ValidateAndDiscoverUsagesAndPolicies
 *
 * Returns PR_SUCCESS if the certificate is valid for at least something.
 */

NSS_EXTERN PRStatus
NSSCertificate_ValidateAndDiscoverUsagesAndPolicies(
    NSSCertificate *c,
    NSSTime **notBeforeOutOpt,
    NSSTime **notAfterOutOpt,
    void *allowedUsages,
    void *disallowedUsages,
    void *allowedPolicies,
    void *disallowedPolicies,
    /* more args.. work on this fgmr */
    NSSArena *arenaOpt);

/*
 * NSSCertificate_Encode
 *
 */

NSS_EXTERN NSSDER *
NSSCertificate_Encode(
    NSSCertificate *c,
    NSSDER *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCertificate_BuildChain
 *
 * This routine returns NSSCertificate *'s for each certificate
 * in the "chain" starting from the specified one up to and
 * including the root.  The zeroth element in the array is the
 * specified ("leaf") certificate.
 *
 * If statusOpt is supplied, and is returned as PR_FAILURE, possible
 * error values are:
 *
 * NSS_ERROR_CERTIFICATE_ISSUER_NOT_FOUND - the chain is incomplete
 *
 */

extern const NSSError NSS_ERROR_CERTIFICATE_ISSUER_NOT_FOUND;

NSS_EXTERN NSSCertificate **
NSSCertificate_BuildChain(
    NSSCertificate *c,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt,
    NSSCertificate **rvOpt,
    PRUint32 rvLimit, /* zero for no limit */
    NSSArena *arenaOpt,
    PRStatus *statusOpt,
    NSSTrustDomain *td,
    NSSCryptoContext *cc);

/*
 * NSSCertificate_GetTrustDomain
 *
 */

NSS_EXTERN NSSTrustDomain *
NSSCertificate_GetTrustDomain(NSSCertificate *c);

/*
 * NSSCertificate_GetToken
 *
 * There doesn't have to be one.
 */

NSS_EXTERN NSSToken *
NSSCertificate_GetToken(
    NSSCertificate *c,
    PRStatus *statusOpt);

/*
 * NSSCertificate_GetSlot
 *
 * There doesn't have to be one.
 */

NSS_EXTERN NSSSlot *
NSSCertificate_GetSlot(
    NSSCertificate *c,
    PRStatus *statusOpt);

/*
 * NSSCertificate_GetModule
 *
 * There doesn't have to be one.
 */

NSS_EXTERN NSSModule *
NSSCertificate_GetModule(
    NSSCertificate *c,
    PRStatus *statusOpt);

/*
 * NSSCertificate_Encrypt
 *
 * Encrypt a single chunk of data with the public key corresponding to
 * this certificate.
 */

NSS_EXTERN NSSItem *
NSSCertificate_Encrypt(
    NSSCertificate *c,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *data,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt,
    NSSCallback *uhh,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCertificate_Verify
 *
 */

NSS_EXTERN PRStatus
NSSCertificate_Verify(
    NSSCertificate *c,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *data,
    NSSItem *signature,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt,
    NSSCallback *uhh);

/*
 * NSSCertificate_VerifyRecover
 *
 */

NSS_EXTERN NSSItem *
NSSCertificate_VerifyRecover(
    NSSCertificate *c,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *signature,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt,
    NSSCallback *uhh,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCertificate_CreateCryptoContext
 *
 * Create a crypto context, in this certificate's trust domain, with this
 * as the distinguished certificate.
 */

NSS_EXTERN NSSCryptoContext *
NSSCertificate_CreateCryptoContext(
    NSSCertificate *c,
    NSSAlgorithmAndParameters *apOpt,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt,
    NSSCallback *uhh);

/*
 * NSSCertificate_IsPrivateKeyAvailable
 *
 * Returns success if the private key corresponding to this certificate
 * is available to be used.
 */

NSS_EXTERN PRBool
NSSCertificate_IsPrivateKeyAvailable(
    NSSCertificate *c,
    NSSCallback *uhh,
    PRStatus *statusOpt);

/*
 * NSSTrustDomain
 *
 */

/*
 * NSSTrustDomain_Create
 *
 * This creates a trust domain, optionally with an initial cryptoki
 * module.  If the module name is not null, the module is loaded if
 * needed (using the uriOpt argument), and initialized with the
 * opaqueOpt argument.  If mumble mumble priority settings, then
 * module-specification objects in the module can cause the loading
 * and initialization of further modules.
 *
 * The uriOpt is defined to take a URI.  At present, we only
 * support file: URLs pointing to platform-native shared libraries.
 * However, by specifying this as a URI, this keeps open the
 * possibility of supporting other, possibly remote, resources.
 *
 * The "reserved" arguments is held for when we figure out the
 * module priority stuff.
 */

NSS_EXTERN NSSTrustDomain *
NSSTrustDomain_Create(
    NSSUTF8 *moduleOpt,
    NSSUTF8 *uriOpt,
    NSSUTF8 *opaqueOpt,
    void *reserved);

/*
 * NSSTrustDomain_Destroy
 *
 */

NSS_EXTERN PRStatus
NSSTrustDomain_Destroy(NSSTrustDomain *td);

/*
 * NSSTrustDomain_FindTokensByURI
 *
 */

NSS_EXTERN NSSToken **
NSSTrustDomain_FindTokensByURI(
    NSSTrustDomain *td,
    PK11URI *uri);

/*
 * NSSTrustDomain_FindTokenByName
 *
 */

NSS_EXTERN NSSToken *
NSSTrustDomain_FindTokenByName(
    NSSTrustDomain *td,
    NSSUTF8 *tokenName);

/*
 * NSSTrustDomain_FindCertificateByIssuerAndSerialNumber
 *
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_FindCertificateByIssuerAndSerialNumber(
    NSSTrustDomain *td,
    NSSDER *issuer,
    NSSDER *serialNumber);

/*
 * NSSTrustDomain_FindCertificatesByIssuerAndSerialNumber
 *
 * Theoretically, this should never happen.  However, some companies
 * we know have issued duplicate certificates with the same issuer
 * and serial number.  Do we just ignore them?  I'm thinking yes.
 */

/*
 * NSSTrustDomain_FindBestCertificateBySubject
 *
 * This does not search through alternate names hidden in extensions.
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_FindBestCertificateBySubject(
    NSSTrustDomain *td,
    NSSDER /*NSSUTF8*/ *subject,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt);

/*
 * NSSTrustDomain_FindCertificatesBySubject
 *
 * This does not search through alternate names hidden in extensions.
 */

NSS_EXTERN NSSCertificate **
NSSTrustDomain_FindCertificatesBySubject(
    NSSTrustDomain *td,
    NSSDER /*NSSUTF8*/ *subject,
    NSSCertificate *rvOpt[],
    PRUint32 maximumOpt, /* 0 for no max */
    NSSArena *arenaOpt);

/*
 * NSSTrustDomain_FindCertificateByEncodedCertificate
 *
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_FindCertificateByEncodedCertificate(
    NSSTrustDomain *td,
    NSSBER *encodedCertificate);

/*
 * NSSTrustDomain_TraverseCertificates
 *
 * This function descends from one in older versions of NSS which
 * traverses the certs in the permanent database.  That function
 * was used to implement selection routines, but was directly
 * available too.  Trust domains are going to contain a lot more
 * certs now (e.g., an ldap server), so we'd really like to
 * discourage traversal.  Thus for now, this is commented out.
 * If it's needed, let's look at the situation more closely to
 * find out what the actual requirements are.
 */

/* For now, adding this function.  This may only be for debugging
 * purposes.
 * Perhaps some equivalent function, on a specified token, will be
 * needed in a "friend" header file?
 */
NSS_EXTERN PRStatus *
NSSTrustDomain_TraverseCertificates(
    NSSTrustDomain *td,
    PRStatus (*callback)(NSSCertificate *c, void *arg),
    void *arg);

/*
 * NSSTrustDomain_CreateCryptoContext
 *
 * If a callback object is specified, it becomes the for the crypto
 * context; otherwise, this trust domain's default (if any) is
 * inherited.
 */

NSS_EXTERN NSSCryptoContext *
NSSTrustDomain_CreateCryptoContext(
    NSSTrustDomain *td,
    NSSCallback *uhhOpt);

/* find/traverse other objects, e.g. s/mime profiles */

/*
 * NSSCryptoContext
 *
 * A crypto context is sort of a short-term snapshot of a trust domain,
 * used for the life of "one crypto operation."  You can also think of
 * it as a "temporary database."
 *
 * Just about all of the things you can do with a trust domain -- importing
 * or creating certs, keys, etc. -- can be done with a crypto context.
 * The difference is that the objects will be temporary ("session") objects.
 *
 * Also, if the context was created for a key, cert, and/or algorithm; or
 * if such objects have been "associated" with the context, then the context
 * can do everything the keys can, like crypto operations.
 *
 * And finally, because it keeps the state of the crypto operations, it
 * can do streaming crypto ops.
 */

/*
 * NSSTrustDomain_Destroy
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_Destroy(NSSCryptoContext *cc);

/* Importing things */

/*
 * NSSCryptoContext_FindOrImportCertificate
 *
 * If the certificate store already contains this DER cert, return the
 * address of the matching NSSCertificate that is already in the store,
 * and bump its reference count.
 *
 * If this DER cert is NOT already in the store, then add the new
 * NSSCertificate to the store and bump its reference count,
 * then return its address.
 *
 * if this DER cert is not in the store and cannot be added to it,
 * return NULL;
 *
 * Record the associated crypto context in the certificate.
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindOrImportCertificate(
    NSSCryptoContext *cc,
    NSSCertificate *c);

/* Other importations: S/MIME capabilities
 */

/*
 * NSSCryptoContext_FindBestCertificateByNickname
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindBestCertificateByNickname(
    NSSCryptoContext *cc,
    const NSSUTF8 *name,
    NSSTime *timeOpt, /* NULL for "now" */
    NSSUsage *usage,
    NSSPolicies *policiesOpt /* NULL for none */
);

/*
 * NSSCryptoContext_FindCertificateByIssuerAndSerialNumber
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindCertificateByIssuerAndSerialNumber(
    NSSCryptoContext *cc,
    NSSDER *issuer,
    NSSDER *serialNumber);

/*
 * NSSCryptoContext_FindBestCertificateBySubject
 *
 * This does not search through alternate names hidden in extensions.
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindBestCertificateBySubject(
    NSSCryptoContext *cc,
    NSSDER /*NSSUTF8*/ *subject,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt);

/*
 * NSSCryptoContext_FindCertificatesBySubject
 *
 * This does not search through alternate names hidden in extensions.
 */

NSS_EXTERN NSSCertificate **
NSSCryptoContext_FindCertificatesBySubject(
    NSSCryptoContext *cc,
    NSSDER /*NSSUTF8*/ *subject,
    NSSCertificate *rvOpt[],
    PRUint32 maximumOpt, /* 0 for no max */
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_FindCertificateByEncodedCertificate
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindCertificateByEncodedCertificate(
    NSSCryptoContext *cc,
    NSSBER *encodedCertificate);

/*
 * NSSCryptoContext_FindBestCertificateByEmail
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindBestCertificateByEmail(
    NSSCryptoContext *cc,
    NSSASCII7 *email,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt);

PR_END_EXTERN_C

#endif /* NSSPKI_H */
