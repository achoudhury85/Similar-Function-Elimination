var asm = (function(global, env, buffer) {

var c=new global.Int8Array(buffer);
var d=new global.Int16Array(buffer);
var e=new global.Int32Array(buffer);
var f=new global.Uint8Array(buffer);
var g=new global.Uint16Array(buffer);
var h=new global.Uint32Array(buffer);
var i=new global.Float32Array(buffer);
var j=new global.Float64Array(buffer);
var S = global.Math.imul;

// EMSCRIPTEN_START_FUNCS
function Unb(a,b){a=a|0;b=+b;return +(+yja(b,1))}
function WCb(a,b){a=a|0;b=+b;return +(+ila(b,0.0))}
function yja(a,b){a=a|0;b=b|0;};
function ila(a,b){a=a|0;b=+b;};
// EMSCRIPTEN_END_FUNCS

var table = [Unb];
var table2 = [WCb];

return {};

})(globals, myEnv, myBuffer);