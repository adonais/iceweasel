/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <getopt.h>

#if defined(MOZ_ASAN) || defined(FUZZING)
#  include <signal.h>
#endif

#ifdef MOZ_WAYLAND
#  include <gdk/gdk.h>
#endif

int glxtest(bool aWayland, int aOutputFd);

#ifdef MOZ_ENABLE_VAAPI
int vaapitest(const char* aDrmDevice);
#endif

#ifdef MOZ_ENABLE_V4L2
int v4l2test(const char* aDevice);
#endif

#ifdef MOZ_ENABLE_VULKAN_VIDEO
int vulkantest(const char* aDrmDevice);
#endif

static void PrintUsage() {
  printf(
      "Firefox graphics probe utility\n"
      "\n"
      "usage: gfxtest <command> [options]\n"
      "\n"
      "Commands:\n"
      "\n"
      "  glx [-f fd] [-w]          probe OpenGL/EGL capabilities\n"
#ifdef MOZ_ENABLE_VAAPI
      "  vaapi -d <drm_device>     probe VA-API video decode/encode\n"
#endif
#ifdef MOZ_ENABLE_V4L2
      "  v4l2 -d <device>          probe V4L2-M2M video decode\n"
#endif
#ifdef MOZ_ENABLE_VULKAN_VIDEO
      "  vulkan [-d <drm_device>]  probe Vulkan video decode\n"
#endif
      "\n");
}

static int RunGlx(int argc, char** argv) {
  struct option longOptions[] = {{"help", no_argument, nullptr, 'h'},
                                 {"fd", required_argument, nullptr, 'f'},
                                 {"wayland", no_argument, nullptr, 'w'},
                                 {nullptr, 0, nullptr, 0}};
  int c;
  optind = 1;
  bool wayland = false;
  int outputFd = 1;
  while ((c = getopt_long(argc, argv, "hf:w", longOptions, nullptr)) != -1) {
    switch (c) {
      case 'w':
        wayland = true;
        break;
      case 'f':
        outputFd = atoi(optarg);
        break;
      case 'h':
#ifdef MOZ_WAYLAND
        // Dummy call to mozgtk to prevent the linker from removing
        // the dependency with --as-needed.
        // see toolkit/library/moz.build for details.
        gdk_display_get_default();
#endif
        PrintUsage();
        return 0;
      default:
        break;
    }
  }
  return glxtest(wayland, outputFd);
}

#ifdef MOZ_ENABLE_VAAPI
static int RunVaapi(int argc, char** argv) {
  struct option longOptions[] = {{"help", no_argument, nullptr, 'h'},
                                 {"drm", required_argument, nullptr, 'd'},
                                 {nullptr, 0, nullptr, 0}};
  int c;
  optind = 1;
  const char* drmDevice = nullptr;
  while ((c = getopt_long(argc, argv, "hd:", longOptions, nullptr)) != -1) {
    switch (c) {
      case 'd':
        drmDevice = optarg;
        break;
      case 'h':
        PrintUsage();
        return 0;
      default:
        break;
    }
  }
  if (!drmDevice) {
    PrintUsage();
    return 1;
  }
  return vaapitest(drmDevice);
}
#endif

#ifdef MOZ_ENABLE_V4L2
static int RunV4l2(int argc, char** argv) {
  struct option longOptions[] = {{"help", no_argument, nullptr, 'h'},
                                 {"device", required_argument, nullptr, 'd'},
                                 {nullptr, 0, nullptr, 0}};
  int c;
  optind = 1;
  const char* device = nullptr;
  while ((c = getopt_long(argc, argv, "hd:", longOptions, nullptr)) != -1) {
    switch (c) {
      case 'd':
        device = optarg;
        break;
      case 'h':
        PrintUsage();
        return 0;
      default:
        break;
    }
  }
  if (!device) {
    PrintUsage();
    return 1;
  }
  return v4l2test(device);
}
#endif

#ifdef MOZ_ENABLE_VULKAN_VIDEO
static int RunVulkan(int argc, char** argv) {
  struct option longOptions[] = {{"help", no_argument, nullptr, 'h'},
                                 {"probe", no_argument, nullptr, 'p'},
                                 {"drm", required_argument, nullptr, 'd'},
                                 {nullptr, 0, nullptr, 0}};
  int c;
  optind = 1;
  bool doProbe = false;
  const char* drmDevice = nullptr;
  while ((c = getopt_long(argc, argv, "hpd:", longOptions, nullptr)) != -1) {
    switch (c) {
      case 'p':
        doProbe = true;
        break;
      case 'd':
        doProbe = true;
        drmDevice = optarg;
        break;
      case 'h':
        PrintUsage();
        return 0;
      default:
        break;
    }
  }
  if (!doProbe && optind >= argc) {
    PrintUsage();
    return 1;
  }
  return vulkantest(drmDevice);
}
#endif

int main(int argc, char** argv) {
  if (argc < 2) {
    PrintUsage();
    return 1;
  }

#if defined(MOZ_ASAN) || defined(FUZZING)
  signal(SIGSEGV, SIG_DFL);
#endif

  // Shift command line params
  argc--;
  argv++;
  const char* cmd = argv[0];
  if (!strcmp(cmd, "glx")) {
    return RunGlx(argc, argv);
  }
#ifdef MOZ_ENABLE_VAAPI
  if (!strcmp(cmd, "vaapi")) {
    return RunVaapi(argc, argv);
  }
#endif
#ifdef MOZ_ENABLE_V4L2
  if (!strcmp(cmd, "v4l2")) {
    return RunV4l2(argc, argv);
  }
#endif
#ifdef MOZ_ENABLE_VULKAN_VIDEO
  if (!strcmp(cmd, "vulkan")) {
    return RunVulkan(argc, argv);
  }
#endif

  fprintf(stderr, "gfxtest: unknown command '%s'\n", cmd);
  PrintUsage();
  return 1;
}
