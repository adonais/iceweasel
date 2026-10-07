// |jit-test| --fast-warmup; --no-threads

gczeal(0);
let wm = new WeakMap();
let key = {};
wm.set(key, Symbol());
function get() {
  return wm.get(key);
}
function main() {
  get();
  schedulezone(key);
  startgc(1);
  while (gcstate() !== "NotActive") {
    get();
    gcslice(100);
  }
}
main();
