/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Header file for routines specific to S/MIME.  Keep things that are pure
 * pkcs7 out of here; this is for S/MIME policy, S/MIME interoperability, etc.
 */

#ifndef _SECMIME_H_
#define _SECMIME_H_ 1

#include "secpkcs7.h"

/************************************************************************/
SEC_BEGIN_PROTOS

/*
 * Does the current policy allow S/MIME decryption of this particular
 * algorithm and keysize?
 */
extern PRBool SECMIME_DecryptionAllowed(SECAlgorithmID *algid, PK11SymKey *key);

/************************************************************************/
SEC_END_PROTOS

#endif /* _SECMIME_H_ */
