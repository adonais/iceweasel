// |reftest| skip-if(!xulRuntime.shell)

// Timeouts are called in FIFO order
let firstCalled = false;
setTimeout(() => firstCalled = true, 0);
setTimeout(() => assertEq(firstCalled, true), 0);
drainJobQueue();
assertEq(firstCalled, true);

// Timeouts run after microtask queue is fully drained
let drainedQueue = false;
setTimeout(() => assertEq(drainedQueue, true));
Promise.resolve().then().then(() => drainedQueue = true);
drainJobQueue();
assertEq(drainedQueue, true);

// Cannot use a CCW for the callback
let g = newGlobal({newCompartment: true});
assertThrowsInstanceOf(() => g.setTimeout(() => {}), g.Error);

reportCompare(true, true);
