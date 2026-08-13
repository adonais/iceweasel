/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * CMS AuthEnvelopedData methods (RFC 5083).
 */

#include "cmslocal.h"

#include <limits.h>
#include "cert.h"
#include "secasn1.h"
#include "secitem.h"
#include "secoid.h"
#include "pk11func.h"
#include "secerr.h"

void
NSS_CMSAuthEnvelopedData_Destroy(NSSCMSAuthEnvelopedData *authenvd)
{
    NSSCMSRecipientInfo **recipientinfos;
    NSSCMSRecipientInfo *ri;

    if (authenvd == NULL)
        return;

    recipientinfos = authenvd->recipientInfos;
    while (recipientinfos && (ri = *recipientinfos++) != NULL)
        NSS_CMSRecipientInfo_Destroy(ri);

    NSS_CMSContentInfo_Destroy(&(authenvd->contentInfo));
}

NSSCMSContentInfo *
NSS_CMSAuthEnvelopedData_GetContentInfo(NSSCMSAuthEnvelopedData *authenvd)
{
    return &(authenvd->contentInfo);
}

SECStatus
NSS_CMSAuthEnvelopedData_Decode_BeforeData(NSSCMSAuthEnvelopedData *authenvd)
{
    PK11SymKey *bulkkey = NULL;
    SECOidTag bulkalgtag;
    SECStatus rv = SECFailure;
    NSSCMSContentInfo *cinfo;
    NSSCMSRecipient **recipient_list = NULL;
    NSSCMSRecipient *recipient;
    NSSCMSRecipientInfo *ri;
    int rlIndex;

    if (NSS_CMSArray_Count((void **)authenvd->recipientInfos) == 0) {
        PORT_SetError(SEC_ERROR_BAD_DATA);
        goto loser;
    }

    recipient_list = nss_cms_recipient_list_create(authenvd->recipientInfos);
    if (recipient_list == NULL)
        goto loser;

    rlIndex = PK11_FindCertAndKeyByRecipientListNew(recipient_list,
                                                    authenvd->cmsg->pwfn_arg);
    if (rlIndex < 0) {
        PORT_SetError(SEC_ERROR_NOT_A_RECIPIENT);
        goto loser;
    }

    recipient = recipient_list[rlIndex];
    if (!recipient->cert || !recipient->privkey)
        goto loser;

    ri = authenvd->recipientInfos[recipient->riIndex];
    cinfo = &(authenvd->contentInfo);
    bulkalgtag = NSS_CMSContentInfo_GetContentEncAlgTag(cinfo);
    if (bulkalgtag == SEC_OID_UNKNOWN) {
        PORT_SetError(SEC_ERROR_INVALID_ALGORITHM);
    } else {
        bulkkey = NSS_CMSRecipientInfo_UnwrapBulkKey(ri, recipient->subIndex,
                                                     recipient->cert,
                                                     recipient->privkey,
                                                     bulkalgtag);
    }
    if (bulkkey == NULL)
        goto loser;

    NSS_CMSContentInfo_SetBulkKey(cinfo, bulkkey);
    rv = SECSuccess;

loser:
    if (bulkkey)
        PK11_FreeSymKey(bulkkey);
    if (recipient_list != NULL)
        nss_cms_recipient_list_destroy(recipient_list);
    return rv;
}

/*
 * One-shot AEAD decryption. Appends mac to rawContent ciphertext,
 * calls PK11_Decrypt, replaces rawContent with plaintext.
 */
SECStatus
NSS_CMSAuthEnvelopedData_Decode_AfterEnd(NSSCMSAuthEnvelopedData *authenvd)
{
    NSSCMSContentInfo *cinfo;
    PK11SymKey *bulkkey;
    SECAlgorithmID *bulkalg;
    SECItem *rawContent;
    SECItem *macItem;
    CK_MECHANISM_TYPE mech;
    SECItem *param = NULL;
    unsigned char *input = NULL;
    unsigned int inputLen;
    unsigned char *output = NULL;
    unsigned int outputLen = 0;
    SECStatus rv = SECFailure;

    if (authenvd == NULL)
        return SECFailure;

    cinfo = &(authenvd->contentInfo);
    bulkkey = cinfo->bulkkey;
    if (bulkkey == NULL)
        return SECFailure;

    bulkalg = NSS_CMSContentInfo_GetContentEncAlg(cinfo);
    rawContent = cinfo->rawContent;
    macItem = &(authenvd->mac);

    if (!bulkalg || !rawContent || !macItem->data || !macItem->len) {
        PORT_SetError(SEC_ERROR_BAD_DATA);
        return SECFailure;
    }
    /* Zero-length ciphertext is permitted (AEAD over empty plaintext);
     * reject only inconsistent SECItem (len > 0 with NULL data). */
    if (rawContent->len > 0 && rawContent->data == NULL) {
        PORT_SetError(SEC_ERROR_BAD_DATA);
        return SECFailure;
    }

    /* RFC 5083: content encryption algorithm must be AEAD */
    SECOidTag algtag = SECOID_GetAlgorithmTag(bulkalg);
    if (!PK11_IsAEAD(PK11_AlgtagToMechanism(algtag))) {
        PORT_SetError(SEC_ERROR_INVALID_ALGORITHM);
        return SECFailure;
    }

    /* PK11 verifies the GCM tag only if appended to the ciphertext */
    if (rawContent->len > UINT_MAX - macItem->len) {
        PORT_SetError(SEC_ERROR_BAD_DATA);
        return SECFailure;
    }
    inputLen = rawContent->len + macItem->len;
    input = (unsigned char *)PORT_Alloc(inputLen);
    if (!input)
        return SECFailure;
    if (rawContent->len > 0) {
        PORT_Memcpy(input, rawContent->data, rawContent->len);
    }
    PORT_Memcpy(input + rawContent->len, macItem->data, macItem->len);

    mech = PK11_AlgtagToMechanism(algtag);
    param = PK11_ParamFromAlgid(bulkalg);
    if (!param)
        goto loser;

    {
        CK_NSS_GCM_PARAMS *gcm = (CK_NSS_GCM_PARAMS *)param->data;
        /* Reject messages with a nonce shorter than 8 bytes out of precaution;
         * RFC 5084 s3.2 RECOMMENDS 12 bytes. */
        if (!gcm->pIv || gcm->ulIvLen < 8) {
            PORT_SetError(SEC_ERROR_INVALID_ALGORITHM);
            goto loser;
        }
        /* RFC 5084: mac length must match ICVlen from algorithm parameters */
        if (macItem->len != gcm->ulTagBits / 8) {
            PORT_SetError(SEC_ERROR_BAD_DATA);
            goto loser;
        }
    }

    /* RFC 5083 s2.1: authAttrs MUST be present unless the encapsulated
     * content type is id-data. */
    if (!authenvd->authAttrs &&
        NSS_CMSContentInfo_GetContentTypeTag(cinfo) != SEC_OID_PKCS7_DATA) {
        PORT_SetError(SEC_ERROR_BAD_DATA);
        goto loser;
    }

    /* RFC 5083: authAttrs are DER-encoded with SET OF tag as AAD */
    if (authenvd->authAttrs) {
        SECItem aad = { siBuffer, NULL, 0 };
        if (NSS_CMSAttributeArray_Encode(authenvd->cmsg->poolp,
                                         &authenvd->authAttrs, &aad) == NULL) {
            goto loser;
        }
        CK_NSS_GCM_PARAMS *gcm = (CK_NSS_GCM_PARAMS *)param->data;
        gcm->pAAD = aad.data;
        gcm->ulAADLen = aad.len;
    }

    output = (unsigned char *)PORT_ArenaAlloc(authenvd->cmsg->poolp, inputLen);
    if (!output)
        goto loser;

    rv = PK11_Decrypt(bulkkey, mech, param,
                      output, &outputLen, inputLen,
                      input, inputLen);
    if (rv != SECSuccess) {
        PORT_Memset(output, 0, inputLen);
        goto loser;
    }

    rawContent->data = output;
    rawContent->len = outputLen;

loser:
    PORT_Free(input);
    if (param)
        SECITEM_FreeItem(param, PR_TRUE);
    return rv;
}
