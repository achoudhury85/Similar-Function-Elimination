var nodeFS = require('fs');
var nodePath = require('path');
var extend = require('util')._extend;

if (!nodeFS.existsSync) {
  nodeFS.existsSync = function(path) {
    try {
      return !!nodeFS.readFileSync(path);
    } catch (e) {
      return false;
    }
  }
}

var Utils = function() {}

Utils.find = function(filename) {
  var prefixes = [nodePath.join(__dirname, '..', 'src'), process.cwd()];
  for (var i = 0; i < prefixes.length; ++i) {
    var combined = nodePath.join(prefixes[i], filename);
    if (nodeFS.existsSync(combined)) {
      return combined;
    }
  }
  return filename;
}

Utils.read = function(filename) {
  var absolute = Utils.find(filename);
  return nodeFS['readFileSync'](absolute).toString();
};

Utils.print = function(x) {
  process['stdout'].write(x + '\n');
};

Utils.printErr = function(x) {
  process['stderr'].write(x + '\n');
};

Utils.dumpSet = function(set) {
  Utils.print(JSON.stringify(Array.from(set)));
}

// Compares two value arrays. Returns true if they contain the same elements (in the same order)
Utils.compareValueArrays = function(array1, array2) {
  var equal = array1.length == array2.length;

  if (equal) {
    var length = array1.length;
    for (var index = 0; index < length; ++index) {
      if (array1[index] !== array2[index]) {
        equal = false;
        break;
      }
    }
  }

  return equal;
}

Utils.deepCopyAst = function(ast) {
  return extend({}, ast);
}

module.exports = {
  compareValueArrays: Utils.compareValueArrays,
  deepCopyAst: Utils.deepCopyAst,
  dumpSet: Utils.dumpSet,
  print: Utils.print,
  printErr: Utils.printErr,
  read: Utils.read,
  Utils: Utils,
};
