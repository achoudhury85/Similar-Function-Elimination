///////////////////////////////////////////////////////////////////////////////////////////////
// run_sfe.js
//
// This file is used to invoke similar function elimination functionality.
///////////////////////////////////////////////////////////////////////////////////////////////
var sfe = require('./similar_function_eliminator.js');
var arguments_ = process['argv'].slice(2);
var jsFile = undefined, similarFunctionsFile = undefined;
var analyze = false;
var compact = true;

for (var argIndex = 0; argIndex < arguments_.length; ++argIndex) {
  var arg = arguments_[argIndex];
  if (arg === '--file') {
    if (argIndex === arguments_.length_ - 1) {
      throw new Error('Please specify valid arguments!');
    }

    jsFile = arguments_[argIndex+1];
    argIndex += 1;
  } else if (arg === '--analyze') {
    analyze = true;
  } else if (arg === '--no-compact') {
    compact = false;
  }
}

sfe.run(jsFile, compact, analyze);
