/* -*- Mode: c; tab-width: 8; c-basic-offset: 4; indent-tabs-mode: t; -*- */
/* Cairo - a vector graphics library with display and print output
 *
 * Copyright © 2005 Red Hat, Inc.
 *
 * This library is free software; you can redistribute it and/or
 * modify it either under the terms of the GNU Lesser General Public
 * License version 2.1 as published by the Free Software Foundation
 * (the "LGPL") or, at your option, under the terms of the Mozilla
 * Public License Version 1.1 (the "MPL"). If you do not alter this
 * notice, a recipient may use your version of this file under either
 * the MPL or the LGPL.
 *
 * You should have received a copy of the LGPL along with this library
 * in the file COPYING-LGPL-2.1; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Suite 500, Boston, MA 02110-1335, USA
 * You should have received a copy of the MPL along with this library
 * in the file COPYING-MPL-1.1
 *
 * The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * This software is distributed on an "AS IS" basis, WITHOUT WARRANTY
 * OF ANY KIND, either express or implied. See the LGPL or the MPL for
 * the specific language governing rights and limitations.
 *
 * The Original Code is the cairo graphics library.
 *
 * The Initial Developer of the Original Code is Red Hat, Inc.
 *
 * Contributor(s):
 *	Owen Taylor <otaylor@redhat.com>
 *	Stuart Parmenter <stuart@mozilla.com>
 *	Vladimir Vukicevic <vladimir@pobox.com>
 */

/* This file should include code that is system-specific, not
 * feature-specific.  For example, the DLL initialization/finalization
 * code on Win32 or OS/2 must live here (not in cairo-whatever-surface.c).
 * Same about possible ELF-specific code.
 *
 * And no other function should live here.
 */

#include "cairoint.h"

#include "cairo-win32-private.h"

#include <windows.h>

#include <stdbool.h>

typedef HRESULT (__stdcall *pCoIncrementMTAUsage_t) (CO_MTA_USAGE_COOKIE*);
typedef HRESULT (__stdcall *pCoDecrementMTAUsage_t) (CO_MTA_USAGE_COOKIE);

static struct {
    cairo_atomic_once_t once;

    struct {
        CO_MTA_USAGE_COOKIE cookie;
        bool cookie_is_set;
        pCoDecrementMTAUsage_t pCoDecrementMTAUsage;
    } mta_usage;
    HANDLE thread;
} mta =
{
    CAIRO_ATOMIC_ONCE_INIT,
    { 0, false, NULL },
    NULL,
};

/**
 * _cairo_win32_print_api_error:
 * @context: context string to display along with the error
 * @api: name of the failing api
 *
 * Helper function to dump out a human readable form of the
 * current error code.
 *
 * Return value: A cairo status code for the error code
 **/
cairo_status_t
_cairo_win32_print_api_error (const char *context, const char *api)
{
    const DWORD lang_id = MAKELANGID (LANG_NEUTRAL, SUBLANG_DEFAULT);
    const DWORD flags = FORMAT_MESSAGE_ALLOCATE_BUFFER |
                        FORMAT_MESSAGE_IGNORE_INSERTS |
                        FORMAT_MESSAGE_FROM_SYSTEM;
    const DWORD last_error = GetLastError ();
    void *lpMsgBuf = NULL;

    if (!FormatMessageW (flags, NULL, last_error, lang_id, (LPWSTR) &lpMsgBuf, 0, NULL)) {
       fprintf (stderr, "%s: %s failed with error code %lu\n", context, api, last_error);
    }
    else {
       fprintf (stderr, "%s: %s failed - %S\n", context, api, (wchar_t *)lpMsgBuf);
       LocalFree (lpMsgBuf);
    }

    return _cairo_error (CAIRO_STATUS_WIN32_GDI_ERROR);
}

/**
 * _cairo_win32_load_library_from_system32:
 * @name: name of the module to load from System32
 *
 * Helper function to load system modules in the System32
 * folder.
 *
 * Return value: An module HANDLE, NULL on error.
 **/
HMODULE
_cairo_win32_load_library_from_system32 (const wchar_t *name)
{
    HMODULE module_handle;

    module_handle = LoadLibraryExW (name, NULL, LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (module_handle == NULL) {
        DWORD code = GetLastError();
        if (code == ERROR_INVALID_PARAMETER) {
            /* Support for flag LOAD_LIBRARY_SEARCH_SYSTEM32 was backported
             * to Windows Vista / 7 with Update KB2533623. If the flag is
             * not supported, simply use LoadLibrary */
            return LoadLibraryW (name);
        }
    }

    return module_handle;
}

static DWORD __stdcall
mta_thread_main (void *user_data)
{
    HRESULT hr;

    hr = CoInitializeEx (NULL, COINIT_MULTITHREADED | COINIT_DISABLE_OLE1DDE);
    assert (SUCCEEDED (hr));

    HANDLE event = (HANDLE) user_data;
    if (!SignalObjectAndWait (event, GetCurrentProcess (), INFINITE, FALSE)) {
        assert (0 && "SignalObjectAndWait failed");
    }

    return 0;
}

/**
 * cairo_win32_ensure_mta:
 *
 * Ensures that the MTA is initialized and keeps running in this
 * process. Helps for COM usage on threads that we don't own,
 * since we don't have to call CoInitializeEx.
 **/
void
cairo_win32_ensure_mta (void)
{
    if (_cairo_atomic_init_once_enter (&mta.once)) {
        HMODULE ole32 = _cairo_win32_load_library_from_system32 (L"OLE32.DLL");

        /* Windows 8+ */
        if (ole32) {
            pCoIncrementMTAUsage_t pCoIncrementMTAUsage =
                (pCoIncrementMTAUsage_t) GetProcAddress (ole32, "CoIncrementMTAUsage");
            pCoDecrementMTAUsage_t pCoDecrementMTAUsage =
                (pCoDecrementMTAUsage_t) GetProcAddress (ole32, "CoDecrementMTAUsage");

            if (pCoIncrementMTAUsage && pCoDecrementMTAUsage &&
                SUCCEEDED (pCoIncrementMTAUsage (&mta.mta_usage.cookie)))
            {
                mta.mta_usage.cookie_is_set = true;
                mta.mta_usage.pCoDecrementMTAUsage = pCoDecrementMTAUsage;
            }
        }

        /* Downlevel support for Windows 7 */
        if (!mta.mta_usage.cookie_is_set) {
            HANDLE event = CreateEvent (NULL, TRUE, FALSE, NULL);
            if (!event) {
                assert (0 && "CreateEvent failed");
            }

            /* Since the UCRT _beginthreadex takes a reference on the "calling
             * HMODULE", which makes Cairo unloadable. Use CreateThread.
             */
            mta.thread = CreateThread (NULL, 0, mta_thread_main, event, 0, NULL);
            if (!mta.thread) {
                assert (0 && "_beginthreadex failed");
            }

            DWORD ret = WaitForSingleObject (event, INFINITE);
            if (ret != WAIT_OBJECT_0) {
                assert (0 && "WaitForSingleObject failed");
            }

            CloseHandle (event);
        }

        _cairo_atomic_init_once_leave (&mta.once);
    }
}

static void
cairo_win32_mta_finalize (void)
{
    /* Loader-lock-safe */

    if (_cairo_atomic_init_once_check (&mta.once)) {
        if (mta.mta_usage.cookie_is_set) {
            void *free_func = mta.mta_usage.pCoDecrementMTAUsage;
            cairo_win32_async_stdcall_free (free_func, mta.mta_usage.cookie);
        }
        else if (mta.thread) {
            /* Yeah, TerminateThread is generally unsafe. however, this is synchronized
             * with entering of kernel-mode (SignalObjectAndWait) and thus is completely
             * safe. Note also that TerminateThread is asynchronous, so it can be used
             * from DllMain.
             */
            TerminateThread (mta.thread, 0);
            CloseHandle (mta.thread);
        }
    }
}

void
cairo_win32_async_stdcall_free (stdcall_free_func_t func, void *data)
{
    QueueUserWorkItem (func, data, WT_EXECUTEDEFAULT);
}

void
cairo_win32_async_com_release (IUnknown *iface_ptr)
{
    if (iface_ptr) {
        QueueUserWorkItem ((void *) iface_ptr->lpVtbl->Release,
                           iface_ptr, WT_EXECUTEDEFAULT);
    }
}

static void
cairo_win32_initialize (void)
{
    CAIRO_MUTEX_INITIALIZE ();
    cairo_win32_thread_data_initialize ();
}

static void
cairo_win32_finalize (void)
{
    cairo_win32_dwrite_finalize ();
    cairo_win32_thread_data_finalize ();
    cairo_win32_mta_finalize ();
    CAIRO_MUTEX_FINALIZE ();
}

static void NTAPI
cairo_win32_tls_callback (PVOID hinstance, DWORD dwReason, PVOID lpvReserved)
{
    switch (dwReason) {
        case DLL_PROCESS_ATTACH:
            cairo_win32_initialize ();
            break;

        case DLL_THREAD_DETACH:
            cairo_win32_thread_data_free ();
            break;

        case DLL_PROCESS_DETACH:
            if (lpvReserved != NULL)
                break;
            cairo_win32_finalize ();
            break;
    }
}

#ifdef _MSC_VER

#ifdef _M_IX86
# define SYMBOL_PREFIX "_"
#else
# define SYMBOL_PREFIX ""
#endif

#ifdef __cplusplus
# define EXTERN_C_BEGIN extern "C" {
# define EXTERN_C_END }
# define EXTERN_CONST extern const
#else
# define EXTERN_C_BEGIN
# define EXTERN_C_END
# define EXTERN_CONST const
#endif

#define DEFINE_TLS_CALLBACK(func) \
__pragma (section (".CRT$XLD", long, read))                          \
                                                                     \
static void NTAPI func (PVOID, DWORD, PVOID);                        \
                                                                     \
EXTERN_C_BEGIN                                                       \
__declspec (allocate (".CRT$XLD"))                                   \
EXTERN_CONST PIMAGE_TLS_CALLBACK _ptr_##func = func;                 \
EXTERN_C_END                                                         \
                                                                     \
__pragma (comment (linker, "/INCLUDE:" SYMBOL_PREFIX "_tls_used"))   \
__pragma (comment (linker, "/INCLUDE:" SYMBOL_PREFIX "_ptr_" #func))

#else /* _MSC_VER */

#define DEFINE_TLS_CALLBACK(func) \
static void NTAPI func (PVOID, DWORD, PVOID);        \
                                                     \
__attribute__ ((used, section (".CRT$XLD")))         \
static const PIMAGE_TLS_CALLBACK _ptr_##func = func;


#endif /* !_MSC_VER */

DEFINE_TLS_CALLBACK (cairo_win32_tls_callback);
