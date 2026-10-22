# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.
"""Check the HTTP status of the Bouncer products of a release."""

import argparse
import logging
import sys
from concurrent import futures
from urllib.parse import urlparse

import requests
import yaml
from redo import retry
from requests.exceptions import HTTPError

log = logging.getLogger(__name__)

BOUNCER_URL_PATTERN = "{bouncer_prefix}?product={product}&os={os}&lang={lang}"

DEFAULT_CDN_URLS = [
    "download-installer.cdn.mozilla.net",
    "download.cdn.mozilla.net",
    "download.mozilla.org",
    "archive.mozilla.org",
]

# Intentionally limited for several reasons:
# 1) faster to check
# 2) do not need to deal with situation when a new locale
# introduced and we do not have partials for it yet
# 3) it mimics the old Sentry behaviour that worked for ages
# 4) no need to handle ja-JP-mac
DEFAULT_LOCALES = ["en-US", "de", "it", "zh-TW"]


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        required=True,
        help="YAML file listing the products and partials to check",
    )
    parser.add_argument(
        "--bouncer-prefix",
        required=True,
        help="Bouncer URL prefix, eg: https://download.mozilla.org/",
    )
    parser.add_argument("--version", help="Version of release, eg: 39.0b5")
    parser.add_argument(
        "--product-field",
        help="Version field of release from product details, eg: LATEST_FIREFOX_VERSION",
    )
    parser.add_argument(
        "--products-url",
        default="https://product-details.mozilla.org/1.0/firefox_versions.json",
        help="The URL of the current Firefox product versions",
    )
    parser.add_argument(
        "--previous-version",
        dest="prev_versions",
        action="append",
        default=[],
        help="Previous version(s)",
    )
    parser.add_argument(
        "--locale",
        dest="locales",
        action="append",
        help=f"Locale to check. Defaults to {', '.join(DEFAULT_LOCALES)}",
    )
    parser.add_argument(
        "--cdn-url",
        dest="cdn_urls",
        action="append",
        help=f"Host a checked URL may redirect to. Defaults to {', '.join(DEFAULT_CDN_URLS)}",
    )
    parser.add_argument(
        "-j",
        "--parallelization",
        default=20,
        type=int,
        help="Number of HTTP sessions running in parallel",
    )
    args = parser.parse_args(argv)
    if args.locales is None:
        args.locales = DEFAULT_LOCALES
    if args.cdn_urls is None:
        args.cdn_urls = DEFAULT_CDN_URLS
    return args


def get_json(url):
    def fetch():
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.json()

    return retry(
        fetch,
        attempts=5,
        sleeptime=60,
        max_sleeptime=5 * 60,
        retry_exceptions=(requests.RequestException,),
    )


def resolve_version(args):
    if not args.product_field:
        return args.version
    firefox_versions = get_json(args.products_url)
    if args.product_field not in firefox_versions:
        raise SystemExit(f"Unknown Firefox label: {args.product_field}")
    version = firefox_versions[args.product_field]
    log.info(f"Set Firefox version {version}")
    return version


def get_urls(config, bouncer_prefix, version, locales, prev_versions):
    for product in config["products"].values():
        product_name = product["product-name"] % {"version": version}
        for bouncer_platform in product["platforms"]:
            for locale in locales:
                yield BOUNCER_URL_PATTERN.format(
                    bouncer_prefix=bouncer_prefix,
                    product=product_name,
                    os=bouncer_platform,
                    lang=locale,
                )

    for product in config.get("partials", {}).values():
        for prev_version in prev_versions:
            product_name = product["product-name"] % {
                "version": version,
                "prev_version": prev_version,
            }
            for bouncer_platform in product["platforms"]:
                for locale in locales:
                    yield BOUNCER_URL_PATTERN.format(
                        bouncer_prefix=bouncer_prefix,
                        product=product_name,
                        os=bouncer_platform,
                        lang=locale,
                    )


def check_url(session, url, cdn_urls):
    ok = True

    def do_check_url():
        nonlocal ok
        log.info(f"Checking {url}")
        r = session.head(url, verify=True, timeout=10, allow_redirects=True)
        try:
            r.raise_for_status()
        except HTTPError:
            log.error(f"FAIL: {url}, status: {r.status_code}")
            raise

        final_url = urlparse(r.url)
        if final_url.scheme != "https":
            log.error(f"FAIL: URL scheme is not https: {r.url}")
            ok = False

        if final_url.netloc not in cdn_urls:
            log.error(f"FAIL: host not in allowed locations: {r.url}")
            ok = False

    try:
        retry(do_check_url, sleeptime=3, max_sleeptime=10, attempts=3)
    except HTTPError:
        return False
    return ok


def check_bouncer(config, args, version):
    session = requests.Session()
    http_adapter = requests.adapters.HTTPAdapter(
        pool_connections=args.parallelization,
        pool_maxsize=args.parallelization,
    )
    session.mount("https://", http_adapter)
    session.mount("http://", http_adapter)

    urls = get_urls(
        config, args.bouncer_prefix, version, args.locales, args.prev_versions
    )
    with futures.ThreadPoolExecutor(args.parallelization) as e:
        fs = [e.submit(check_url, session, url, args.cdn_urls) for url in urls]
        results = [f.result() for f in futures.as_completed(fs)]
    return all(results)


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")
    args = parse_args(argv)
    with open(args.config, encoding="utf-8") as fh:
        config = yaml.safe_load(fh)
    version = resolve_version(args)
    if not version:
        raise SystemExit("One of --version or --product-field is required")
    if check_bouncer(config, args, version):
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
