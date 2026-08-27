/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nssrenam.h"
#include "secpkcs7.h"
#include "secasn1.h"
#include "seccomon.h"
#include "secoid.h"
#include "sechash.h"
#include "secitem.h"
#include "secerr.h"
#include "pk11func.h"
#include "p12local.h"
#include "p12.h"
#include "nsshash.h"
#include "secpkcs5.h"
#include "p12plcy.h"

#define SALT_LENGTH 16

CK_MECHANISM_TYPE
sec_pkcs12_algtag_to_mech(SECOidTag algtag)
{
    SECOidTag hmacAlg = HASH_GetHMACOidTagByHashOidTag(algtag);
    return PK11_AlgtagToMechanism(hmacAlg);
}

CK_MECHANISM_TYPE
sec_pkcs12_algtag_to_keygen_mech(SECOidTag algtag)
{
    switch (algtag) {
        case SEC_OID_SHA1:
            return CKM_NSS_PBE_SHA1_HMAC_KEY_GEN;
            break;
        case SEC_OID_MD5:
            return CKM_NSS_PBE_MD5_HMAC_KEY_GEN;
            break;
        case SEC_OID_MD2:
            return CKM_NSS_PBE_MD2_HMAC_KEY_GEN;
            break;
        case SEC_OID_SHA224:
            return CKM_NSS_PKCS12_PBE_SHA224_HMAC_KEY_GEN;
            break;
        case SEC_OID_SHA256:
            return CKM_NSS_PKCS12_PBE_SHA256_HMAC_KEY_GEN;
            break;
        case SEC_OID_SHA384:
            return CKM_NSS_PKCS12_PBE_SHA384_HMAC_KEY_GEN;
            break;
        case SEC_OID_SHA512:
            return CKM_NSS_PKCS12_PBE_SHA512_HMAC_KEY_GEN;
            break;
        default:
            break;
    }
    return CKM_INVALID_MECHANISM;
}

PK11SymKey *
sec_pkcs12_integrity_key(PK11SlotInfo *slot, sec_PKCS12MacData *macData,
                         SECItem *pwitem, CK_MECHANISM_TYPE *hmacMech,
                         PRBool isDecrypt, void *pwarg)
{
    int iteration;
    CK_MECHANISM_TYPE integrityMech;
    PK11SymKey *symKey = NULL;
    SECItem *params = NULL;
    SECAlgorithmID *prfAlgid = &macData->safeMac.digestAlgorithm;
    SECOidTag algtag = SECOID_GetAlgorithmTag(prfAlgid);

    /* handle PBE v2 case */
    if (algtag == SEC_OID_PKCS5_PBMAC1) {
        SECOidTag hmacAlg;
        SECItem utf8Pw;
        int keyLen;

        hmacAlg = SEC_PKCS5GetCryptoAlgorithm(prfAlgid);
        /* make sure we are using an hmac */
        if (HASH_GetHashOidTagByHMACOidTag(hmacAlg) == SEC_OID_UNKNOWN) {
            PORT_SetError(SEC_ERROR_INVALID_ALGORITHM);
            return NULL;
        }
        if (!SEC_PKCS12IntegrityHashAllowed(hmacAlg, isDecrypt)) {
            PORT_SetError(SEC_ERROR_BAD_EXPORT_ALGORITHM);
            return NULL;
        }
        /* make sure the length is valid, as well as decoding the length
         * from prfAlgid, SEC_PKCS5GetLength does some
         * fallbacks, which evenutally gets the max length of the key if
         * the decode fails. All HMAC keys have a max length of 128 bytes
         * in softoken, so if we get a keyLen of 128 we know we hit an error. */
        keyLen = SEC_PKCS5GetKeyLength(prfAlgid);
        if ((keyLen == 0) || (keyLen == 128)) {
            PORT_SetError(SEC_ERROR_BAD_DER);
            return NULL;
        }
        *hmacMech = PK11_AlgtagToMechanism(hmacAlg);
        /* pkcs12v2 hmac uses UTF8 rather than unicode */
        if (!sec_pkcs12_convert_item_to_unicode(NULL, &utf8Pw, pwitem,
                                                PR_FALSE, PR_FALSE, PR_FALSE)) {
            return NULL;
        }
        symKey = PK11_PBEKeyGen(slot, prfAlgid, &utf8Pw, PR_FALSE, pwarg);
        SECITEM_ZfreeItem(&utf8Pw, PR_FALSE);
        return symKey;
    }

    /* handle Legacy case */
    if (!SEC_PKCS12IntegrityHashAllowed(algtag, isDecrypt)) {
        PORT_SetError(SEC_ERROR_BAD_EXPORT_ALGORITHM);
        return NULL;
    }
    integrityMech = sec_pkcs12_algtag_to_keygen_mech(algtag);
    *hmacMech = sec_pkcs12_algtag_to_mech(algtag);
    if (integrityMech == CKM_INVALID_MECHANISM) {
        PORT_SetError(SEC_ERROR_INVALID_ALGORITHM);
        goto loser;
    }
    if (macData->iter.data) {
        PORT_SetError(0);
        iteration = (int)DER_GetInteger(&macData->iter);
        if (PORT_GetError() != 0) {
            return NULL;
        }
    } else {
        iteration = 1;
    }

    params = PK11_CreatePBEParams(&macData->macSalt, pwitem, iteration);
    if (params == NULL) {
        goto loser;
    }

    symKey = PK11_KeyGen(slot, integrityMech, params, 0, pwarg);
    PK11_DestroyPBEParams(params);
    params = NULL;
    if (!symKey)
        goto loser;
    return symKey;

loser:
    if (params) {
        PK11_DestroyPBEParams(params);
    }
    return NULL;
}

SECItem *
sec_pkcs12_generate_salt(void)
{
    SECItem *salt;

    salt = (SECItem *)PORT_ZAlloc(sizeof(SECItem));
    if (salt == NULL) {
        PORT_SetError(SEC_ERROR_NO_MEMORY);
        return NULL;
    }
    salt->data = (unsigned char *)PORT_ZAlloc(sizeof(unsigned char) *
                                              SALT_LENGTH);
    salt->len = SALT_LENGTH;
    if (salt->data == NULL) {
        PORT_SetError(SEC_ERROR_NO_MEMORY);
        SECITEM_ZfreeItem(salt, PR_TRUE);
        return NULL;
    }

    PK11_GenerateRandom(salt->data, salt->len);

    return salt;
}

SGNDigestInfo *
sec_pkcs12_compute_thumbprint(SECItem *der_cert)
{
    SGNDigestInfo *thumb = NULL;
    SECItem digest;
    PLArenaPool *temparena = NULL;
    SECStatus rv = SECFailure;

    if (der_cert == NULL)
        return NULL;

    temparena = PORT_NewArena(SEC_ASN1_DEFAULT_ARENA_SIZE);
    if (temparena == NULL) {
        return NULL;
    }

    digest.data = (unsigned char *)PORT_ArenaZAlloc(temparena,
                                                    sizeof(unsigned char) *
                                                        SHA1_LENGTH);
    /* digest data and create digest info */
    if (digest.data != NULL) {
        digest.len = SHA1_LENGTH;
        rv = PK11_HashBuf(SEC_OID_SHA1, digest.data, der_cert->data,
                          der_cert->len);
        if (rv == SECSuccess) {
            thumb = SGN_CreateDigestInfo(SEC_OID_SHA1,
                                         digest.data,
                                         digest.len);
        } else {
            PORT_SetError(SEC_ERROR_NO_MEMORY);
        }
    } else {
        PORT_SetError(SEC_ERROR_NO_MEMORY);
    }

    PORT_FreeArena(temparena, PR_TRUE);

    return thumb;
}

PRBool
sec_pkcs12_convert_item_to_unicode(PLArenaPool *arena, SECItem *dest,
                                   SECItem *src, PRBool zeroTerm,
                                   PRBool asciiConvert, PRBool toUnicode)
{
    PRBool success = PR_FALSE;
    int bufferSize;

    if (!src || !dest) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return PR_FALSE;
    }

    bufferSize = src->len * 3 + 2;
    dest->len = bufferSize;
    if (arena) {
        dest->data = (unsigned char *)PORT_ArenaZAlloc(arena, dest->len);
    } else {
        dest->data = (unsigned char *)PORT_ZAlloc(dest->len);
    }

    if (!dest->data) {
        dest->len = 0;
        return PR_FALSE;
    }

    if (!asciiConvert) {
        success = PORT_UCS2_UTF8Conversion(toUnicode, src->data, src->len, dest->data,
                                           dest->len, &dest->len);
    } else {
#ifndef IS_LITTLE_ENDIAN
        PRBool swapUnicode = PR_FALSE;
#else
        PRBool swapUnicode = PR_TRUE;
#endif
        success = PORT_UCS2_ASCIIConversion(toUnicode, src->data, src->len, dest->data,
                                            dest->len, &dest->len, swapUnicode);
    }

    if (!success) {
        if (!arena) {
            PORT_Free(dest->data);
            dest->data = NULL;
            dest->len = 0;
        }
        return PR_FALSE;
    }

    /* in some cases we need to add NULL terminations and in others
     * we need to drop null terminations */
    if (zeroTerm) {
        /* unicode adds two nulls at the end */
        if (toUnicode) {
            if ((dest->len < 2) || dest->data[dest->len - 1] || dest->data[dest->len - 2]) {
                /* we've already allocated space for these new NULLs */
                PORT_Assert(dest->len + 2 <= bufferSize);
                dest->len += 2;
                dest->data[dest->len - 1] = dest->data[dest->len - 2] = 0;
            }
            /* ascii/utf-8 adds just 1 */
        } else if (!dest->len || dest->data[dest->len - 1]) {
            PORT_Assert(dest->len + 1 <= bufferSize);
            dest->len++;
            dest->data[dest->len - 1] = 0;
        }
    } else {
        /* handle the drop case, no need to do any allocations here. */
        if (toUnicode) {
            while ((dest->len >= 2) && !dest->data[dest->len - 1] &&
                   !dest->data[dest->len - 2]) {
                dest->len -= 2;
            }
        } else {
            while (dest->len && !dest->data[dest->len - 1]) {
                dest->len--;
            }
        }
    }

    return PR_TRUE;
}

PRBool
sec_pkcs12_is_pkcs12_pbe_algorithm(SECOidTag algorithm)
{
    switch (algorithm) {
        case SEC_OID_PKCS12_V2_PBE_WITH_SHA1_AND_3KEY_TRIPLE_DES_CBC:
        case SEC_OID_PKCS12_V2_PBE_WITH_SHA1_AND_2KEY_TRIPLE_DES_CBC:
        case SEC_OID_PKCS12_PBE_WITH_SHA1_AND_TRIPLE_DES_CBC:
        case SEC_OID_PKCS12_PBE_WITH_SHA1_AND_40_BIT_RC2_CBC:
        case SEC_OID_PKCS12_PBE_WITH_SHA1_AND_128_BIT_RC2_CBC:
        case SEC_OID_PKCS12_V2_PBE_WITH_SHA1_AND_128_BIT_RC2_CBC:
        case SEC_OID_PKCS12_V2_PBE_WITH_SHA1_AND_40_BIT_RC2_CBC:
        case SEC_OID_PKCS12_PBE_WITH_SHA1_AND_40_BIT_RC4:
        case SEC_OID_PKCS12_PBE_WITH_SHA1_AND_128_BIT_RC4:
        case SEC_OID_PKCS12_V2_PBE_WITH_SHA1_AND_128_BIT_RC4:
        case SEC_OID_PKCS12_V2_PBE_WITH_SHA1_AND_40_BIT_RC4:
        /* those are actually PKCS #5 v1.5 PBEs, but we
         * historically treat them in the same way as PKCS #12
         * PBEs */
        case SEC_OID_PKCS5_PBE_WITH_MD2_AND_DES_CBC:
        case SEC_OID_PKCS5_PBE_WITH_SHA1_AND_DES_CBC:
        case SEC_OID_PKCS5_PBE_WITH_MD5_AND_DES_CBC:
            return PR_TRUE;
        default:
            return PR_FALSE;
    }
}

/* this function decodes a password from Unicode if necessary,
 * according to the PBE algorithm.
 *
 * we assume that the pwitem is already encoded in Unicode by the
 * caller.  if the encryption scheme is not the one defined in PKCS
 * #12, decode the pwitem back into UTF-8. NOTE: UTF-8 strings are
 * used in the PRF without the trailing NULL */
PRBool
sec_pkcs12_decode_password(PLArenaPool *arena,
                           SECItem *result,
                           SECOidTag algorithm,
                           const SECItem *pwitem)
{
    if (!sec_pkcs12_is_pkcs12_pbe_algorithm(algorithm))
        return sec_pkcs12_convert_item_to_unicode(arena, result,
                                                  (SECItem *)pwitem,
                                                  PR_FALSE, PR_FALSE, PR_FALSE);

    return SECITEM_CopyItem(arena, result, pwitem) == SECSuccess;
}

/* this function encodes a password into Unicode if necessary,
 * according to the PBE algorithm.
 *
 * we assume that the pwitem holds a raw password.  if the encryption
 * scheme is the one defined in PKCS #12, encode the password into
 * BMPString. */
PRBool
sec_pkcs12_encode_password(PLArenaPool *arena,
                           SECItem *result,
                           SECOidTag algorithm,
                           const SECItem *pwitem)
{
    if (sec_pkcs12_is_pkcs12_pbe_algorithm(algorithm))
        return sec_pkcs12_convert_item_to_unicode(arena, result,
                                                  (SECItem *)pwitem,
                                                  PR_TRUE, PR_TRUE, PR_TRUE);

    return SECITEM_CopyItem(arena, result, pwitem) == SECSuccess;
}
