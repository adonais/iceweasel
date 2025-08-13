// |jit-test| --delazification-mode=concurrent-df

var d = 1;
function heavy(x, y) {
    eval(x);
    return function lite() {
        assertEq(d, y);
    };
}

heavy("var d = 100;", 100)();
