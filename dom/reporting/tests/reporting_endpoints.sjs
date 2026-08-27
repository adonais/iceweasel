/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

function handleRequest(request, response) {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);
  response.setHeader("Cache-Control", "no-store", false);
  response.setHeader(
    "Reporting-Endpoints",
    'default="https://example.com/browser/dom/reporting/tests/report"',
    false
  );
  response.write("<html><body>reporting endpoints</body></html>");
}
