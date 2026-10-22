/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "prerror.h"
#include "secder.h"
#include "secport.h"

SECStatus
DER_Lengths(SECItem *item, int *header_len_p, PRUint32 *contents_len_p)
{
    PORT_SetError(PR_NOT_IMPLEMENTED_ERROR);
    return SECFailure;
}
