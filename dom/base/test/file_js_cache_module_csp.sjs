const main_html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>
<script>
function addFrame(url) {
  return new Promise(resolve => {
    const f = document.createElement("iframe");
    f.onload = resolve;
    f.src = url;
    document.body.appendChild(f);
  });
}
function waitMsg(expected) {
  return new Promise(resolve => {
    function h(e) {
      if (e.data === expected) {
        window.removeEventListener("message", h);
        resolve();
      }
    }
    window.addEventListener("message", h);
  });
}
async function main() {
  let p = waitMsg("failed");
  await addFrame("file_js_cache_module_csp.sjs?csp1.html");
  await p;

  p = waitMsg("succeeded:10");
  await addFrame("file_js_cache_module_csp.sjs?no-csp.html");
  await p;

  p = waitMsg("failed");
  await addFrame("file_js_cache_module_csp.sjs?csp2.html");
  await p;

  document.body.setAttribute("result", "OK");
}
main();
</script>
</body>
</html>
`;

const frame_html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>
<script>
import("https://example.net/browser/dom/base/test/file_js_cache_module_csp.sjs?cacheable.mjs").then(
  ns => {
    document.body.append("succeeded:" + ns.x);
    parent.postMessage("succeeded:" + ns.x);
  },
  e => {
    document.body.append("failed");
    parent.postMessage("failed");
  });
</script>
</body>
</html>
`;

const cacheable_mjs = `
export const x = 10;
`;

function handleRequest(request, response) {
  if (request.queryString === "main.html") {
    response.setHeader("Content-Type", "text/html", false);
    response.setHeader("Cache-Control", "no-store", false);
    response.write(main_html);
  } else if (request.queryString === "no-csp.html") {
    response.setHeader("Content-Type", "text/html", false);
    response.setHeader("Cache-Control", "no-store", false);
    response.write(frame_html);
  } else if (
    request.queryString === "csp1.html" ||
    request.queryString === "csp2.html"
  ) {
    response.setHeader("Content-Type", "text/html", false);
    response.setHeader(
      "Content-Security-Policy",
      "script-src 'self' 'unsafe-inline'",
      false
    );
    response.setHeader("Cache-Control", "no-store", false);
    response.write(frame_html);
  } else if (request.queryString === "cacheable.mjs") {
    response.setHeader("Content-Type", "text/javascript", false);
    response.setHeader("Cache-Control", "max-age=3600", false);
    response.setHeader("Access-Control-Allow-Origin", "*", false);
    response.write(cacheable_mjs);
  }
}
