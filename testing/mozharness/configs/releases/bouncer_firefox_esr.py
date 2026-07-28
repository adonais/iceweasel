# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# lint_ignore=E501
config = {
    "products": {
        # for installers, stubs, msi (ie not updates) ...
        # products containing "latest" are for www.mozilla.org via cron-bouncer-check
        # products using versions are for release automation via release-bouncer-check-firefox
        "installer": {
            "product-name": "Firefox-%(version)s",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-latest": {
            "product-name": "Firefox-esr-latest",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-115-latest": {
            "product-name": "Firefox-esr115-latest",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-ssl": {
            "product-name": "Firefox-%(version)s-SSL",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-latest-ssl": {
            "product-name": "Firefox-esr-latest-SSL",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "installer-115-latest-ssl": {
            "product-name": "Firefox-esr115-latest-SSL",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "msi": {
            "product-name": "Firefox-%(version)s-msi-SSL",
            "platforms": [
                "win",
                "win64",
            ],
        },
        "msi-latest": {
            "product-name": "Firefox-esr-msi-latest-SSL",
            "platforms": [
                "win",
                "win64",
            ],
        },
        "msi-115-latest": {
            "product-name": "Firefox-esr115-msi-latest-SSL",
            "platforms": [
                "win",
                "win64",
            ],
        },
        "pkg": {
            "product-name": "Firefox-%(version)s-pkg-SSL",
            "platforms": ["osx"],
        },
        "pkg-latest": {
            "product-name": "Firefox-esr-pkg-latest-SSL",
            "platforms": ["osx"],
        },
        "pkg-115-latest": {
            "product-name": "Firefox-esr115-pkg-latest-SSL",
            "platforms": ["osx"],
        },
        "langpack": {
            "product-name": "Firefox-%(version)s-langpack-SSL",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "langpack-latest": {
            "product-name": "Firefox-esr-langpack-latest-SSL",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "langpack-115-latest": {
            "product-name": "Firefox-esr115-langpack-latest-SSL",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
        "complete-mar": {
            "product-name": "Firefox-%(version)s-Complete",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
    },
    "partials": {
        "releases-dir": {
            "product-name": "Firefox-%(version)s-Partial-%(prev_version)s",
            "platforms": [
                "linux64",
                "osx",
                "win",
                "win64",
            ],
        },
    },
}
