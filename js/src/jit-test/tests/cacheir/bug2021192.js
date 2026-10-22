function store(target, numeric) {
  target[(numeric < -1 ? numeric : -1) - Math.max(0, -0)] = 1;
}
const target = {};
for (let iteration = 0; iteration < 2000; iteration++) {
  store(target, 0);
}
