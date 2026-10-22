/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef _XCONST_H_
#define _XCONST_H_

#include "certt.h"

typedef struct CERTAltNameEncodedContextStr {
    SECItem **encodedGenName;
} CERTAltNameEncodedContext;

SEC_BEGIN_PROTOS

extern SECStatus CERT_EncodeNameConstraintsExtension(PLArenaPool *arena,
                                                     CERTNameConstraints *value,
                                                     SECItem *encodedValue);

SECStatus cert_EncodeAuthInfoAccessExtension(PLArenaPool *arena,
                                             CERTAuthInfoAccess **info,
                                             SECItem *dest);
SEC_END_PROTOS
#endif
