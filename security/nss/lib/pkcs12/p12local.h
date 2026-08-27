/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _P12LOCAL_H_
#define _P12LOCAL_H_

#include "plarena.h"
#include "secoidt.h"
#include "secasn1.h"
#include "secder.h"
#include "certt.h"
#include "secpkcs7.h"
#include "p12.h"

/* helper functions */
extern SECItem *sec_pkcs12_generate_salt(void);
PK11SymKey *sec_pkcs12_integrity_key(PK11SlotInfo *slot,
                                     sec_PKCS12MacData *macData,
                                     SECItem *pwitem,
                                     CK_MECHANISM_TYPE *hmacMech,
                                     PRBool isDecrypt,
                                     void *pwarg);
extern SGNDigestInfo *sec_pkcs12_compute_thumbprint(SECItem *der_cert);
extern PRBool sec_pkcs12_convert_item_to_unicode(PLArenaPool *arena, SECItem *dest,
                                                 SECItem *src, PRBool zeroTerm,
                                                 PRBool asciiConvert, PRBool toUnicode);
extern CK_MECHANISM_TYPE sec_pkcs12_algtag_to_mech(SECOidTag algtag);
extern CK_MECHANISM_TYPE sec_pkcs12_algtag_to_keygen_mech(SECOidTag algtag);

extern PRBool sec_pkcs12_is_pkcs12_pbe_algorithm(SECOidTag algorithm);

extern PRBool sec_pkcs12_decode_password(PLArenaPool *arena,
                                         SECItem *result,
                                         SECOidTag algorithm,
                                         const SECItem *pwitem);
extern PRBool sec_pkcs12_encode_password(PLArenaPool *arena,
                                         SECItem *result,
                                         SECOidTag algorithm,
                                         const SECItem *pwitem);

#endif
