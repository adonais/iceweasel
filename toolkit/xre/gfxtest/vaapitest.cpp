/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <cstdlib>
#include <dlfcn.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>
#include <unistd.h>

#include "mozilla/ScopeExit.h"
#include "prlink.h"
#include "va/va.h"

#include "mozilla/GfxInfoUtils.h"

#define MIN(a, b) ((a) < (b) ? (a) : (b))

// bits to use decoding vaapi_probe() return values.
constexpr int CODEC_HW_DEC_H264 = 1 << 4;
constexpr int CODEC_HW_ENC_H264 = 1 << 5;
constexpr int CODEC_HW_DEC_VP8 = 1 << 6;
constexpr int CODEC_HW_ENC_VP8 = 1 << 7;
constexpr int CODEC_HW_DEC_VP9 = 1 << 8;
constexpr int CODEC_HW_ENC_VP9 = 1 << 9;
constexpr int CODEC_HW_DEC_AV1 = 1 << 10;
constexpr int CODEC_HW_ENC_AV1 = 1 << 11;
constexpr int CODEC_HW_DEC_HEVC = 1 << 12;
constexpr int CODEC_HW_ENC_HEVC = 1 << 13;

// childgltest is declared inside extern "C" so that the name is not mangled.
// The name is used in build/valgrind/x86_64-pc-linux-gnu.sup to suppress
// memory leak errors because we run it inside a short lived fork and we don't
// care about leaking memory
extern "C" {

static constexpr struct {
  VAProfile mVAProfile;
  const char* mName;
} kVAAPiProfileName[] = {
#define MAP(v) {VAProfile##v, #v}
    MAP(H264ConstrainedBaseline),
    MAP(H264Main),
    MAP(H264High),
    MAP(VP8Version0_3),
    MAP(VP9Profile0),
    MAP(VP9Profile2),
    MAP(AV1Profile0),
    MAP(AV1Profile1),
    MAP(HEVCMain),
    MAP(HEVCMain10),
    MAP(HEVCMain12),
#undef MAP
};

static const char* VAProfileName(VAProfile aVAProfile) {
  for (const auto& profile : kVAAPiProfileName) {
    if (profile.mVAProfile == aVAProfile) {
      return profile.mName;
    }
  }
  return nullptr;
}

static void vaapi_probe(const char* aRenderDevicePath) {
  int renderDeviceFD = -1;
  VAProfile* profiles = nullptr;
  VAEntrypoint* entryPoints = nullptr;
  VADisplay display = nullptr;
  void* libDrm = nullptr;

  log("vaapitest start, device %s\n", aRenderDevicePath);

  auto autoRelease = mozilla::MakeScopeExit([&] {
    free(profiles);
    free(entryPoints);
    if (display) {
      vaTerminate(display);
    }
    if (libDrm) {
      dlclose(libDrm);
    }
    if (renderDeviceFD > -1) {
      close(renderDeviceFD);
    }
  });

  renderDeviceFD = open(aRenderDevicePath, O_RDWR);
  if (renderDeviceFD == -1) {
    record_error("VA-API test failed: failed to open renderDeviceFD.");
    return;
  }

  libDrm = dlopen("libva-drm.so.2", RTLD_LAZY);
  if (!libDrm) {
    log("vaapitest failed: libva-drm.so.2 is missing\n");
    return;
  }

  static auto sVaGetDisplayDRM =
      (void* (*)(int fd))dlsym(libDrm, "vaGetDisplayDRM");
  if (!sVaGetDisplayDRM) {
    record_error("VA-API test failed: sVaGetDisplayDRM is missing.");
    return;
  }

  display = sVaGetDisplayDRM(renderDeviceFD);
  if (!display) {
    record_error("VA-API test failed: vaGetDisplayDRM failed.");
    return;
  }

  int major, minor;
  VAStatus status = vaInitialize(display, &major, &minor);
  if (status != VA_STATUS_SUCCESS) {
    log("vaInitialize failed %d\n", status);
    return;
  } else {
    log("vaInitialize finished\n");
  }

  int maxProfiles = vaMaxNumProfiles(display);
  int maxEntryPoints = vaMaxNumEntrypoints(display);
  if (maxProfiles <= 0 || maxEntryPoints <= 0) {
    record_error("VA-API test failed: wrong VAAPI profiles/entry point nums.");
    return;
  }

  profiles = (VAProfile*)malloc(sizeof(VAProfile) * maxProfiles);
  int numProfiles = 0;
  status = vaQueryConfigProfiles(display, profiles, &numProfiles);
  if (status != VA_STATUS_SUCCESS) {
    record_error("VA-API test failed: vaQueryConfigProfiles() failed.");
    return;
  }
  numProfiles = MIN(numProfiles, maxProfiles);

  entryPoints = (VAEntrypoint*)malloc(sizeof(VAEntrypoint) * maxEntryPoints);
  int codecs = 0;
  bool foundProfile = false;
  for (int p = 0; p < numProfiles; p++) {
    VAProfile profile = profiles[p];

    // Check only supported profiles
    if (!VAProfileName(profile)) {
      continue;
    }

    int numEntryPoints = 0;
    status = vaQueryConfigEntrypoints(display, profile, entryPoints,
                                      &numEntryPoints);
    if (status != VA_STATUS_SUCCESS) {
      continue;
    }
    numEntryPoints = MIN(numEntryPoints, maxEntryPoints);
    for (int entry = 0; entry < numEntryPoints; entry++) {
      bool decoder = entryPoints[entry] == VAEntrypointVLD;
      bool encoder = entryPoints[entry] == VAEntrypointEncSlice;
      if (!decoder && !encoder) {
        continue;
      }
      VAConfigID config = VA_INVALID_ID;
      status = vaCreateConfig(display, profile, entryPoints[entry], nullptr, 0,
                              &config);
      if (status == VA_STATUS_SUCCESS) {
        const char* profstr = VAProfileName(profile);
        log("Profile: %s\n", profstr);
        // VAProfileName returns null on failure, making the below calls safe
        if (!strncmp(profstr, "H264", 4)) {
          codecs |= decoder ? CODEC_HW_DEC_H264 : CODEC_HW_ENC_H264;
        } else if (!strncmp(profstr, "VP8", 3)) {
          codecs |= decoder ? CODEC_HW_DEC_VP8 : CODEC_HW_ENC_VP8;
        } else if (!strncmp(profstr, "VP9", 3)) {
          codecs |= decoder ? CODEC_HW_DEC_VP9 : CODEC_HW_ENC_VP9;
        } else if (!strncmp(profstr, "AV1", 3)) {
          codecs |= decoder ? CODEC_HW_DEC_AV1 : CODEC_HW_ENC_AV1;
        } else if (!strncmp(profstr, "HEVC", 4)) {
          codecs |= decoder ? CODEC_HW_DEC_HEVC : CODEC_HW_ENC_HEVC;
        } else {
          record_warning("VA-API test unknown profile.");
        }
        vaDestroyConfig(display, config);
        foundProfile = true;
      }
    }
  }
  if (foundProfile) {
    record_value("VAAPI_SUPPORTED\nTRUE\n");
    record_value("VAAPI_HWCODECS\n%d\n", codecs);
  } else {
    record_value("VAAPI_SUPPORTED\nFALSE\n");
  }
  log("vaapitest finished\n");
}

}  // extern "C"

int vaapitest(const char* aDrmDevice) {
  const char* env = getenv("MOZ_GFX_DEBUG");
  enable_logging = env && *env == '1';
  if (!enable_logging) {
    close_logging();
  }
  vaapi_probe(aDrmDevice);
  record_flush();
  return EXIT_SUCCESS;
}
