/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test PR_GetPrefLoopbackAddrInfo().
 *
 * The returned PRNetAddr must describe the loopback address with the
 * requested port, and every byte past the address family's sockaddr must
 * be zeroed -- callers compare and hash whole PRNetAddr structures, so
 * leftover bytes there are a bug.
 */

#include "nspr.h"

#include <stdio.h>
#include <string.h>

#define TEST_PORT 4242

int
main(int argc, char** argv)
{
    PRNetAddr addr;
    char buf[128];
    PRUint32 i, addrlen, junk = 0;
    PRUint16 port;

    /*
     * Poison the buffer first: anything the callee fails to write or zero
     * stays visible as 0xAB.
     */
    memset(&addr, 0xAB, sizeof(addr));

    if (PR_GetPrefLoopbackAddrInfo(&addr, TEST_PORT) != PR_SUCCESS) {
        /*
         * PR_GetPrefLoopbackAddrInfo is a stub on platforms built without
         * getaddrinfo() or AI_PASSIVE -- Windows, where the md headers only
         * pull in Winsock 1's <winsock.h>. Nothing to test there.
         */
        if (PR_GetError() == PR_NOT_IMPLEMENTED_ERROR) {
            printf("PR_GetPrefLoopbackAddrInfo not implemented, skipping\n");
            return 0;
        }
        fprintf(stderr, "PR_GetPrefLoopbackAddrInfo failed: (%d, %d)\n",
                PR_GetError(), PR_GetOSError());
        return 1;
    }

    if (addr.raw.family != PR_AF_INET && addr.raw.family != PR_AF_INET6) {
        fprintf(stderr, "unexpected address family %d\n", addr.raw.family);
        return 1;
    }

    if (PR_NetAddrToString(&addr, buf, sizeof(buf)) != PR_SUCCESS) {
        fprintf(stderr, "PR_NetAddrToString failed: (%d, %d)\n", PR_GetError(),
                PR_GetOSError());
        return 1;
    }

    port = (addr.raw.family == PR_AF_INET6) ? addr.ipv6.port : addr.inet.port;
    printf("family = %d, addr = %s, port = %u\n", addr.raw.family, buf,
           PR_ntohs(port));

    if (!PR_IsNetAddrType(&addr, PR_IpAddrLoopback)) {
        fprintf(stderr, "%s is not the loopback address\n", buf);
        return 1;
    }

    if (PR_ntohs(port) != TEST_PORT) {
        fprintf(stderr, "expected port %d, got %u\n", TEST_PORT, PR_ntohs(port));
        return 1;
    }

    addrlen = (addr.raw.family == PR_AF_INET6) ? sizeof(addr.ipv6)
                                               : sizeof(addr.inet);
    for (i = addrlen; i < sizeof(addr); i++) {
        if (((unsigned char*)&addr)[i] != 0) {
            junk++;
        }
    }
    if (junk != 0) {
        fprintf(stderr, "%u non-zero byte(s) past offset %u of %u\n", junk,
                addrlen, (PRUint32)sizeof(addr));
        return 1;
    }

    printf("PASS\n");
    return 0;
}
