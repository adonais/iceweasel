/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Header file for routines specific to S/MIME.  Keep things that are pure
 * pkcs7 out of here; this is for S/MIME policy, S/MIME interoperability, etc.
 */

#ifndef _SMIME_H_
#define _SMIME_H_ 1

#include "cms.h"

/************************************************************************/
SEC_BEGIN_PROTOS

/*
 * Initialize the local recording of the S/MIME policy.
 * This function is called to allow/disallow a particular cipher by
 * policy. It uses the underlying NSS policy system.
 *
 *  - The "which" still understands values which are defined in
 *    ciferfam.h (the SMIME_* values, for example SMIME_DES_CBC_56),
 *    but the preferred usage is to handle values based on algtags.
 *  - If "on" is non-zero then the named cipher is enabled, otherwise
 *    it is disabled.
 */
extern SECStatus NSS_SMIMEUtils_AllowCipher(long which, int on);

/*
 * Does the current policy allow S/MIME decryption of this particular
 * algorithm and keysize?
 */
extern PRBool NSS_SMIMEUtil_DecryptionAllowed(SECAlgorithmID *algid, PK11SymKey *key);

/*
 * Does the current policy allow S/MIME encryption of this particular
 * algorithm and key size?
 */
extern PRBool NSS_SMIMEUtil_EncryptionAllowed(SECAlgorithmID *algid, PK11SymKey *key);

/*
 * Does the current policy allow S/MIME signing with this particular
 * algorithm?
 */
extern PRBool NSS_SMIMEUtil_SigningAllowed(SECAlgorithmID *algid);

/*
 * Does the current policy allow S/MIME Key exchange (encrypt) of this particular
 * algorithm and keysize?
 */
extern PRBool NSS_SMIMEUtil_KeyEncodingAllowed(SECAlgorithmID *algtag,
                                               CERTCertificate *cert, SECKEYPublicKey *key);

/*
 * Does the current policy allow S/MIME Key exchange (decrypt) of this particular
 * algorithm and keysize?
 */
extern PRBool NSS_SMIMEUtil_KeyDecodingAllowed(SECAlgorithmID *algtag,
                                               SECKEYPrivateKey *key);

/*
 * NSS_SMIMEUtil_CreateSMIMECapabilities - get S/MIME capabilities attr value
 *
 * scans the list of allowed and enabled ciphers and construct a PKCS9-compliant
 * S/MIME capabilities attribute value.
 */
extern SECStatus NSS_SMIMEUtil_CreateSMIMECapabilities(PLArenaPool *poolp, SECItem *dest);

/*
 * NSS_SMIMEUtil_CreateSMIMEEncKeyPrefs - create S/MIME encryption key preferences attr value
 */
extern SECStatus NSS_SMIMEUtil_CreateSMIMEEncKeyPrefs(PLArenaPool *poolp,
                                                      SECItem *dest, CERTCertificate *cert);

/*
 * NSS_SMIMEUtil_CreateMSSMIMEEncKeyPrefs - create S/MIME encryption key preferences attr value using MS oid
 */
extern SECStatus NSS_SMIMEUtil_CreateMSSMIMEEncKeyPrefs(PLArenaPool *poolp,
                                                        SECItem *dest, CERTCertificate *cert);

/*
 * NSS_SMIMEUtil_GetCertFromEncryptionKeyPreference - find cert marked by EncryptionKeyPreference
 *          attribute
 */
extern CERTCertificate *NSS_SMIMEUtil_GetCertFromEncryptionKeyPreference(CERTCertDBHandle *certdb,
                                                                         SECItem *DERekp);

/*
 * NSS_SMIMEUtil_FindBulkAlgForRecipients - find bulk algorithm suitable for all recipients
 */
extern SECStatus
NSS_SMIMEUtil_FindBulkAlgForRecipients(CERTCertificate **rcerts,
                                       SECOidTag *bulkalgtag, int *keysize);

/*
 * Return a boolean that indicates whether the underlying library
 * will perform as the caller expects.
 *
 * The only argument is a string, which should be the version
 * identifier of the NSS library. That string will be compared
 * against a string that represents the actual build version of
 * the S/MIME library.
 */
extern PRBool NSSSMIME_VersionCheck(const char *importedVersion);

/*
 * Returns a const string of the S/MIME library version.
 */
extern const char *NSSSMIME_GetVersion(void);

/************************************************************************/
SEC_END_PROTOS

#endif /* _SECMIME_H_ */
