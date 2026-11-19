/* cairo - a vector graphics library with display and print output
 *
 * Copyright © 2026 Luca Bacci
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
 * Foundation, Inc., 31 Milk Street, #960789 Boston, MA 02196, USA.
 * You should have received a copy of the MPL along with this library
 * in the file COPYING-MPL-1.1
 *
 * The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * https://www.mozilla.org/MPL/
 *
 * This software is distributed on an "AS IS" basis, WITHOUT WARRANTY
 * OF ANY KIND, either express or implied. See the LGPL or the MPL for
 * the specific language governing rights and limitations.
 *
 * The Original Code is the cairo graphics library.
 *
 * Contributor(s):
 *      Luca Bacci <luca.bacci@outlook.com>
 */

#include "cairoint.h"

#include "cairo-array-private.h"
#include "cairo-win32-private.h"

#include <windows.h>
#include <stdlib.h>
#include <malloc.h>
#include <assert.h>

#if (defined (__GNUC__) && !defined (__clang__))
    /* Prefer explicit TLS for mingw-w64 GCC — EmuTLS has
     * some issues and adds a dependency on libwinpthreads:
     *
     *    https://github.com/msys2/MINGW-packages/issues/22917
     *    https://github.com/msys2/MINGW-packages/issues/2519#issuecomment-304155278
     *    https://gitlab.freedesktop.org/pixman/pixman/-/merge_requests/61
     *    https://gcc.gnu.org/bugzilla/show_bug.cgi?id=80881
     */
#define USE_EXPLICIT_TLS
#endif

#ifdef USE_EXPLICIT_TLS
static DWORD
tls_index = TLS_OUT_OF_INDEXES;
#else
static _Thread_local
cairo_win32_thread_data_t thread_data;
#endif

SRWLOCK thread_data_list_lock = SRWLOCK_INIT;
cairo_array_t thread_data_list;

/* Could use hardware_destructive_interference_size in C++17
 * or query at runtime. A modicum value works anyway, and we
 * actually have init-only members in cairo_win32_thread_data
 */
const size_t CACHE_LINE_SIZE = 128;

#ifdef USE_EXPLICIT_TLS

static cairo_win32_thread_data_t *
thread_data_allocation_new (void)
{
    cairo_win32_thread_data_t *data;

    data = _aligned_malloc (sizeof (cairo_win32_thread_data_t), CACHE_LINE_SIZE);
    assert (data != NULL);
    memset (data, 0, sizeof (cairo_win32_thread_data_t));

    return data;
}

static void
thread_data_allocation_free (cairo_win32_thread_data_t *data)
{
    _aligned_free (data);
}

#endif /* USE_EXPLICIT_TLS */

static void
thread_data_free (cairo_win32_thread_data_t *data)
{
    /* Loader-lock-safe */

    if (data->free_hdc) {
        /* Delete the HDC explicitly only if it was created via a non-NULL
         * reference HDC. Otherwise the system deletes it automatically on
         * thread-exit and our asynchronous delete would be racy. For more
         * informations, refer to the MSDN docs for CreateCompatibleDC.
         */
        void *free_func = DeleteDC;
        cairo_win32_async_stdcall_free (free_func, data->hdc);
    }

#if CAIRO_HAS_DWRITE_FONT
    /* It's not clear if we can release DWrite objects from DllMain
     * or in general while holding the loader lock. For one, this
     * is not allowed for DXGI factories (refer to "DXGI responses
     * from DLLMain" in MSDN's "DXGI Overview"). Use an asynchronous
     * release to ensure safety.
     */
    cairo_win32_async_com_release ((IUnknown*) data->d2d1_factory);
#endif

#ifdef USE_EXPLICIT_TLS
    thread_data_allocation_free (data);
#endif
}

static cairo_win32_thread_data_t *
thread_data_retrieve (cairo_bool_t ensure_allocation)
{
#ifdef USE_EXPLICIT_TLS
    cairo_win32_thread_data_t *data = TlsGetValue (tls_index);
    if (ensure_allocation && !data) {
        data = thread_data_allocation_new ();
        TlsSetValue (tls_index, data);
    }

    return data;
#else
    return &thread_data;
#endif
}

void
cairo_win32_thread_data_initialize (void)
{
#ifdef USE_EXPLICIT_TLS
    assert(tls_index == TLS_OUT_OF_INDEXES);

    if ((tls_index = TlsAlloc ()) == TLS_OUT_OF_INDEXES)
        assert (0 && "TlsAlloc failed");
#endif

    _cairo_array_init (&thread_data_list, sizeof (cairo_win32_thread_data_t *));
}

void
cairo_win32_thread_data_finalize (void)
{
    for (unsigned int i = 0; i < _cairo_array_num_elements (&thread_data_list); i++) {
        cairo_win32_thread_data_t **p_data = _cairo_array_index (&thread_data_list, i);
        thread_data_free (*p_data);
    }

    _cairo_array_fini (&thread_data_list);

#ifdef USE_EXPLICIT_TLS
    TlsFree (tls_index);
#endif
}

cairo_win32_thread_data_t *
cairo_win32_thread_data_get (void)
{
    cairo_win32_thread_data_t *data = thread_data_retrieve (TRUE);

    if (!data->added_to_list) {
        AcquireSRWLockExclusive (&thread_data_list_lock);

        data->added_to_list = TRUE;
        if (_cairo_array_append (&thread_data_list, &data) != CAIRO_STATUS_SUCCESS)
            abort ();

        ReleaseSRWLockExclusive (&thread_data_list_lock);
    }

    return data;
}

void
cairo_win32_thread_data_free (void)
{
    cairo_win32_thread_data_t *data = thread_data_retrieve (FALSE);

#ifdef USE_EXPLICIT_TLS
    if (!data)
        return;
#endif

    if (data->added_to_list) {
        cairo_win32_thread_data_t **iter;
        unsigned int num_elements;
        unsigned int i;

        AcquireSRWLockExclusive (&thread_data_list_lock);

        iter = (cairo_win32_thread_data_t **) _cairo_array_index (&thread_data_list, 0);
        num_elements = _cairo_array_num_elements (&thread_data_list);

        for (i = 0; i < num_elements; i++) {
            if (iter[i] == data) {
                cairo_win32_thread_data_t *aux;

                _cairo_array_pop_element (&thread_data_list, &aux);
                if (i < num_elements - 1)
                    iter[i] = aux;
                break;
            }
        }
        assert (i < num_elements);

        ReleaseSRWLockExclusive (&thread_data_list_lock);
    }

    thread_data_free (data);
}
