
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

function a(d, e, f)
{
    d = +d;
    e = +e;
    f = f|0;
    var abc = 0;
    abc = abc+1;
    abc = abc*2;
    k();
    return 0;
}

function b(d, e, f)
{
    d = +d;
    e = +e;
    f = f|0;
    var abc = 0;
    abc = abc+1;
    abc = abc*3;
    l();
    return 0;
}

function k()
{
  return 0;
}

function l()
{
  return 0;
}

// EMSCRIPTEN_END_FUNCS

var table = [a, b];
var table2 = [k];

return {};

})(globals, myEnv, myBuffer);
