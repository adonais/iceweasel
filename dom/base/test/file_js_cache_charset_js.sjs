function handleRequest(request, response) {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/javascript", false);
  response.setHeader("Cache-Control", "max-age=10000", false);
  response.write(`
// Large file that passes the file size condition for the disk cache.
//
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.
// A large comment block to make the file size pass the condition.

// Shift_JIS HIRAGANA LETTER A
document.body.append("\x82\xA0");
`);
}
