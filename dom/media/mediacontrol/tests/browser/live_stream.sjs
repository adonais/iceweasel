// Serves a real MP3 fixture without ever revealing its total length, and
// keeps the HTTP response open for a while after writing all of its bytes.
// This mimics a live stream (e.g. internet radio), whose connection stays
// open during normal playback instead of completing like a regular
// finite-length download.
//
// Simply omitting `Content-Length` isn't enough on its own: Gecko also
// reclassifies a resource as finite-length once its download completes
// (see `ChannelMediaDecoder::NotifyDownloadEnded()`), which happens near-
// instantly for any small static file served locally. Holding the
// connection (for `HOLD_OPEN_MS`) open avoids that, matching how a real broadcast behaves.
//
// The fixture itself is a short (~1s) MP3 stream carrying its own `Info`
// header, immediately followed by a second, header-less MP3 stream. This
// mimics a short pre-recorded prelude in front of a live broadcast: the
// prelude's duration is known upfront, while the broadcast portion has no
// declared duration, so Gecko instead reports its playback position as the
// growing duration - matching a real live stream.
const HOLD_OPEN_MS = 2000;

function handleRequest(request, response) {
  var src = Services.dirsvc.get("CurWorkD", Ci.nsIFile);
  var split =
    "tests/dom/media/test/single-xing-header-no-content-length.mp3".split("/");
  for (var i = 0; i < split.length; ++i) {
    src.append(split[i]);
  }

  var file = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  file.init(src, -1, -1, false);
  var input = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIBinaryInputStream
  );
  input.setInputStream(file);
  var bytes = input.readBytes(input.available());
  input.close();

  response.setHeader("Content-Type", "audio/mpeg", false);
  response.setHeader("Cache-Control", "no-store", false);
  // Deliberately no Content-Length header.
  response.write(bytes, bytes.length);

  // Hold the connection for a while.
  response.processAsync();
  const Timer = Components.Constructor(
    "@mozilla.org/timer;1",
    "nsITimer",
    "initWithCallback"
  );
  // eslint-disable-next-line no-unused-vars
  var timer = new Timer(
    function () {
      response.finish();
    },
    HOLD_OPEN_MS,
    Ci.nsITimer.TYPE_ONE_SHOT
  );
}
