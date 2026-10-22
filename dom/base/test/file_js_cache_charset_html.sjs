function handleRequest(request, response) {
  const query = {};
  request.queryString.split("&").forEach(function (val) {
    const [name, value] = val.split("=");
    query[name] = unescape(value);
  });

  let script_attr = "";
  if (query.script === "Shift_JIS") {
    script_attr = ` charset="Shift_JIS"`;
  } else if (query.script === "UTF-8") {
    script_attr = ` charset="UTF-8"`;
  }

  let document_text = "";
  if (query.document === "Shift_JIS") {
    document_text = "\x82\xa0\x82\xa2\x82\xa4".repeat(5);
  }

  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);
  response.setHeader("Cache-Control", "no-store", false);
  response.write(`<!DOCTYPE html>
<html>
  <head>
<title>${document_text}</title>
  </head>
  <body>
    <script id="watchme" ${script_attr} src="file_js_cache_charset_js.sjs"></script>
  </body>
</html>
`);
}
