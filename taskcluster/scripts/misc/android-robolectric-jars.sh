#!/bin/bash
set -x -e -v

# Every android-all-instrumented jar that DefaultSdkProvider of the Robolectric in
# gradle/libs.versions.toml knows about.

MAVEN=https://repo1.maven.org/maven2/org/robolectric
ROBOLECTRIC=$(sed -n 's/^robolectric = "\(.*\)"$/\1/p' $GECKO_PATH/gradle/libs.versions.toml)
: ${ROBOLECTRIC:?no robolectric version in gradle/libs.versions.toml}

fetch() {
    curl --fail -L --retry 5 --retry-all-errors -o $2 $1
    echo "$(curl --fail -L --retry 5 --retry-all-errors $1.sha512 | cut -d' ' -f1)  $2" | sha512sum -c
}

mkdir -p $UPLOAD_DIR
cd $(mktemp -d)
mkdir robolectric-android-all

fetch $MAVEN/robolectric/$ROBOLECTRIC/robolectric-$ROBOLECTRIC-sources.jar sources.jar
provider=$(unzip -p sources.jar org/robolectric/plugins/DefaultSdkProvider.java | tr -d '\n')
instrumented=$(echo "$provider" | sed -n 's/.*PREINSTRUMENTED_VERSION = \([0-9]*\);.*/\1/p')
: ${instrumented:?no PREINSTRUMENTED_VERSION in DefaultSdkProvider.java}
versions=$(echo "$provider" | grep -oE 'new DefaultSdk\( *[A-Z_0-9]+, *"[^"]+", *"[^"]+"' |
    sed -E "s/.*\"([^\"]+)\", *\"([^\"]+)\"/\1-robolectric-\2-i$instrumented/")
: ${versions:?no DefaultSdk entries in DefaultSdkProvider.java}

for version in $versions; do
    jar=android-all-instrumented-$version.jar
    fetch $MAVEN/android-all-instrumented/$version/$jar robolectric-android-all/$jar
done

tar cavf $UPLOAD_DIR/robolectric-android-all.tar.zst robolectric-android-all

ls -al $UPLOAD_DIR
