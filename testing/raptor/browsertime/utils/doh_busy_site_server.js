/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals require, process, Buffer, __dirname */

// Replays the request timeline recorded from a real ad-heavy site against
// local servers. Every host of the page resolves, through the DoH endpoint
// served here, back to these servers: HTTP/2 hosts and the DoH resolver on
// the first port, HTTP/1.1 hosts on the second. Both ports are printed on
// startup.

const fs = require("fs");
const http2 = require("http2");
const https = require("https");
const path = require("path");

const ANSWER_IP = "127.0.0.1";
const DOH_HOST = "doh.busy.example";
// Approximates a real resolver's response time instead of answering instantly.
const DOH_RESPONSE_MS = 15;

// Per site, one entry per host in first-request order: {v: "h1"|"h2",
// t: [request start offsets in ms from the document request]}.
const SITES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "doh_busy_sites.json"))
);

const TLS = {
  key: fs.readFileSync(path.join(__dirname, "http2-cert.key")),
  cert: fs.readFileSync(path.join(__dirname, "http2-cert.pem")),
};

const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

let dohSessions = 0;
let dohSessionsAtDocument = 0;

function page(site) {
  const model = SITES[site];
  if (!model) {
    return null;
  }
  const hosts = model.map((h, i) => [
    `host${i}.${site}.busy.example:${
      (h.v === "h1" ? h1Server : h2Server).address().port
    }`,
    h.t,
  ]);
  return `<!doctype html><title>${site}</title>
<script>
performance.setResourceTimingBufferSize(10000);
window.busy = { loaded: 0, failed: 0 };
for (const [host, times] of ${JSON.stringify(hosts)}) {
  times.forEach((t, k) => setTimeout(() => {
    const img = new Image();
    img.onload = () => window.busy.loaded++;
    img.onerror = () => window.busy.failed++;
    img.src = "https://" + host + "/img?" + k;
  }, t));
}
</script>`;
}

// Firefox's TRR mode 2 sends DNS wire-format queries to /dns-query. Answer A
// queries for the synthetic hosts with loopback so they reach this replay
// server; return empty NOERROR answers for other record types.
function dnsAnswer(query) {
  let end = 12;
  while (query[end] !== 0) {
    if (end >= query.length) {
      throw new Error("truncated question name");
    }
    end += query[end] + 1;
  }
  const qtype = query.readUInt16BE(end + 1);
  const question = query.subarray(12, end + 5);
  const header = Buffer.alloc(12);
  query.copy(header, 0, 0, 2);
  header.writeUInt16BE(0x8180, 2);
  header.writeUInt16BE(1, 4);
  const parts = [header, question];
  if (qtype === 1) {
    header.writeUInt16BE(1, 6);
    const rr = Buffer.alloc(16);
    rr.writeUInt16BE(0xc00c, 0);
    rr.writeUInt16BE(1, 2);
    rr.writeUInt16BE(1, 4);
    rr.writeUInt32BE(60, 6);
    rr.writeUInt16BE(4, 10);
    ANSWER_IP.split(".").forEach((o, i) => rr.writeUInt8(Number(o), 12 + i));
    parts.push(rr);
  }
  return Buffer.concat(parts);
}

function handler(req, res) {
  const url = new URL(req.url, "https://localhost");
  if (url.pathname === "/dns-query") {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      let answer;
      try {
        const query =
          req.method === "POST"
            ? Buffer.concat(chunks)
            : Buffer.from(url.searchParams.get("dns") || "", "base64url");
        answer = dnsAnswer(query);
      } catch (e) {
        res.writeHead(400);
        res.end(`bad DNS query: ${e.message}`);
        return;
      }
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/dns-message" });
        res.end(answer);
      }, DOH_RESPONSE_MS);
    });
  } else if (url.pathname === "/stats") {
    // DoH connections opened since the document was served, i.e. reconnects.
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ doh_reconnects: dohSessions - dohSessionsAtDocument })
    );
  } else if (url.pathname === "/img") {
    res.writeHead(200, {
      "content-type": "image/gif",
      "cache-control": "no-store",
      "timing-allow-origin": "*",
    });
    res.end(GIF);
  } else {
    const html = page(url.searchParams.get("site"));
    if (!html) {
      res.writeHead(404);
      res.end(`unknown site; known: ${Object.keys(SITES).join(", ")}`);
      return;
    }
    dohSessionsAtDocument = dohSessions;
    res.writeHead(200, {
      "content-type": "text/html",
      "cache-control": "no-store",
    });
    res.end(html);
  }
}

const h2Server = http2.createSecureServer(TLS, handler);
const h1Server = https.createServer(TLS, handler);

h2Server.on("session", session => {
  if (session.socket.servername === DOH_HOST) {
    dohSessions++;
  }
});

h2Server.listen(0, "127.0.0.1", () => {
  h1Server.listen(0, "127.0.0.1", () => {
    console.log(
      `Server is running on https://127.0.0.1:${h2Server.address().port} ` +
        `and https://127.0.0.1:${h1Server.address().port} for HTTP/1.1 hosts`
    );
  });
});
