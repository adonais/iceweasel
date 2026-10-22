/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Stuff specific to S/MIME policy and interoperability.
 * Depends on PKCS7, but there should be no dependency the other way around.
 */

#include "secmime.h"
#include "secoid.h"
#include "pk11func.h"
#include "ciferfam.h" /* for CIPHER_FAMILY symbols */
#include "secasn1.h"
#include "secitem.h"
#include "cert.h"
#include "keyhi.h"
#include "secerr.h"

static unsigned long smime_policy_bits = 0;

/*
 * Based on the given algorithm (including its parameters, in some cases!)
 * and the given key (may or may not be inspected, depending on the
 * algorithm), find the appropriate policy algorithm specification
 * and return it.  If no match can be made, -1 is returned.
 */
static long
smime_policy_algorithm(SECAlgorithmID *algid, PK11SymKey *key)
{
    SECOidTag algtag;

    algtag = SECOID_GetAlgorithmTag(algid);
    switch (algtag) {
        case SEC_OID_RC2_CBC: {
            unsigned int keylen_bits;

            keylen_bits = PK11_GetKeyStrength(key, algid);
            switch (keylen_bits) {
                case 40:
                    return SMIME_RC2_CBC_40;
                case 64:
                    return SMIME_RC2_CBC_64;
                case 128:
                    return SMIME_RC2_CBC_128;
                default:
                    break;
            }
        } break;
        case SEC_OID_DES_CBC:
            return SMIME_DES_CBC_56;
        case SEC_OID_DES_EDE3_CBC:
            return SMIME_DES_EDE3_168;
        default:
            break;
    }

    return -1;
}

static PRBool
smime_cipher_allowed(unsigned long which)
{
    unsigned long mask;

    which &= ~CIPHER_FAMILYID_MASK;
    PORT_Assert(which < 32); /* bits per long (min) */
    if (which >= 32)
        return PR_FALSE;

    mask = 1UL << which;
    if ((mask & smime_policy_bits) == 0)
        return PR_FALSE;

    return PR_TRUE;
}

PRBool
SECMIME_DecryptionAllowed(SECAlgorithmID *algid, PK11SymKey *key)
{
    long which;

    which = smime_policy_algorithm(algid, key);
    if (which < 0)
        return PR_FALSE;

    return smime_cipher_allowed((unsigned long)which);
}
