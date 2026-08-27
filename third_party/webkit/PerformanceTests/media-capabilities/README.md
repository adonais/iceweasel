# mediacapabilities-benchmark

Benchmark for the MediaCapabilities API (`decodingInfo()` / `encodingInfo()`).

It records individual `decodingInfo()` / `encodingInfo()` query latencies in
milliseconds (lower is better). It measures API query latency, not decode or
encode throughput.

## Run

Serve the directory (e.g. `python3 -m http.server`) and open `index.html`.
Then, click "Run all".

## License

MPL 2.0
