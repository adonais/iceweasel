gczeal(0);
function run() {
  grayRoot()[0] = [Symbol()];
  gc();
  schedulezone(globalThis);
  schedulezone("atoms");
  startgc(1);
  while (gcstate() === "Prepare" || gcstate() === "MarkRoots") gcslice(1);
  let symbol = grayRoot()[0].pop();
  finishgc();
  String(symbol);
}
run();
