# JSON viewer

Firefox includes a JSON viewer. If you open a JSON file in the browser, or view a remote URL with the Content-Type set to application/json, it is parsed and given syntax highlighting. Arrays and objects are shown collapsed, and you can expand them using the "+" icons.

JSON Lines documents (one JSON value per line, `.jsonl` files, or responses served as `application/jsonl`, `text/jsonl`, `application/jsonlines` or `application/x-ndjson`) are also recognized. The document is displayed like a JSON array, with one independently collapsible entry per non-blank line, in document order (blank lines are skipped, so entry indices don't necessarily match file line numbers). A line that isn't valid JSON is shown inline as an error without affecting the rest of the document. Pretty-printing is not offered for JSON Lines documents, since each record is already on its own line.

The JSON viewer provides a search box that you can use to filter the JSON.

You can also view the raw JSON and pretty-print it.

Finally, if the document was the result of a network request, the viewer displays the request and response headers.

## Console API

The JSON viewer exposes data through a console API, making it easy to access the parsed JSON and other information from the Console:

- **\$json.data** - The parsed JSON object
- **\$json.text** - The original JSON text
- **\$json.headers** - HTTP request and response headers

To access these from the console, {ref}`open the Web Console <keyboard-shortcuts-opening-and-closing-tools>`, and type `$json.data` to explore the parsed JSON object.
