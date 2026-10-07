// Serve unbounded audio, with append and finish requests controlled by the test.
function handleRequest(request, response) {
  const [format, action] = request.queryString.split("&");
  const sources = {
    mp3: ["cbr-no-xing.mp3", "audio/mpeg"],
    adts: ["adts-cbr.aac", "audio/aac"],
  };
  if (!Object.hasOwn(sources, format)) {
    response.setStatusLine(request.httpVersion, 400, "Unknown format");
    return;
  }
  const [filename, contentType] = sources[format];
  const key = `live-duration-response-${format}`;
  response.setHeader("Cache-Control", "no-store", false);

  if (action) {
    getObjectState(key, stored => {
      if (!stored) {
        response.setStatusLine(request.httpVersion, 404, "No stream");
        return;
      }
      const stream = stored.wrappedJSObject;
      if (action == "append") {
        stream.response.write(stream.remaining);
        stream.remaining = "";
      } else if (action == "finish") {
        stream.response.finish();
        setObjectState(key, null);
      }
    });
    return;
  }

  const file = Services.dirsvc.get("CurWorkD", Ci.nsIFile);
  for (const part of `tests/dom/media/test/${filename}`.split("/")) {
    file.append(part);
  }
  const input = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  input.init(file, -1, -1, false);
  const binary = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIBinaryInputStream
  );
  binary.setInputStream(input);
  const bytes = binary.readBytes(binary.available());
  binary.close();

  // Keep the resource length unknown until the test explicitly finishes it.
  response.processAsync();
  response.setHeader("Content-Type", contentType, false);
  const firstChunk = 65536;
  const stream = {
    response,
    remaining: bytes.slice(firstChunk),
    QueryInterface() {
      return this;
    },
  };
  stream.wrappedJSObject = stream;
  setObjectState(key, stream);
  response.write(bytes.slice(0, firstChunk));
}
