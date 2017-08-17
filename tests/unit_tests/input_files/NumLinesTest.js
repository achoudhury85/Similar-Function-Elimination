
var asm = (function(global, env, buffer) {
// EMSCRIPTEN_START_FUNCS

function XYc(b, c, d) {
 b = b | 0;
 c = c | 0;
 d = d | 0;
 do if (b << 24 >> 24 == c << 24 >> 24) {
  a[d >> 0] = b;
  d = 1;
 } else {
  if (!(b << 24 >> 24 == 1 & c << 24 >> 24 == 2) ? !(b << 24 >> 24 == 2 & c << 24 >> 24 == 1) : 0) {
   if (!(b << 24 >> 24 == 3 & c << 24 >> 24 == 4) ? !(b << 24 >> 24 == 4 & c << 24 >> 24 == 3) : 0) {
    if (((c + -3 << 24 >> 24 | b + -1 << 24 >> 24) & 255) < 2) {
     a[d >> 0] = c;
     d = 1;
     break;
    }
    if (((c + -1 << 24 >> 24 | b + -3 << 24 >> 24) & 255) < 2) {
     a[d >> 0] = b;
     d = 1;
     break;
    }
    if (!(b << 24 >> 24 == 6 & c << 24 >> 24 == 7) ? !(b << 24 >> 24 == 7 & c << 24 >> 24 == 6) : 0) {
     d = 0;
     break;
    }
    a[d >> 0] = 7;
    d = 1;
    break;
   }
   a[d >> 0] = 4;
   d = 1;
   break;
  }
  a[d >> 0] = 2;
  d = 1;
 } while (0);
 return d | 0;
}

function D5a(b, c, d) {
 b = b | 0;
 c = c | 0;
 d = d | 0;
 if (!(a[b + 52 >> 0] | 0)) w4a(c, d); else K4a(c, d);
 return;
}

// EMSCRIPTEN_END_FUNCS

})(globals, myEnv, myBuffer);
