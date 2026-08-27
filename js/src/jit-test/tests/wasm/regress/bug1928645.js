let src = `
  (type (;0;) (sub (func (param i32))))
  (table (;0;) 164 funcref ref.func 33)
  (export "" (table 0))
  (elem (;0;) (i32.const 86) func 39 37 1 50 49 8 14 39 46)
  (elem (;2;) (i32.const 0) func 50 34)
  (elem (;3;) (table 0) (i32.const 7) func 15 15 15 15 15 15 15 15 15 15 15 15 15 42 1 1 12 5 1 8 17 1 53 1)
  (func (;0;) (type 0) (param i32)
  )
  (func (;1;) (type 0) (param i32)
  )
  (func (;2;) (type 0) (param i32))
  (func (;3;) (type 0) (param i32))
  (func (;4;) (type 0) (param i32))
  (func (;5;) (type 0) (param i32))
  (func (;6;) (type 0) (param i32))
  (func (;7;) (type 0) (param i32))
  (func (;8;) (type 0) (param i32))
  (func (;9;) (type 0) (param i32))
  (func (;10;) (type 0) (param i32))
  (func (;11;) (type 0) (param i32))
  (func (;12;) (type 0) (param i32))
  (func (;13;) (type 0) (param i32))
  (func (;14;) (type 0) (param i32))
  (func (;15;) (type 0) (param i32))
  (func (;16;) (type 0) (param i32))
  (func (;17;) (type 0) (param i32))
  (func (;18;) (type 0) (param i32))
  (func (;19;) (type 0) (param i32))
  (func (;20;) (type 0) (param i32))
  (func (;21;) (type 0) (param i32))
  (func (;22;) (type 0) (param i32))
  (func (;23;) (type 0) (param i32))
  (func (;24;) (type 0) (param i32))
  (func (;25;) (type 0) (param i32))
  (func (;26;) (type 0) (param i32))
  (func (;27;) (type 0) (param i32))
  (func (;28;) (type 0) (param i32))
  (func (;29;) (type 0) (param i32))
  (func (;30;) (type 0) (param i32))
  (func (;31;) (type 0) (param i32))
  (func (;32;) (type 0) (param i32))
  (func (;33;) (type 0) (param i32))
  (func (;34;) (type 0) (param i32))
  (func (;35;) (type 0) (param i32))
  (func (;36;) (type 0) (param i32))
  (func (;37;) (type 0) (param i32))
  (func (;38;) (type 0) (param i32))
  (func (;39;) (type 0) (param i32))
  (func (;40;) (type 0) (param i32))
  (func (;41;) (type 0) (param i32))
  (func (;42;) (type 0) (param i32))
  (func (;43;) (type 0) (param i32))
  (func (;44;) (type 0) (param i32))
  (func (;45;) (type 0) (param i32))
  (func (;46;) (type 0) (param i32))
  (func (;47;) (type 0) (param i32))
  (func (;48;) (type 0) (param i32))
  (func (;49;) (type 0) (param i32))
  (func (;50;) (type 0) (param i32))
  (func (;51;) (type 0) (param i32))
  (func (;52;) (type 0) (param i32))
  (func (;53;) (type 0) (param i32))
`;
module = new WebAssembly.Module(wasmTextToBinary(src));
imports = {};
args = [0];
instance = new WebAssembly.Instance(module, imports);
el = instance.exports[""];
eel = el.get(0);
eel(...args);
eel = el.get(1);
tmp = function() {
  for (let j = 0; j < 23; ++j) {
    try {
      eel(0);
    } catch(exc) {}
  }
};
tmp();
eel = el.get(3);
tmp();
eel = el.get(9);
tmp();
eel = el.get(20);
tmp();
eel = el.get(21);
tmp();
eel = el.get(23);
tmp();
eel = el.get(24);
tmp();
eel = el.get(26);
tmp();
eel = el.get(27);
tmp();
eel = el.get(29);
tmp();
eel = el.get(87);
tmp();
eel = el.get(90);
tmp();
eel = el.get(92);
tmp();
eel = el.get(93);
tmp();
eel = el.get(94);
tmp();
