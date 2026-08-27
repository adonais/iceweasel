#!/bin/bash
set -x -e -v

TARGET=$1
. $GECKO_PATH/taskcluster/scripts/misc/vs-setup.sh

cd $MOZ_FETCHES_DIR/make

chmod +w src/config.h.W32
patch src/config.h.W32 > src/config.h <<'EOF'
--- src/config.h.W32	2023-01-09 00:45:24.000000000 +0900
+++ src/config.h	2026-08-05 17:45:14.815508283 +0900
@@ -162,9 +162,7 @@
 /* #undef HAVE_ICONV */

 /* Define to 1 if you have the <inttypes.h> header file. */
-#ifdef __MINGW32__
 #define HAVE_INTTYPES_H 1
-#endif

 /* Define to 1 if you have the `isatty' function. */
 #define HAVE_ISATTY 1
@@ -281,9 +279,7 @@
 /* #undef HAVE_SPAWN_H */

 /* Define to 1 if you have the <stdint.h> header file. */
-#ifdef __MINGW32__
 #define HAVE_STDINT_H 1
-#endif

 /* Define to 1 if you have the <stdio.h> header file. */
 #define HAVE_STDIO_H 1
@@ -604,7 +600,7 @@
 #if defined(__TINYC__)
 #define BATCH_MODE_ONLY_SHELL 1
 #else
-/*#define BATCH_MODE_ONLY_SHELL 1 */
+#define BATCH_MODE_ONLY_SHELL 1
 #endif

 /*
EOF

make -f Basic.mk \
  MAKE_HOST=Windows32 \
  MKDIR.cmd='mkdir -p $1' \
  RM.cmd='rm -f $1' \
  CP.cmd='cp $1 $2' \
  msvc_CC="$MOZ_FETCHES_DIR/clang/bin/clang-cl --target=$TARGET -Xclang -ivfsoverlay -Xclang $MOZ_FETCHES_DIR/vs/overlay.yaml" \
  msvc_LD=$MOZ_FETCHES_DIR/clang/bin/lld-link

mkdir mozmake
cp WinRel/gnumake.exe mozmake/mozmake.exe

tar -acvf mozmake.tar.zst mozmake
mkdir -p $UPLOAD_DIR
cp mozmake.tar.zst $UPLOAD_DIR
