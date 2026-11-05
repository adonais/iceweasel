/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  HttpServer: "resource://testing-common/httpd.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

const PingServer = {
  _httpServer: null,
  _started: false,
  _defers: [Promise.withResolvers()],
  _currentDeferred: 0,

  get port() {
    return this._httpServer.identity.primaryPort;
  },

  get host() {
    return this._httpServer.identity.primaryHost;
  },

  get started() {
    return this._started;
  },

  registerPingHandler(handler) {
    this._httpServer.registerPrefixHandler("/submit/", handler);
  },

  resetPingHandler() {
    this.registerPingHandler(request => {
      let r = request;
      console.trace(
        `defaultPingHandler() - ${r.method} ${r.scheme}://${r.host}:${r.port}${r.path}`
      );
      let deferred = this._defers[this._defers.length - 1];
      this._defers.push(Promise.withResolvers());
      deferred.resolve(request);
    });
    const ohttp = Cc["@mozilla.org/network/oblivious-http;1"].getService(
      Ci.nsIObliviousHttp
    );
    const ohttpServer = ohttp.server();
    this._httpServer.registerPrefixHandler("/", (request, response) => {
      console.trace(
        `OHTTP handler - ${request.method} ${request.scheme}://${request.host}:${request.port}${request.path}`
      );
      if (request.path.includes("ohttp-configs")) {
        // OHTTP Configs Server
        const bstream = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(
          Ci.nsIBinaryOutputStream
        );
        bstream.setOutputStream(response.bodyOutputStream);
        bstream.writeByteArray(ohttpServer.encodedConfig);
        response.setStatusLine(request.httpVersion, 200, "OK");
      } else {
        // OHTTP Relay Server
        const inputStream = Cc[
          "@mozilla.org/binaryinputstream;1"
        ].createInstance(Ci.nsIBinaryInputStream);
        inputStream.setInputStream(request.bodyInputStream);
        const requestBody = inputStream.readByteArray(inputStream.available());
        const ohttpRequest = ohttpServer.decapsulate(requestBody);
        const bhttp = Cc["@mozilla.org/network/binary-http;1"].getService(
          Ci.nsIBinaryHttp
        );
        const decodedRequest = bhttp.decodeRequest(ohttpRequest.request);

        // Fake success
        response.processAsync();
        const bhttpResponse = {
          status: 200,
          headerNames: [],
          headerValues: [],
          content: new TextEncoder().encode(decodedRequest.content),
        };
        const encResponse = ohttpRequest.encapsulate(
          bhttp.encodeResponse(bhttpResponse)
        );
        response.setStatusLine(request.httpVersion, 200, "OK");
        const bstream = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(
          Ci.nsIBinaryOutputStream
        );
        bstream.setOutputStream(response.bodyOutputStream);
        bstream.writeByteArray(encResponse);
        response.finish();

        let deferred = this._defers.at(-1);
        this._defers.push(Promise.withResolvers());
        deferred.resolve(decodedRequest);
      }
    });
  },

  start() {
    this._httpServer = new HttpServer();
    this._httpServer.start(-1);
    this._started = true;
    this.clearRequests();
    this.resetPingHandler();
  },

  stop() {
    return new Promise(resolve => {
      this._httpServer.stop(resolve);
      this._started = false;
    });
  },

  clearRequests() {
    this._defers = [Promise.withResolvers()];
    this._currentDeferred = 0;
  },

  promiseNextRequest() {
    const deferred = this._defers[this._currentDeferred++];
    // Send the ping to the consumer on the next tick, so that the completion gets
    // signaled to Telemetry.
    return new Promise(r =>
      Services.tm.dispatchToMainThread(() => r(deferred.promise))
    );
  },

  promiseNextPing() {
    return this.promiseNextRequest().then(decodeRequestPayload);
  },

  async promiseNextRequests(count) {
    let results = [];
    for (let i = 0; i < count; ++i) {
      results.push(await this.promiseNextRequest());
    }

    return results;
  },

  promiseNextPings(count) {
    return this.promiseNextRequests(count).then(requests => {
      return Promise.all(Array.from(requests, decodeRequestPayload));
    });
  },
};

/**
 * Decode the payload of an HTTP request into a ping.
 *
 * @param {object} request The data representing an HTTP request (nsIHttpRequest).
 * @returns {object} The decoded ping payload.
 */
async function decodeRequestPayload(request) {
  if (request instanceof Ci.nsIBinaryHttpRequest) {
    const dgzip = new DecompressionStream("gzip");
    const stream = dgzip.readable.pipeThrough(new TextDecoderStream());
    const writer = dgzip.writable.getWriter();
    // For some reason we can't write the Array<octet> directly and need a new Uint8Array.
    writer.write(new Uint8Array(request.content));
    const writePromise = writer.close();
    let result = "";
    for await (const chunk of stream) {
      result += chunk;
    }
    await writePromise;
    return JSON.parse(result);
  }
  let s = request.bodyInputStream;
  let payload = null;

  if (
    request.hasHeader("content-encoding") &&
    request.getHeader("content-encoding") == "gzip"
  ) {
    let observer = {
      buffer: "",
      onStreamComplete(loader, context, status, length, result) {
        // String.fromCharCode can only deal with 500,000 characters
        // at a time, so chunk the result into parts of that size.
        const chunkSize = 500000;
        for (let offset = 0; offset < result.length; offset += chunkSize) {
          this.buffer += String.fromCharCode.apply(
            String,
            result.slice(offset, offset + chunkSize)
          );
        }
      },
    };

    let scs = Cc["@mozilla.org/streamConverters;1"].getService(
      Ci.nsIStreamConverterService
    );
    let listener = Cc["@mozilla.org/network/stream-loader;1"].createInstance(
      Ci.nsIStreamLoader
    );
    listener.init(observer);
    let converter = scs.asyncConvertData(
      "gzip",
      "uncompressed",
      listener,
      null
    );
    converter.onStartRequest(null, null);
    converter.onDataAvailable(null, s, 0, s.available());
    converter.onStopRequest(null, null, null);
    // TODO: nsIScriptableUnicodeConverter is deprecated
    // But I can't figure out how else to ungzip bodyInputStream.
    let unicodeConverter = Cc[
      "@mozilla.org/intl/scriptableunicodeconverter"
    ].createInstance(Ci.nsIScriptableUnicodeConverter);
    unicodeConverter.charset = "UTF-8";
    let utf8string = unicodeConverter.ConvertToUnicode(observer.buffer);
    utf8string += unicodeConverter.Finish();
    payload = JSON.parse(utf8string);
  } else {
    let bytes = NetUtil.readInputStream(s, s.available());
    payload = JSON.parse(new TextDecoder().decode(bytes));
  }

  return payload;
}
