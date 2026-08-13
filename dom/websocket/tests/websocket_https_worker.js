onmessage = function () {
  try {
    let ws = new WebSocket(
      "ws://mochi.test:8888/tests/dom/websocket/tests/file_websocket_hello"
    );
    ws.onerror = function () {
      postMessage("not created");
    };
    ws.onopen = function () {
      postMessage("created");
    };
  } catch (e) {
    postMessage("not created");
  }
};
