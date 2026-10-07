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
 * NSSTrustDomain_SetDefaultCallback
 *
 */

NSS_EXTERN PRStatus
NSSTrustDomain_SetDefaultCallback(
    NSSTrustDomain *td,
    NSSCallback *newCallback,
    NSSCallback **oldCallbackOpt);

/*
 * NSSTrustDomain_GetDefaultCallback
 *
 */

NSS_EXTERN NSSCallback *
NSSTrustDomain_GetDefaultCallback(
    NSSTrustDomain *td,
    PRStatus *statusOpt);

/*
 * Default policies?
 * Default usage?
 * Default time, for completeness?
 */

/*
 * NSSTrustDomain_LoadModule
 *
 */

NSS_EXTERN PRStatus
NSSTrustDomain_LoadModule(
    NSSTrustDomain *td,
    NSSUTF8 *moduleOpt,
    NSSUTF8 *uriOpt,
    NSSUTF8 *opaqueOpt,
    void *reserved);

/*
 * NSSTrustDomain_AddModule
 * NSSTrustDomain_AddSlot
 * NSSTrustDomain_UnloadModule
 * Managing modules, slots, tokens; priorities;
 * Traversing all of the above
 * this needs more work
 */

/*
 * NSSTrustDomain_DisableToken
 *
 */

NSS_EXTERN PRStatus
NSSTrustDomain_DisableToken(
    NSSTrustDomain *td,
    NSSToken *token,
    NSSError why);

/*
 * NSSTrustDomain_EnableToken
 *
 */

NSS_EXTERN PRStatus
NSSTrustDomain_EnableToken(
    NSSTrustDomain *td,
    NSSToken *token);

/*
 * NSSTrustDomain_IsTokenEnabled
 *
 * If disabled, "why" is always on the error stack.
 * The optional argument is just for convenience.
 */

NSS_EXTERN PRStatus
NSSTrustDomain_IsTokenEnabled(
    NSSTrustDomain *td,
    NSSToken *token,
    NSSError *whyOpt);

/*
 * NSSTrustDomain_FindTokensByURI
 *
 */

NSS_EXTERN NSSToken **
NSSTrustDomain_FindTokensByURI(
    NSSTrustDomain *td,
    PK11URI *uri);

/*
 * NSSTrustDomain_FindSlotByName
 *
 */

NSS_EXTERN NSSSlot *
NSSTrustDomain_FindSlotByName(
    NSSTrustDomain *td,
    NSSUTF8 *slotName);

/*
 * NSSTrustDomain_FindTokenByName
 *
 */

NSS_EXTERN NSSToken *
NSSTrustDomain_FindTokenByName(
    NSSTrustDomain *td,
    NSSUTF8 *tokenName);

/*
 * NSSTrustDomain_FindTokenBySlotName
 *
 */

NSS_EXTERN NSSToken *
NSSTrustDomain_FindTokenBySlotName(
    NSSTrustDomain *td,
    NSSUTF8 *slotName);

/*
 * NSSTrustDomain_FindBestTokenForAlgorithm
 *
 */

NSS_EXTERN NSSToken *
NSSTrustDomain_FindTokenForAlgorithm(
    NSSTrustDomain *td,
    NSSOID *algorithm);

/*
 * NSSTrustDomain_FindBestTokenForAlgorithms
 *
 */

NSS_EXTERN NSSToken *
NSSTrustDomain_FindBestTokenForAlgorithms(
    NSSTrustDomain *td,
    NSSOID *algorithms[],   /* may be null-terminated */
    PRUint32 nAlgorithmsOpt /* limits the array if nonzero */
);

/*
 * NSSTrustDomain_Login
 *
 */

NSS_EXTERN PRStatus
NSSTrustDomain_Login(
    NSSTrustDomain *td,
    NSSCallback *uhhOpt);

/*
 * NSSTrustDomain_Logout
 *
 */

NSS_EXTERN PRStatus
NSSTrustDomain_Logout(NSSTrustDomain *td);

/* Importing things */

/*
 * NSSTrustDomain_ImportCertificate
 *
 * The implementation will pull some data out of the certificate
 * (e.g. e-mail address) for use in pkcs#11 object attributes.
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_ImportCertificate(
    NSSTrustDomain *td,
    NSSCertificate *c);

/*
 * NSSTrustDomain_ImportPKIXCertificate
 *
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_ImportPKIXCertificate(
    NSSTrustDomain *td,
    /* declared as a struct until these "data types" are defined */
    struct NSSPKIXCertificateStr *pc);

/*
 * NSSTrustDomain_ImportEncodedCertificate
 *
 * Imports any type of certificate we support.
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_ImportEncodedCertificate(
    NSSTrustDomain *td,
    NSSBER *ber);

/*
 * NSSTrustDomain_ImportEncodedCertificateChain
 *
 * If you just want the leaf, pass in a maximum of one.
 */

NSS_EXTERN NSSCertificate **
NSSTrustDomain_ImportEncodedCertificateChain(
    NSSTrustDomain *td,
    NSSBER *ber,
    NSSCertificate *rvOpt[],
    PRUint32 maximumOpt, /* 0 for no max */
    NSSArena *arenaOpt);

/* Other importations: S/MIME capabilities */

/*
 * NSSTrustDomain_FindBestCertificateByNickname
 *
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_FindBestCertificateByNickname(
    NSSTrustDomain *td,
    const NSSUTF8 *name,
    NSSTime *timeOpt, /* NULL for "now" */
    NSSUsage *usage,
    NSSPolicies *policiesOpt /* NULL for none */
);

/*
 * NSSTrustDomain_FindCertificatesByNickname
 *
 */

NSS_EXTERN NSSCertificate **
NSSTrustDomain_FindCertificatesByNickname(
    NSSTrustDomain *td,
    NSSUTF8 *name,
    NSSCertificate *rvOpt[],
    PRUint32 maximumOpt, /* 0 for no max */
    NSSArena *arenaOpt);

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
 * NSSTrustDomain_FindBestCertificateByNameComponents
 *
 * This call does try several tricks, including a pseudo pkcs#11
 * attribute for the ldap module to try as a query.  Eventually
 * this call falls back to a traversal if that's what's required.
 * It will search through alternate names hidden in extensions.
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_FindBestCertificateByNameComponents(
    NSSTrustDomain *td,
    NSSUTF8 *nameComponents,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt);

/*
 * NSSTrustDomain_FindCertificatesByNameComponents
 *
 * This call, too, tries several tricks.  It will stop on the first
 * attempt that generates results, so it won't e.g. traverse the
 * entire ldap database.
 */

NSS_EXTERN NSSCertificate **
NSSTrustDomain_FindCertificatesByNameComponents(
    NSSTrustDomain *td,
    NSSUTF8 *nameComponents,
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
 * NSSTrustDomain_FindBestCertificateByEmail
 *
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_FindCertificateByEmail(
    NSSTrustDomain *td,
    NSSASCII7 *email,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt);

/*
 * NSSTrustDomain_FindCertificatesByEmail
 *
 */

NSS_EXTERN NSSCertificate **
NSSTrustDomain_FindCertificatesByEmail(
    NSSTrustDomain *td,
    NSSASCII7 *email,
    NSSCertificate *rvOpt[],
    PRUint32 maximumOpt, /* 0 for no max */
    NSSArena *arenaOpt);

/*
 * NSSTrustDomain_FindCertificateByOCSPHash
 *
 * There can be only one.
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_FindCertificateByOCSPHash(
    NSSTrustDomain *td,
    NSSItem *hash);

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
 * NSSTrustDomain_FindBestUserCertificate
 *
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_FindBestUserCertificate(
    NSSTrustDomain *td,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt);

/*
 * NSSTrustDomain_FindUserCertificates
 *
 */

NSS_EXTERN NSSCertificate **
NSSTrustDomain_FindUserCertificates(
    NSSTrustDomain *td,
    NSSTime *timeOpt,
    NSSUsage *usageOpt,
    NSSPolicies *policiesOpt,
    NSSCertificate **rvOpt,
    PRUint32 rvLimit, /* zero for no limit */
    NSSArena *arenaOpt);

/*
 * NSSTrustDomain_FindBestUserCertificateForSSLClientAuth
 *
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_FindBestUserCertificateForSSLClientAuth(
    NSSTrustDomain *td,
    NSSUTF8 *sslHostOpt,
    NSSDER *rootCAsOpt[],   /* null pointer for none */
    PRUint32 rootCAsMaxOpt, /* zero means list is null-terminated */
    NSSAlgorithmAndParameters *apOpt,
    NSSPolicies *policiesOpt);

/*
 * NSSTrustDomain_FindUserCertificatesForSSLClientAuth
 *
 */

NSS_EXTERN NSSCertificate **
NSSTrustDomain_FindUserCertificatesForSSLClientAuth(
    NSSTrustDomain *td,
    NSSUTF8 *sslHostOpt,
    NSSDER *rootCAsOpt[],   /* null pointer for none */
    PRUint32 rootCAsMaxOpt, /* zero means list is null-terminated */
    NSSAlgorithmAndParameters *apOpt,
    NSSPolicies *policiesOpt,
    NSSCertificate **rvOpt,
    PRUint32 rvLimit, /* zero for no limit */
    NSSArena *arenaOpt);

/*
 * NSSTrustDomain_FindBestUserCertificateForEmailSigning
 *
 */

NSS_EXTERN NSSCertificate *
NSSTrustDomain_FindBestUserCertificateForEmailSigning(
    NSSTrustDomain *td,
    NSSASCII7 *signerOpt,
    NSSASCII7 *recipientOpt,
    /* anything more here? */
    NSSAlgorithmAndParameters *apOpt,
    NSSPolicies *policiesOpt);

/*
 * NSSTrustDomain_FindUserCertificatesForEmailSigning
 *
 */

NSS_EXTERN NSSCertificate **
NSSTrustDomain_FindUserCertificatesForEmailSigning(
    NSSTrustDomain *td,
    NSSASCII7 *signerOpt,
    NSSASCII7 *recipientOpt,
    /* anything more here? */
    NSSAlgorithmAndParameters *apOpt,
    NSSPolicies *policiesOpt,
    NSSCertificate **rvOpt,
    PRUint32 rvLimit, /* zero for no limit */
    NSSArena *arenaOpt);

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

/*
 * NSSTrustDomain_CreateCryptoContextForAlgorithm
 *
 */

NSS_EXTERN NSSCryptoContext *
NSSTrustDomain_CreateCryptoContextForAlgorithm(
    NSSTrustDomain *td,
    NSSOID *algorithm);

/*
 * NSSTrustDomain_CreateCryptoContextForAlgorithmAndParameters
 *
 */

NSS_EXTERN NSSCryptoContext *
NSSTrustDomain_CreateCryptoContextForAlgorithmAndParameters(
    NSSTrustDomain *td,
    NSSAlgorithmAndParameters *ap);

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

/* establishing a default callback */

/*
 * NSSCryptoContext_SetDefaultCallback
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_SetDefaultCallback(
    NSSCryptoContext *cc,
    NSSCallback *newCallback,
    NSSCallback **oldCallbackOpt);

/*
 * NSSCryptoContext_GetDefaultCallback
 *
 */

NSS_EXTERN NSSCallback *
NSSCryptoContext_GetDefaultCallback(
    NSSCryptoContext *cc,
    PRStatus *statusOpt);

/*
 * NSSCryptoContext_GetTrustDomain
 *
 */

NSS_EXTERN NSSTrustDomain *
NSSCryptoContext_GetTrustDomain(
    NSSCryptoContext *cc);

/* AddModule, etc: should we allow "temporary" changes here? */
/* DisableToken, etc: ditto */
/* Ordering of tokens? */
/* Finding slots+token etc. */
/* login+logout */

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

/*
 * NSSCryptoContext_ImportPKIXCertificate
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_ImportPKIXCertificate(
    NSSCryptoContext *cc,
    struct NSSPKIXCertificateStr *pc);

/*
 * NSSCryptoContext_ImportEncodedCertificate
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_ImportEncodedCertificate(
    NSSCryptoContext *cc,
    NSSBER *ber);

/*
 * NSSCryptoContext_ImportEncodedPKIXCertificateChain
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_ImportEncodedPKIXCertificateChain(
    NSSCryptoContext *cc,
    NSSBER *ber);

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
 * NSSCryptoContext_FindCertificatesByNickname
 *
 */

NSS_EXTERN NSSCertificate **
NSSCryptoContext_FindCertificatesByNickname(
    NSSCryptoContext *cc,
    NSSUTF8 *name,
    NSSCertificate *rvOpt[],
    PRUint32 maximumOpt, /* 0 for no max */
    NSSArena *arenaOpt);

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
 * NSSCryptoContext_FindBestCertificateByNameComponents
 *
 * This call does try several tricks, including a pseudo pkcs#11
 * attribute for the ldap module to try as a query.  Eventually
 * this call falls back to a traversal if that's what's required.
 * It will search through alternate names hidden in extensions.
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindBestCertificateByNameComponents(
    NSSCryptoContext *cc,
    NSSUTF8 *nameComponents,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt);

/*
 * NSSCryptoContext_FindCertificatesByNameComponents
 *
 * This call, too, tries several tricks.  It will stop on the first
 * attempt that generates results, so it won't e.g. traverse the
 * entire ldap database.
 */

NSS_EXTERN NSSCertificate **
NSSCryptoContext_FindCertificatesByNameComponents(
    NSSCryptoContext *cc,
    NSSUTF8 *nameComponents,
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

/*
 * NSSCryptoContext_FindCertificatesByEmail
 *
 */

NSS_EXTERN NSSCertificate **
NSSCryptoContext_FindCertificatesByEmail(
    NSSCryptoContext *cc,
    NSSASCII7 *email,
    NSSCertificate *rvOpt[],
    PRUint32 maximumOpt, /* 0 for no max */
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_FindCertificateByOCSPHash
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindCertificateByOCSPHash(
    NSSCryptoContext *cc,
    NSSItem *hash);

/*
 * NSSCryptoContext_TraverseCertificates
 *
 *
 * NSS_EXTERN PRStatus *
 * NSSCryptoContext_TraverseCertificates
 * (
 *   NSSCryptoContext *cc,
 *   PRStatus (*callback)(NSSCertificate *c, void *arg),
 *   void *arg
 * );
 */

/*
 * NSSCryptoContext_FindBestUserCertificate
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindBestUserCertificate(
    NSSCryptoContext *cc,
    NSSTime *timeOpt,
    NSSUsage *usage,
    NSSPolicies *policiesOpt);

/*
 * NSSCryptoContext_FindUserCertificates
 *
 */

NSS_EXTERN NSSCertificate **
NSSCryptoContext_FindUserCertificates(
    NSSCryptoContext *cc,
    NSSTime *timeOpt,
    NSSUsage *usageOpt,
    NSSPolicies *policiesOpt,
    NSSCertificate **rvOpt,
    PRUint32 rvLimit, /* zero for no limit */
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_FindBestUserCertificateForSSLClientAuth
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindBestUserCertificateForSSLClientAuth(
    NSSCryptoContext *cc,
    NSSUTF8 *sslHostOpt,
    NSSDER *rootCAsOpt[],   /* null pointer for none */
    PRUint32 rootCAsMaxOpt, /* zero means list is null-terminated */
    NSSAlgorithmAndParameters *apOpt,
    NSSPolicies *policiesOpt);

/*
 * NSSCryptoContext_FindUserCertificatesForSSLClientAuth
 *
 */

NSS_EXTERN NSSCertificate **
NSSCryptoContext_FindUserCertificatesForSSLClientAuth(
    NSSCryptoContext *cc,
    NSSUTF8 *sslHostOpt,
    NSSDER *rootCAsOpt[],   /* null pointer for none */
    PRUint32 rootCAsMaxOpt, /* zero means list is null-terminated */
    NSSAlgorithmAndParameters *apOpt,
    NSSPolicies *policiesOpt,
    NSSCertificate **rvOpt,
    PRUint32 rvLimit, /* zero for no limit */
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_FindBestUserCertificateForEmailSigning
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindBestUserCertificateForEmailSigning(
    NSSCryptoContext *cc,
    NSSASCII7 *signerOpt,
    NSSASCII7 *recipientOpt,
    /* anything more here? */
    NSSAlgorithmAndParameters *apOpt,
    NSSPolicies *policiesOpt);

/*
 * NSSCryptoContext_FindUserCertificatesForEmailSigning
 *
 */

NSS_EXTERN NSSCertificate *
NSSCryptoContext_FindUserCertificatesForEmailSigning(
    NSSCryptoContext *cc,
    NSSASCII7 *signerOpt, /* fgmr or a more general name? */
    NSSASCII7 *recipientOpt,
    /* anything more here? */
    NSSAlgorithmAndParameters *apOpt,
    NSSPolicies *policiesOpt,
    NSSCertificate **rvOpt,
    PRUint32 rvLimit, /* zero for no limit */
    NSSArena *arenaOpt);

/* Crypto ops on distinguished keys */

/*
 * NSSCryptoContext_Decrypt
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_Decrypt(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *encryptedData,
    NSSCallback *uhhOpt,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_BeginDecrypt
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_BeginDecrypt(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSCallback *uhhOpt);

/*
 * NSSCryptoContext_ContinueDecrypt
 *
 */

/*
 * NSSItem semantics:
 *
 *   If rvOpt is NULL, a new NSSItem and buffer are allocated.
 *   If rvOpt is not null, but the buffer pointer is null,
 *     then rvOpt is returned but a new buffer is allocated.
 *     In this case, if the length value is not zero, then
 *     no more than that much space will be allocated.
 *   If rvOpt is not null and the buffer pointer is not null,
 *     then that buffer is re-used.  No more than the buffer
 *     length value will be used; if it's not enough, an
 *     error is returned.  If less is used, the number is
 *     adjusted downwards.
 *
 *  Note that although this is short of some ideal "Item"
 *  definition, we can usually tell how big these buffers
 *  have to be.
 *
 *  Feedback is requested; and earlier is better than later.
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_ContinueDecrypt(
    NSSCryptoContext *cc,
    NSSItem *data,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_FinishDecrypt
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_FinishDecrypt(
    NSSCryptoContext *cc,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_Sign
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_Sign(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *data,
    NSSCallback *uhhOpt,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_BeginSign
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_BeginSign(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSCallback *uhhOpt);

/*
 * NSSCryptoContext_ContinueSign
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_ContinueSign(
    NSSCryptoContext *cc,
    NSSItem *data);

/*
 * NSSCryptoContext_FinishSign
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_FinishSign(
    NSSCryptoContext *cc,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_SignRecover
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_SignRecover(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *data,
    NSSCallback *uhhOpt,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_BeginSignRecover
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_BeginSignRecover(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSCallback *uhhOpt);

/*
 * NSSCryptoContext_ContinueSignRecover
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_ContinueSignRecover(
    NSSCryptoContext *cc,
    NSSItem *data,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_FinishSignRecover
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_FinishSignRecover(
    NSSCryptoContext *cc,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_Encrypt
 *
 * Encrypt a single chunk of data with the distinguished public key
 * of this crypto context.
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_Encrypt(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *data,
    NSSCallback *uhhOpt,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_BeginEncrypt
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_BeginEncrypt(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSCallback *uhhOpt);

/*
 * NSSCryptoContext_ContinueEncrypt
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_ContinueEncrypt(
    NSSCryptoContext *cc,
    NSSItem *data,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_FinishEncrypt
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_FinishEncrypt(
    NSSCryptoContext *cc,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_Verify
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_Verify(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *data,
    NSSItem *signature,
    NSSCallback *uhhOpt);

/*
 * NSSCryptoContext_BeginVerify
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_BeginVerify(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *signature,
    NSSCallback *uhhOpt);

/*
 * NSSCryptoContext_ContinueVerify
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_ContinueVerify(
    NSSCryptoContext *cc,
    NSSItem *data);

/*
 * NSSCryptoContext_FinishVerify
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_FinishVerify(
    NSSCryptoContext *cc);

/*
 * NSSCryptoContext_VerifyRecover
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_VerifyRecover(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *signature,
    NSSCallback *uhhOpt,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_BeginVerifyRecover
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_BeginVerifyRecover(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSCallback *uhhOpt);

/*
 * NSSCryptoContext_ContinueVerifyRecover
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_ContinueVerifyRecover(
    NSSCryptoContext *cc,
    NSSItem *data,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_FinishVerifyRecover
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_FinishVerifyRecover(
    NSSCryptoContext *cc,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_Digest
 *
 * Digest a single chunk of data with the distinguished digest key
 * of this crypto context.
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_Digest(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *data,
    NSSCallback *uhhOpt,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_BeginDigest
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_BeginDigest(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSCallback *uhhOpt);

/*
 * NSSCryptoContext_ContinueDigest
 *
 */

NSS_EXTERN PRStatus
NSSCryptoContext_ContinueDigest(
    NSSCryptoContext *cc,
    NSSAlgorithmAndParameters *apOpt,
    NSSItem *item);

/*
 * NSSCryptoContext_FinishDigest
 *
 */

NSS_EXTERN NSSItem *
NSSCryptoContext_FinishDigest(
    NSSCryptoContext *cc,
    NSSItem *rvOpt,
    NSSArena *arenaOpt);

/*
 * NSSCryptoContext_Clone
 *
 */

NSS_EXTERN NSSCryptoContext *
NSSCryptoContext_Clone(NSSCryptoContext *cc);

PR_END_EXTERN_C

#endif /* NSSPKI_H */
