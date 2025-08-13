// |jit-test| --delazification-mode=concurrent-df

s1 = function s1(s1a0) {
    s2 = function s2(s2a0, s2a1, s2a2) { };
}
s3 = (function s3(){
    return function s4(a0, a1, s4a2) {
        function s5(a0, a1, s5a2) { }
  };
})();
