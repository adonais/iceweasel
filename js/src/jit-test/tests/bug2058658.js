// |jit-test| slow; --setpref=experimental.self_hosted_cache=true; --baseline-eager; --no-threads

function payload() {
  var g = newGlobal({newCompartment: true});
  g.enableProf = enableGeckoProfiling;
  g.disableProf = disableGeckoProfiling;
  // Toggling the profiler clears the self-hosted cache, so Array.map gets
  // inserted again
  g.eval("function run() { return [4].map(x => { enableProf(); disableProf(); }); };");
  g.run();
}
oomTest(payload);
