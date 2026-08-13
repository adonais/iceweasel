// |jit-test| test-also=--ion-regalloc=simple

setIonCheckGraphCoherency(false);
load(libdir + 'bullet.js');
runBullet();
