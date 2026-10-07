#!/bin/bash
# This configures the environment for running MSVC.  It uses vswhere, the
# registry, and a little knowledge of how MSVC is laid out.

if ! hash vswhere 2>/dev/null; then
    echo "Can't find vswhere on the path, aborting" 1>&2
    exit 1
fi

if ! hash reg 2>/dev/null; then
    echo "Can't find reg on the path, aborting" 1>&2
    exit 1
fi

# Turn a unix-y path into a windows one.
fixpath() {
    if hash cygpath 2>/dev/null; then
        cygpath --unix "$1"
    else # haxx
        echo "$1" | sed -e 's,\\,/,g;s,^\(.\):,/\L\1,;s,/$,,'
    fi
}

# Query the registry.  This takes $1 and tags that on the end of several
# different paths, looking for a value called $2 at that location.
# e.g.,
#   regquery Microsoft\Microsoft SDKs\Windows\v10.0 ProductVersion
# looks for a REG_SZ value called ProductVersion at
#   HKLM\SOFTWARE\Wow6432Node\Microsoft\Microsoft SDKs\Windows\v10.0
#   HKLU\SOFTWARE\Wow6432Node\Microsoft\Microsoft SDKs\Windows\v10.0
#   etc...
regquery() {
    search=("HKLM\\SOFTWARE\\Wow6432Node" \
            "HKCU\\SOFTWARE\\Wow6432Node" \
            "HKLM\\SOFTWARE" \
            "HKCU\\SOFTWARE")
    for i in "${search[@]}"; do
        r=$(reg query "${i}\\${1}" -v "$2" | sed -e 's/ *'"$2"' *REG_SZ *//;t;d')
        if [ -n "$r" ]; then
            echo "$r"
            return 0
        fi
    done
    return 1
}

VSCOMPONENT=Microsoft.VisualStudio.Component.VC.Tools.x86.x64
vsinstall=$(vswhere -latest -property installationPath)

# Attempt to setup paths if vswhere returns something and VSPATH isn't set.
# Otherwise, assume that the env is setup.
if [[ -n "$vsinstall" && -z "$VSPATH" ]]; then

    case "$target_arch" in
        ia32) m=x86 ;;
        x64) m="$target_arch" ;;
        aarch64|arm64) m=arm64 ;;
        *)
            echo "No support for target '$target_arch' with MSVC." 1>&2
            exit 1
    esac

    export VSPATH=$(fixpath "$vsinstall")
    export WINDOWSSDKDIR="${VSPATH}/SDK"
    export VCINSTALLDIR="${VSPATH}/VC"

    CRTREG="Microsoft\\Microsoft SDKs\\Windows\\v10.0"
    UniversalCRTSdkDir=$(regquery "$CRTREG" InstallationFolder)
    UniversalCRTSdkDir=$(fixpath "$UniversalCRTSdkDir")
    UCRTVersion=$(regquery "$CRTREG" ProductVersion)
    UCRTVersion=$(cd "${UniversalCRTSdkDir}/include"; ls -d "${UCRTVersion}"* | tail -1)

    VCVER=$(cat "${VCINSTALLDIR}/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt")
    REDISTVER=$(cat "${VCINSTALLDIR}/Auxiliary/Build/Microsoft.VCRedistVersion.default.txt")

    # Use installationVersion (always populated) to get the VS major version.
    # catalog_productLineVersion is unreliable: it returns a bare major number
    # for VS 2026.
    vs_major=$(vswhere -latest -property installationVersion | cut -d. -f1)
    if [ "$vs_major" = "18" ]; then
        # VS 2026: catalog_productLineVersion returns the major version number
        # rather than a year string; supply the year explicitly.
        vc_crt=144; gyp_ver=2026
    else
        VS_YEAR=$(vswhere -latest -requires "$VSCOMPONENT" -property catalog_productLineVersion)
        vc_crt=141; gyp_ver="${VS_YEAR:-2022}"
    fi
    export WIN32_REDIST_DIR="${VCINSTALLDIR}/Redist/MSVC/${REDISTVER}/${m}/Microsoft.VC${vc_crt}.CRT"
    export WIN_UCRT_REDIST_DIR="${UniversalCRTSdkDir}/Redist/ucrt/DLLs/${m}"

    if [ "$m" == "x86" ]; then
        PATH="${PATH}:${VCINSTALLDIR}/Tools/MSVC/${VCVER}/bin/Hostx64/x64"
        PATH="${PATH}:${VCINSTALLDIR}/Tools/MSVC/${VCVER}/bin/Hostx64/x86"
    elif [ "$m" == "arm64" ]; then
        PATH="${PATH}:${VCINSTALLDIR}/Tools/MSVC/${VCVER}/bin/Hostx64/arm64"
    fi
    PATH="${PATH}:${VCINSTALLDIR}/Tools/MSVC/${VCVER}/bin/Host${m}/${m}"
    PATH="${PATH}:${UniversalCRTSdkDir}/bin/${UCRTVersion}/${m}"
    PATH="${PATH}:${WIN32_REDIST_DIR}"
    export PATH

    INCLUDE="${VCINSTALLDIR}/Tools/MSVC/${VCVER}/ATLMFC/include"
    INCLUDE="${INCLUDE}:${VCINSTALLDIR}/Tools/MSVC/${VCVER}/include"
    INCLUDE="${INCLUDE}:${UniversalCRTSdkDir}/include/${UCRTVersion}/ucrt"
    INCLUDE="${INCLUDE}:${UniversalCRTSdkDir}/include/${UCRTVersion}/shared"
    INCLUDE="${INCLUDE}:${UniversalCRTSdkDir}/include/${UCRTVersion}/um"
    INCLUDE="${INCLUDE}:${UniversalCRTSdkDir}/include/${UCRTVersion}/winrt"
    INCLUDE="${INCLUDE}:${UniversalCRTSdkDir}/include/${UCRTVersion}/cppwinrt"
    export INCLUDE

    LIB="${VCINSTALLDIR}/lib/${m}"
    LIB="${VCINSTALLDIR}/Tools/MSVC/${VCVER}/lib/${m}"
    LIB="${LIB}:${UniversalCRTSdkDir}/lib/${UCRTVersion}/ucrt/${m}"
    LIB="${LIB}:${UniversalCRTSdkDir}/lib/${UCRTVersion}/um/${m}"
    export LIB

    export GYP_MSVS_OVERRIDE_PATH="${vsinstall}"
    export GYP_MSVS_VERSION="${gyp_ver}"
else
    echo Assuming env setup is already done.
    echo VSPATH=$VSPATH
    # When setup was done externally (e.g. by vcvarsall.bat), gyp still needs
    # GYP_MSVS_VERSION.  VSCMD_VER is always set by vcvarsall.bat so use it
    # as the condition.
    if [ -n "$VSCMD_VER" ] && [ -z "$GYP_MSVS_VERSION" ]; then
        # vswhere was unavailable; derive version from VSCMD_VER (set by vcvarsall.bat).
        # Only VS 2026 needs special handling (returns major "18" not year string).
        if [ "${VSCMD_VER%%.*}" = "18" ]; then
            gyp_ver=2026
        else
            gyp_ver=$(vswhere -latest -property catalog_productLineVersion 2>/dev/null || true)
            gyp_ver="${gyp_ver:-$VSCMD_VER}"
        fi
        export GYP_MSVS_VERSION="${gyp_ver}"
        [ -n "$VSINSTALLDIR" ] && export GYP_MSVS_OVERRIDE_PATH="${VSINSTALLDIR}"
    fi
fi
