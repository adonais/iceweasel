/* -*- Mode: C; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/*
 * TLS 1.3 Protocol
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "keyhi.h"
#include "pk11func.h"
#include "secitem.h"
#include "ssl.h"
#include "sslt.h"
#include "sslerr.h"
#include "sslimpl.h"

/* This table contains the mapping between TLS hash identifiers and the
 * PKCS#11 identifiers */
static const struct {
    SSLHashType hash;
    CK_MECHANISM_TYPE pkcs11Mech;
    unsigned int hashSize;
} kTlsHkdfInfo[] = {
    { ssl_hash_none, 0, 0 },
    { ssl_hash_md5, 0, 0 },
    { ssl_hash_sha1, 0, 0 },
    { ssl_hash_sha224, 0 },
    { ssl_hash_sha256, CKM_SHA256, 32 },
    { ssl_hash_sha384, CKM_SHA384, 48 },
    { ssl_hash_sha512, CKM_SHA512, 64 }
};

SECStatus
tls13_HkdfExtract(PK11SymKey *ikm1, PK11SymKey *ikm2, SSLHashType baseHash,
                  PK11SymKey **prkp)
{
    CK_HKDF_PARAMS params;
    SECItem paramsi;
    PK11SymKey *prk;
    static const PRUint8 zeroKeyBuf[HASH_LENGTH_MAX];
    SECItem zeroKeyItem = { siBuffer, CONST_CAST(PRUint8, zeroKeyBuf), kTlsHkdfInfo[baseHash].hashSize };
    static const PRUint8 zeroSaltBuf[HASH_LENGTH_MAX];
    SECItem zeroSaltItem = { siBuffer, CONST_CAST(PRUint8, zeroSaltBuf), kTlsHkdfInfo[baseHash].hashSize };
    PK11SlotInfo *slot = NULL;
    PK11SymKey *newIkm2 = NULL;
    PK11SymKey *movedIkm1 = NULL;
    PK11SymKey *movedIkm2 = NULL;
    SECStatus rv;

    if (!prkp) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }

    params.bExtract = CK_TRUE;
    params.bExpand = CK_FALSE;
    params.prfHashMechanism = kTlsHkdfInfo[baseHash].pkcs11Mech;
    params.pInfo = NULL;
    params.ulInfoLen = 0UL;
    params.pSalt = NULL;
    params.ulSaltLen = 0UL;
    params.hSaltKey = CK_INVALID_HANDLE;
    params.ulSaltType = 0;

    CK_OBJECT_CLASS ikm2Class = CKO_DATA; /* in case we don't have it we create one of CKO_DATA type */

    if (ikm2) {
        /* Get the object class of the key(ikm2) */
        SECItem classItem = { siBuffer, NULL, 0 };
        rv = PK11_ReadRawAttribute(PK11_TypeSymKey, ikm2, CKA_CLASS, &classItem);
        if (rv != SECSuccess || classItem.len != sizeof(CK_OBJECT_CLASS)) {
            SECITEM_FreeItem(&classItem, PR_FALSE);
            goto cleanup;
        }
        memcpy(&ikm2Class, classItem.data, sizeof(ikm2Class));
        SECITEM_FreeItem(&classItem, PR_FALSE);
    } else {
        /* A zero ikm2 is a key of hash-length 0s. */
        /* if we have ikm1, put the zero key in the same slot */
        if (ikm1) {
            slot = PK11_GetSlotFromKey(ikm1);
        }

        if (!slot || PK11_DoesMechanism(slot, CKM_HKDF_DERIVE) == PR_FALSE) {
            /* fallback if ikm1 is not provided or the slot doesn't support the mechanism*/
            if (slot) {
                PK11_FreeSlot(slot);
            }
            slot = PK11_GetBestSlot(CKM_HKDF_DERIVE, NULL);
        }

        if (!slot) {
            rv = SECFailure;
            goto cleanup;
        }

        newIkm2 = PK11_ImportDataKey(slot, CKM_HKDF_DERIVE, PK11_OriginUnwrap,
                                     CKA_DERIVE, &zeroKeyItem, NULL);
        if (!newIkm2) {
            rv = SECFailure;
            goto cleanup;
        }
        ikm2 = newIkm2;
    }
    PORT_Assert(ikm2);

    if (!ikm1) {
        if (ikm2Class == CKO_DATA) {
            /* since PKCS #11 v3.0 it is mandatory to provide CKF_HKDF_SALT_DATA
             * if key(ikm2) is of type CKO_DATA. see. Section 6.62.3 */
            params.pSalt = zeroSaltItem.data;
            params.ulSaltLen = zeroSaltItem.len;
            params.ulSaltType = CKF_HKDF_SALT_DATA;
        } else {
            /* PKCS #11 v3.0 has and explict NULL value, which equates to
             * a sequence of zeros equal in length to the HMAC. */
            params.ulSaltType = CKF_HKDF_SALT_NULL;
        }
    } else {
        /* PKCS #11 v3.0 can take the salt as a key handle */
        rv = PK11_SymKeysToSameSlot(CKM_HKDF_DERIVE,
                                    CKA_DERIVE, CKA_DERIVE,
                                    ikm2, ikm1, &movedIkm2, &movedIkm1);

        if (rv != SECSuccess) {
            /* couldn't move the keys, try extracting the salt */
            SECItem *salt;
            rv = PK11_ExtractKeyValue(ikm1);
            if (rv != SECSuccess) {
                goto cleanup;
            }
            salt = PK11_GetKeyData(ikm1);
            if (!salt) {
                rv = SECFailure;
                goto cleanup;
            }
            PORT_Assert(salt->len > 0);
            /* Set up for Salt as Data instead of Salt as key */
            params.pSalt = salt->data;
            params.ulSaltLen = salt->len;
            params.ulSaltType = CKF_HKDF_SALT_DATA;
        } else {
            /* use the moved keys */
            if (movedIkm1) {
                ikm1 = movedIkm1;
            }
            if (movedIkm2) {
                ikm2 = movedIkm2;
            }

            params.hSaltKey = PK11_GetSymKeyHandle(ikm1);
            params.ulSaltType = CKF_HKDF_SALT_KEY;
        }
    }

    paramsi.data = (unsigned char *)&params;
    paramsi.len = sizeof(params);

    PORT_Assert(kTlsHkdfInfo[baseHash].pkcs11Mech);
    PORT_Assert(kTlsHkdfInfo[baseHash].hashSize);
    PORT_Assert(kTlsHkdfInfo[baseHash].hash == baseHash);

    if (params.ulSaltType == CKF_HKDF_SALT_DATA) {
        PORT_Assert(params.hSaltKey == CK_INVALID_HANDLE);
        PORT_Assert(params.pSalt != NULL);
    }
    if (params.ulSaltType == CKF_HKDF_SALT_NULL) {
        PORT_Assert(ikm2Class != CKO_DATA);
        PORT_Assert(params.hSaltKey == CK_INVALID_HANDLE);
        PORT_Assert(params.pSalt == NULL);
        PORT_Assert(params.ulSaltLen == 0UL);
    }
    if (params.ulSaltType == CKF_HKDF_SALT_KEY) {
        PORT_Assert(params.hSaltKey != CK_INVALID_HANDLE);
        PORT_Assert(params.pSalt == NULL);
        PORT_Assert(params.ulSaltLen == 0UL);
    }

    PRINT_BUF(50, (NULL, "HKDF Extract: IKM1/Salt", params.pSalt, params.ulSaltLen));
    PRINT_KEY(50, (NULL, "HKDF Extract: IKM2", ikm2));

    prk = PK11_Derive(ikm2, CKM_HKDF_DERIVE, &paramsi, CKM_HKDF_DERIVE,
                      CKA_DERIVE, 0);

    if (!prk) {
        rv = SECFailure;
        goto cleanup;
    }

    PRINT_KEY(50, (NULL, "HKDF Extract", prk));
    *prkp = prk;
    rv = SECSuccess;

cleanup:
    PK11_FreeSymKey(movedIkm1);
    PK11_FreeSymKey(movedIkm2);
    PK11_FreeSymKey(newIkm2);
    if (slot)
        PK11_FreeSlot(slot);
    return rv;
}

SECStatus
tls13_HkdfExpandLabelGeneral(CK_MECHANISM_TYPE deriveMech, PK11SymKey *prk,
                             SSLHashType baseHash,
                             const PRUint8 *handshakeHash, unsigned int handshakeHashLen,
                             const char *label, unsigned int labelLen,
                             CK_MECHANISM_TYPE algorithm, unsigned int keySize,
                             SSLProtocolVariant variant, PK11SymKey **keyp)
{
    CK_HKDF_PARAMS params;
    SECItem paramsi = { siBuffer, NULL, 0 };
    /* Size of info array needs to be big enough to hold the maximum Prefix,
     * Label, plus HandshakeHash. If it's ever to small, the code will abort.
     */
    PRUint8 info[256];
    sslBuffer infoBuf = SSL_BUFFER(info);
    PK11SymKey *derived;
    SECStatus rv;
    const char *kLabelPrefixTls = "tls13 ";
    const char *kLabelPrefixDtls = "dtls13";
    const unsigned int kLabelPrefixLen =
        (variant == ssl_variant_stream) ? strlen(kLabelPrefixTls) : strlen(kLabelPrefixDtls);
    const char *kLabelPrefix =
        (variant == ssl_variant_stream) ? kLabelPrefixTls : kLabelPrefixDtls;
    CK_FLAGS flags = 0;
    CK_KEY_TYPE targetKeyType = PK11_GetKeyType(algorithm, keySize);

    /* PKCS #11 Mechanisms v3.0 Sec 2.62.4: CKM_HKDF_DATA outputs CKO_DATA.
     * Sec 4.5.2: CKO_DATA objects cannot hold crypto operation flags */
    if (deriveMech != CKM_HKDF_DATA) {
        flags |= CKF_SIGN | CKF_VERIFY;

        /* PKCS #11 v3.0 Sec 2.8.2: CKK_GENERIC_SECRET and CKK_HKDF
         * explicitly do not support encrypt/decrypt operations. */
        if (targetKeyType != CKK_GENERIC_SECRET && targetKeyType != CKK_HKDF) {
            flags |= CKF_ENCRYPT | CKF_DECRYPT;
        }
    }

    PORT_Assert(prk);
    PORT_Assert(keyp);
    if ((handshakeHashLen > 255) ||
        (handshakeHash == NULL && handshakeHashLen > 0) ||
        (labelLen > 255 - kLabelPrefixLen)) {
        PORT_SetError(SEC_ERROR_INVALID_ARGS);
        return SECFailure;
    }

    /*
     *  [draft-ietf-tls-tls13-11] Section 7.1:
     *
     *  HKDF-Expand-Label(Secret, Label, HashValue, Length) =
     *       HKDF-Expand(Secret, HkdfLabel, Length)
     *
     *  Where HkdfLabel is specified as:
     *
     *  struct HkdfLabel {
     *    uint16 length;
     *    opaque label<9..255>;
     *    opaque hash_value<0..255>;
     *  };
     *
     *  Where:
     *  - HkdfLabel.length is Length
     *  - HkdfLabel.hash_value is HashValue.
     *  - HkdfLabel.label is "TLS 1.3, " + Label
     *
     */
    rv = sslBuffer_AppendNumber(&infoBuf, keySize, 2);
    if (rv != SECSuccess) {
        return SECFailure;
    }
    rv = sslBuffer_AppendNumber(&infoBuf, labelLen + kLabelPrefixLen, 1);
    if (rv != SECSuccess) {
        return SECFailure;
    }
    rv = sslBuffer_Append(&infoBuf, kLabelPrefix, kLabelPrefixLen);
    if (rv != SECSuccess) {
        return SECFailure;
    }
    rv = sslBuffer_Append(&infoBuf, label, labelLen);
    if (rv != SECSuccess) {
        return SECFailure;
    }
    rv = sslBuffer_AppendVariable(&infoBuf, handshakeHash, handshakeHashLen, 1);
    if (rv != SECSuccess) {
        return SECFailure;
    }

    params.bExtract = CK_FALSE;
    params.bExpand = CK_TRUE;
    params.prfHashMechanism = kTlsHkdfInfo[baseHash].pkcs11Mech;
    params.pInfo = SSL_BUFFER_BASE(&infoBuf);
    params.ulInfoLen = SSL_BUFFER_LEN(&infoBuf);
    paramsi.data = (unsigned char *)&params;
    paramsi.len = sizeof(params);
    derived = PK11_DeriveWithFlags(prk, deriveMech,
                                   &paramsi, algorithm,
                                   CKA_DERIVE, keySize,
                                   flags);
    if (!derived) {
        return SECFailure;
    }

    *keyp = derived;

#ifdef TRACE
    if (ssl_trace >= 50) {
        /* Make sure the label is null terminated. */
        char labelStr[100];
        PORT_Memcpy(labelStr, label, labelLen);
        labelStr[labelLen] = 0;
        SSL_TRC(50, ("HKDF Expand: label='tls13 %s',requested length=%d",
                     labelStr, keySize));
    }
    PRINT_KEY(50, (NULL, "PRK", prk));
    PRINT_BUF(50, (NULL, "Hash", handshakeHash, handshakeHashLen));
    PRINT_BUF(50, (NULL, "Info", SSL_BUFFER_BASE(&infoBuf),
                   SSL_BUFFER_LEN(&infoBuf)));
    PRINT_KEY(50, (NULL, "Derived key", derived));
#endif

    return SECSuccess;
}

SECStatus
tls13_HkdfExpandLabel(PK11SymKey *prk, SSLHashType baseHash,
                      const PRUint8 *handshakeHash, unsigned int handshakeHashLen,
                      const char *label, unsigned int labelLen,
                      CK_MECHANISM_TYPE algorithm, unsigned int keySize,
                      SSLProtocolVariant variant, PK11SymKey **keyp)
{
    return tls13_HkdfExpandLabelGeneral(CKM_HKDF_DERIVE, prk, baseHash,
                                        handshakeHash, handshakeHashLen,
                                        label, labelLen, algorithm, keySize,
                                        variant, keyp);
}

SECStatus
tls13_HkdfExpandLabelRaw(PK11SymKey *prk, SSLHashType baseHash,
                         const PRUint8 *handshakeHash, unsigned int handshakeHashLen,
                         const char *label, unsigned int labelLen,
                         SSLProtocolVariant variant, unsigned char *output,
                         unsigned int outputLen)
{
    PK11SymKey *derived = NULL;
    SECItem *rawkey;
    SECStatus rv;

    /* the result is not really a key, it's a data object */
    rv = tls13_HkdfExpandLabelGeneral(CKM_HKDF_DATA, prk, baseHash,
                                      handshakeHash, handshakeHashLen,
                                      label, labelLen, CKM_HKDF_DERIVE, outputLen,
                                      variant, &derived);
    if (rv != SECSuccess || !derived) {
        goto abort;
    }

    rv = PK11_ExtractKeyValue(derived);
    if (rv != SECSuccess) {
        goto abort;
    }

    rawkey = PK11_GetKeyData(derived);
    if (!rawkey) {
        goto abort;
    }

    PORT_Assert(rawkey->len == outputLen);
    memcpy(output, rawkey->data, outputLen);
    PK11_FreeSymKey(derived);

    return SECSuccess;

abort:
    if (derived) {
        PK11_FreeSymKey(derived);
    }
    PORT_SetError(SSL_ERROR_SYM_KEY_CONTEXT_FAILURE);
    return SECFailure;
}
