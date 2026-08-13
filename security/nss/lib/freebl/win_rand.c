/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "secrng.h"

#ifdef XP_WIN
#include <windows.h>
#include <time.h>

#include "secerr.h"
#include "prinit.h"

static BOOL
CurrentClockTickTime(LPDWORD lpdwHigh, LPDWORD lpdwLow)
{
    LARGE_INTEGER liCount;

    if (!QueryPerformanceCounter(&liCount))
        return FALSE;

    *lpdwHigh = liCount.u.HighPart;
    *lpdwLow = liCount.u.LowPart;
    return TRUE;
}

size_t
RNG_GetNoise(void *buf, size_t maxbuf)
{
    DWORD dwHigh, dwLow, dwVal;
    int n = 0;
    int nBytes;
    time_t sTime;

    if (maxbuf <= 0)
        return 0;

    CurrentClockTickTime(&dwHigh, &dwLow);

    // get the maximally changing bits first
    nBytes = sizeof(dwLow) > maxbuf ? maxbuf : sizeof(dwLow);
    memcpy((char *)buf, &dwLow, nBytes);
    n += nBytes;
    maxbuf -= nBytes;

    if (maxbuf <= 0)
        return n;

    nBytes = sizeof(dwHigh) > maxbuf ? maxbuf : sizeof(dwHigh);
    memcpy(((char *)buf) + n, &dwHigh, nBytes);
    n += nBytes;
    maxbuf -= nBytes;

    if (maxbuf <= 0)
        return n;

    // get the number of milliseconds that have elapsed since Windows started
    dwVal = GetTickCount();

    nBytes = sizeof(dwVal) > maxbuf ? maxbuf : sizeof(dwVal);
    memcpy(((char *)buf) + n, &dwVal, nBytes);
    n += nBytes;
    maxbuf -= nBytes;

    if (maxbuf <= 0)
        return n;

    // get the time in seconds since midnight Jan 1, 1970
    time(&sTime);
    nBytes = sizeof(sTime) > maxbuf ? maxbuf : sizeof(sTime);
    memcpy(((char *)buf) + n, &sTime, nBytes);
    n += nBytes;

    return n;
}

void
RNG_SystemInfoForRNG(void)
{
    DWORD dwVal;
    char buffer[256];
    int nBytes;
    MEMORYSTATUS sMem;
    HANDLE hVal;
    DWORD dwSerialNum;
    DWORD dwComponentLen;
    DWORD dwSysFlags;
    char volName[128];
    DWORD dwSectors, dwBytes, dwFreeClusters, dwNumClusters;

    nBytes = RNG_GetNoise(buffer, 20); // get up to 20 bytes
    RNG_RandomUpdate(buffer, nBytes);

    sMem.dwLength = sizeof(sMem);
    GlobalMemoryStatus(&sMem); // assorted memory stats
    RNG_RandomUpdate(&sMem, sizeof(sMem));

    dwVal = GetLogicalDrives();
    RNG_RandomUpdate(&dwVal, sizeof(dwVal)); // bitfields in bits 0-25

    dwVal = sizeof(buffer);
    if (GetComputerName(buffer, &dwVal))
        RNG_RandomUpdate(buffer, dwVal);

    hVal = GetCurrentProcess(); // 4 or 8 byte pseudo handle (a
                                // constant!) of current process
    RNG_RandomUpdate(&hVal, sizeof(hVal));

    dwVal = GetCurrentProcessId(); // process ID (4 bytes)
    RNG_RandomUpdate(&dwVal, sizeof(dwVal));

    dwVal = GetCurrentThreadId(); // thread ID (4 bytes)
    RNG_RandomUpdate(&dwVal, sizeof(dwVal));

    volName[0] = '\0';
    buffer[0] = '\0';
    GetVolumeInformation(NULL,
                         volName,
                         sizeof(volName),
                         &dwSerialNum,
                         &dwComponentLen,
                         &dwSysFlags,
                         buffer,
                         sizeof(buffer));

    RNG_RandomUpdate(volName, strlen(volName));
    RNG_RandomUpdate(&dwSerialNum, sizeof(dwSerialNum));
    RNG_RandomUpdate(&dwComponentLen, sizeof(dwComponentLen));
    RNG_RandomUpdate(&dwSysFlags, sizeof(dwSysFlags));
    RNG_RandomUpdate(buffer, strlen(buffer));

    if (GetDiskFreeSpace(NULL, &dwSectors, &dwBytes, &dwFreeClusters,
                         &dwNumClusters)) {
        RNG_RandomUpdate(&dwSectors, sizeof(dwSectors));
        RNG_RandomUpdate(&dwBytes, sizeof(dwBytes));
        RNG_RandomUpdate(&dwFreeClusters, sizeof(dwFreeClusters));
        RNG_RandomUpdate(&dwNumClusters, sizeof(dwNumClusters));
    }

    nBytes = RNG_GetNoise(buffer, 20); // get up to 20 bytes
    RNG_RandomUpdate(buffer, nBytes);
}

/*
 * The RtlGenRandom function is declared in <ntsecapi.h>, but the
 * declaration is missing a calling convention specifier. So we
 * declare it manually here.
 */
#define RtlGenRandom SystemFunction036
DECLSPEC_IMPORT BOOLEAN WINAPI RtlGenRandom(
    PVOID RandomBuffer,
    ULONG RandomBufferLength);

typedef BOOL(WINAPI *pProcessPrng)(PBYTE, SIZE_T);

static PRCallOnceType coProcessPrngInit;
static pProcessPrng sProcessPrng = NULL;

static PRStatus
LoadProcessPrng(void)
{
    // Using LOAD_LIBRARY_SEARCH_SYSTEM32 will fail on earlier windows, but
    // only on versions where ProcessPrng wouldn't be available anyway.
    HMODULE hmod = LoadLibraryExW(L"bcryptprimitives.dll", NULL,
                                  LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!hmod) {
        return PR_FAILURE;
    }

    sProcessPrng = (pProcessPrng)GetProcAddress(hmod, "ProcessPrng");
    if (!sProcessPrng) {
        FreeLibrary(hmod);
        return PR_FAILURE;
    }

    return PR_SUCCESS;
}

static BOOL
CallProcessPrng(PBYTE pbData, SIZE_T cbData)
{
    if (!sProcessPrng &&
        PR_CallOnce(&coProcessPrngInit, LoadProcessPrng) != PR_SUCCESS) {
        // PR_CallOnce leaves PR_CALL_ONCE_ERROR in TLS, clear it so callers
        // don't see a spurious error if the RtlGenRandom fallback succeeds.
        PORT_SetError(0);
        return FALSE;
    }

    return sProcessPrng(pbData, cbData);
}

size_t
RNG_SystemRNG(void *dest, size_t maxLen)
{
    size_t bytes = 0;

    // Fall back to RtlGenRandom for pre Windows 8.
    if (CallProcessPrng(dest, maxLen) ||
        (maxLen <= PR_UINT32_MAX && RtlGenRandom(dest, (ULONG)maxLen))) {
        bytes = maxLen;
    } else {
        PORT_SetError(SEC_ERROR_NEED_RANDOM);
    }

    return bytes;
}
#endif /* is XP_WIN */
