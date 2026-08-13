function handleRequest(request, response) {
  response.setHeader("Content-Type", "text/xml", false);
  response.setHeader(
    "Link",
    "<data:text/xml,>; rel=stylesheet; type=text/xsl",
    false
  );
  response.write('<?xml version="1.0" encoding="UTF-8"?>\n<root/>');
}
