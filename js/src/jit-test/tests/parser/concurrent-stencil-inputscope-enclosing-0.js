// |jit-test| --delazification-mode=concurrent-df

(function s1() {
  s2 = (function(){
    function s3() { };
  })();
})();
