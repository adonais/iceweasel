// |jit-test| --delazification-mode=concurrent-df

s1 = function s1() {
  function s2() {};
}
