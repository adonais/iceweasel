function runInWorker() {
  return new Promise((resolve, reject) => {
    var worker = new Worker("media-capabilities-worker.js");
    worker.onmessage = e => {
      worker.terminate();
      if (e.data.ok) {
        resolve(e.data.results);
      } else {
        reject(new Error("worker error: " + e.data.message));
      }
    };
    worker.onerror = e => {
      worker.terminate();
      reject(new Error("worker error: " + e.message));
    };
    worker.postMessage("run");
  });
}

async function runBenchmark() {
  var results = await runAll(null, { recordFirstQuery: true });
  var workerResults = await runInWorker();
  for (var i = 0; i < workerResults.length; i++) {
    var wr = workerResults[i];
    results.push({ name: "worker-" + wr.name, values: wr.values });
  }
  report(results);
}

function median(values) {
  var s = values.slice().sort((a, b) => a - b);
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stddev(values) {
  if (values.length < 2) {
    return 0;
  }
  var mean = values.reduce((a, b) => a + b, 0) / values.length;
  var variance =
    values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// Standalone view only: a readable summary per subtest. The raptor payload
// below carries the raw values, which the support script turns into the full
// statistics.
function report(results) {
  document.getElementById("in-progress").style.display = "none";
  var str = "<table><thead><tr><td>Subtest</td><td>cold</td><td>min</td>" +
            "<td>median</td><td>max</td><td>stddev</td></tr></thead>";
  for (var i = 0; i < results.length; i++) {
    var v = results[i].values;
    str += "<tr><td>" + results[i].name + "</td><td>" + v[0].toFixed(3) +
           "</td><td>" + Math.min.apply(null, v).toFixed(3) + "</td><td>" +
           median(v).toFixed(3) + "</td><td>" +
           Math.max.apply(null, v).toFixed(3) + "</td><td>" +
           stddev(v).toFixed(3) + "</td></tr>";
  }
  str += "</table>";
  document.getElementById("results").innerHTML = str;
  document.getElementById("run-all").disabled = false;

  if (location.search.includes("raptor")) {
    var data = ["raptor-benchmark", "media-capabilities", JSON.stringify(results)];
    window.postMessage(data, "*");
    window.sessionStorage.setItem("benchmark_results", JSON.stringify(data));
  }
}

document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("run-all").addEventListener("click", function () {
    document.getElementById("run-all").disabled = true;
    document.getElementById("in-progress").style.display = "inline";
    runBenchmark();
  });
  // auto-run when running in raptor
  if (location.search.includes("raptor")) {
    document.getElementById("run-all").disabled = true;
    document.getElementById("in-progress").style.display = "inline";
    setTimeout(runBenchmark, 100);
  }
});
