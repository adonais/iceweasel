/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:expandtab:shiftwidth=4:tabstop=4:
 */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "prlink.h"

#include <xf86drm.h>

#define GET_FUNC(func, lib)                                  \
    func##_fn =                                              \
      (decltype(func##_fn))PR_FindFunctionSymbol(lib, #func) \

#define IS_FUNC_LOADED(func)                                          \
    (func != nullptr)                                                 \

static int (*drmGetDevices2_fn)(uint32_t flags, drmDevicePtr devices[], int max_devices);
static void (*drmFreeDevices_fn)(drmDevicePtr devices[], int count);
static int (*drmGetDevice_fn)(int fd, drmDevicePtr *device);
static void (*drmFreeDevice_fn)(drmDevicePtr *device);

bool IsDRMLibraryLoaded() {
  static bool isLoaded =
         (IS_FUNC_LOADED(drmGetDevices2_fn) &&
          IS_FUNC_LOADED(drmFreeDevices_fn));

  return isLoaded;
}

bool LoadDRMLibrary() {
  static PRLibrary* drmLib = nullptr;
  static bool drmInitialized = false;

  //TODO Thread safe
  if (!drmInitialized) {
    drmInitialized = true;
    drmLib = PR_LoadLibrary("libdrm.so.2");
    if (!drmLib) {
      return false;
    }

    GET_FUNC(drmGetDevices2, drmLib);
    GET_FUNC(drmFreeDevices, drmLib);
    GET_FUNC(drmGetDevice, drmLib);
    GET_FUNC(drmFreeDevice, drmLib);
  }

  return IsDRMLibraryLoaded();
}

int
drmGetDevices2(uint32_t flags, drmDevicePtr devices[], int max_devices)
{
  if (!LoadDRMLibrary()) {
    return 0;
  }
  return drmGetDevices2_fn(flags, devices, max_devices);
}

void
drmFreeDevices(drmDevicePtr devices[], int count)
{
  if (!LoadDRMLibrary()) {
    return;
  }
  return drmFreeDevices_fn(devices, count);
}

int
drmGetDevice(int fd, drmDevicePtr *device)
{
  if (!LoadDRMLibrary() || !drmGetDevice_fn) {
    return -1;
  }
  return drmGetDevice_fn(fd, device);
}

void
drmFreeDevice(drmDevicePtr *device)
{
  if (!LoadDRMLibrary() || !drmFreeDevice_fn) {
    return;
  }
  drmFreeDevice_fn(device);
}
