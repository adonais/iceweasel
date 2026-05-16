/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

var gTimer = null;

function getFileStream(filename) {
  var self = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  self.initWithPath(getState("__LOCATION__"));
  var file = self.parent;
  file.append(filename);

  var fileStream = Cc[
    "@mozilla.org/network/file-input-stream;1"
  ].createInstance(Ci.nsIFileInputStream);
  fileStream.init(file, 1, 0, false);
  return fileStream;
}

// Split point: enough bytes to contain the complete LF frame so that
// FlushPartialFrame() fires with the LF approximation visible, but not
// enough to decode the full AC data for the final image.
const kSplitPoint = 1000;

function handleRequest(request, response) {
  // The test calls this with ?continue once it has observed the LF frame,
  // signalling that we should send the rest of the image data.
  if (request.queryString === "continue") {
    setState("jxl_progressive_continue", "1");
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.write("ok");
    return;
  }

  setState("jxl_progressive_continue", "0");

  response.processAsync();
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "image/jxl", false);
  response.setHeader("Cache-Control", "no-cache", false);

  var firstStream = getFileStream("progressive.jxl");
  response.bodyOutputStream.writeFrom(firstStream, kSplitPoint);
  firstStream.close();

  function checkAndContinue() {
    if (getState("jxl_progressive_continue") === "1") {
      var secondStream = getFileStream("progressive.jxl");
      secondStream
        .QueryInterface(Ci.nsISeekableStream)
        .seek(Ci.nsISeekableStream.NS_SEEK_SET, kSplitPoint);
      response.bodyOutputStream.writeFrom(
        secondStream,
        secondStream.available()
      );
      secondStream.close();
      response.finish();
    } else {
      gTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      gTimer.initWithCallback(checkAndContinue, 500, Ci.nsITimer.TYPE_ONE_SHOT);
    }
  }

  gTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  gTimer.initWithCallback(checkAndContinue, 500, Ci.nsITimer.TYPE_ONE_SHOT);
}
