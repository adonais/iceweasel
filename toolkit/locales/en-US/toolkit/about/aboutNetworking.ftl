# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

about-networking-title = About Networking
about-networking-http = HTTP
about-networking-http-clear-cache-button = Clear HTTP Cache
about-networking-sockets = Sockets
about-networking-dns = DNS
about-networking-dns-clear-cache-button = Clear DNS Cache
about-networking-dns-trr-url = DoH URL
about-networking-dns-trr-mode = DoH Mode
about-networking-dns-suffix = DNS suffix
about-networking-websockets = WebSockets
about-networking-alt-svc = Alt-Svc
about-networking-alt-svc-origin = Origin
about-networking-alt-svc-alternate = Alternate
about-networking-alt-svc-alpn = ALPN
about-networking-alt-svc-validated = Validated
about-networking-alt-svc-ttl = TTL
about-networking-alt-svc-origin-attributes-suffix = Isolation Key
about-networking-ssl-tokens = TLS Tokens
# $count (Number) - Number of cached TLS resumption tokens
about-networking-ssl-tokens-summary-count = { $count ->
    [one] { $count } token
   *[other] { $count } tokens
}
# $count (Number) - Number of cached tokens that have already expired
about-networking-ssl-tokens-summary-expired = { $count ->
    [one] ({ $count } expired)
   *[other] ({ $count } expired)
}
# $decompressedLength (Number) - Total uncompressed size in bytes across all tokens
# $compressedLength (Number) - Total compressed size in bytes across all tokens
# $saved (Number) - Percentage of space saved by compression
about-networking-ssl-tokens-summary-compression = { $decompressedLength } → { $compressedLength } B ({ $saved }% saved)
# $used (Number) - Cache size currently in use, in kilobytes
# $capacity (Number) - Total cache capacity, in kilobytes
# $percent (Number) - Percentage of the cache capacity currently in use
about-networking-ssl-tokens-summary-capacity = { $used } / { $capacity } KB ({ $percent }%)
about-networking-ssl-tokens-partition-key = Partition Key
about-networking-ssl-tokens-tokens-column = Tokens
about-networking-ssl-tokens-expires = Expires
about-networking-ssl-tokens-certificate = Cert
# $count (Number) - Number of tokens sharing this row's host and certificate
about-networking-ssl-tokens-token-list = { $count ->
    [one] { $count } token
   *[other] { $count } tokens
}
about-networking-ssl-tokens-restored =
  .alt = Restored from storage
  .title = Restored from storage
about-networking-ssl-tokens-new =
  .alt = New this session
  .title = New this session
about-networking-ssl-tokens-expired =
  .alt = Expired
  .title = Expired
# $tokenLength (Number) - Total size in bytes of the raw TLS resumption token(s)
# $decompressedLength (Number) - Total size in bytes before compression
# $compressedLength (Number) - Total size in bytes after compression
about-networking-ssl-tokens-compression-details =
  .title = Tokens: { $tokenLength } B. Encoded: { $decompressedLength } → { $compressedLength } B.
about-networking-ssl-tokens-ev-status = EV cert
about-networking-ssl-tokens-ct-status = Cert Transparency status
about-networking-ssl-tokens-overridable-error = Overridable error category
about-networking-ssl-tokens-built-in-root = Built-in root
# $count (Number) - Number of certs in the succeeded cert chain
about-networking-ssl-tokens-cert-chain = Cert chain ({ $count })
# $count (Number) - Number of certs seen during the TLS handshake
about-networking-ssl-tokens-handshake-certs = Handshake certs ({ $count })
about-networking-refresh = Refresh
about-networking-auto-refresh = Autorefresh every 3 seconds
about-networking-hostname = Hostname
about-networking-port = Port
about-networking-http-version = HTTP Version
about-networking-ssl = SSL
about-networking-active = Active
about-networking-idle = Idle
about-networking-host = Host
about-networking-type = Type
about-networking-sent = Sent
about-networking-received = Received
about-networking-family = Family
about-networking-trr = TRR
about-networking-addresses = Addresses
about-networking-expires = Expires (Seconds)
about-networking-originAttributesSuffix = Isolation Key
about-networking-flags = Extra flags
about-networking-messages-sent = Messages Sent
about-networking-messages-received = Messages Received
about-networking-bytes-sent = Bytes Sent
about-networking-bytes-received = Bytes Received
about-networking-logging = Logging
about-networking-dns-lookup = DNS Lookup
about-networking-dns-lookup-button = Resolve
about-networking-dns-domain = Domain:
about-networking-dns-lookup-table-column = IPs
about-networking-dns-https-rrs-lookup-table-column = HTTPS RRs
about-networking-networkid = Network ID
about-networking-networkid-id = Network ID
# Note: do not translate about:logging, as it is a URL.
about-networking-moved-about-logging = This page has been moved to <a data-l10n-name="about-logging-url">about:logging</a>.

## Link is intended as "network link"

about-networking-networkid-is-up = Link is up
about-networking-networkid-status-known = Link status is known

##
