#!/bin/bash
set -x -e -v

# This script is for building xar for Linux.
mkdir -p $UPLOAD_DIR

export PATH=$PATH:$MOZ_FETCHES_DIR/clang/bin

sysroot=$MOZ_FETCHES_DIR/sysroot
export CC="$MOZ_FETCHES_DIR/clang/bin/clang --sysroot=$sysroot"
# The sysroot's libcrypto.a is not compiled as PIC, so the xar binary that
# links it statically can't be a PIE.
export LDFLAGS="-fuse-ld=lld -no-pie"

# Point pkg-config exclusively at the sysroot
export PKG_CONFIG_ALLOW_CROSS=1
export PKG_CONFIG_SYSROOT_DIR=$sysroot
export PKG_CONFIG_LIBDIR="$sysroot/usr/lib/x86_64-linux-gnu/pkgconfig:$sysroot/usr/lib/pkgconfig:$sysroot/usr/share/pkgconfig"

# xar's configure can only find libxml2 through xml2-config, which sysroots
# don't ship because they contain no /usr/bin. Without this it would silently
# combine the host's libxml2 headers with the sysroot's library.
xml2_config=$(mktemp -d)/xml2-config
cat > $xml2_config <<'EOF'
#!/bin/sh
case "$1" in
--version) exec pkg-config --modversion libxml-2.0 ;;
--cflags) exec pkg-config --cflags libxml-2.0 ;;
--libs) exec pkg-config --libs libxml-2.0 ;;
esac
exit 1
EOF
chmod +x $xml2_config

cd $MOZ_FETCHES_DIR/xar/xar

./autogen.sh --prefix=/builds/worker --enable-static --with-xml2-config=$xml2_config

# Force statically-linking to libcrypto. pkg-config --static will tell
# us the extra flags that are needed (in practice, -ldl -pthread),
# and -lcrypto, which we need to change to actually link statically.
# The substitution contains sysroot paths, so it can't use / as separator.
CRYPTO=$(pkg-config --static --libs libcrypto | sed 's/-lcrypto/-l:libcrypto.a/')
sed -i "s|-lcrypto|$CRYPTO|" src/Makefile.inc

make_flags="-j$(nproc)"
make $make_flags

cd $(mktemp -d)
mkdir xar

cp $MOZ_FETCHES_DIR/xar/xar/src/xar ./xar/xar
tar caf $UPLOAD_DIR/xar.tar.zst ./xar
