// |jit-test| --enable-symbols-as-weakmap-keys; skip-if: getBuildConfiguration("release_or_beta")

class b {
  #c;
  #$; 
  #n; 
  #m; 
  #e; 
  #f; 
  #g;
};
class h {
  #$;
  #n;
  #m;
  #e;
  #f;
  #g;
};
let keyZone = newGlobal({newCompartment: true});
let i = newGlobal({newCompartment: true});
keyZone.eval('var key = Symbol()');
i.eval('map = new WeakMap');
i.keyZone = keyZone;
i.eval('map.set(keyZone.key, {})');
schedulezone(i);
schedulezone('atoms');
gc('zone');

