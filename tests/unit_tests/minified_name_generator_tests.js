var chai = require('chai');
var expect = chai.expect;
var MinifiedNameGenerator = require('../../src/minified_name_generator.js').MinifiedNameGenerator;
var utils = require('../../src/utils.js');

function getPreviousCharInArray(char, array) {
  var index = array.indexOf(char);
  return array.charAt((array.length + index - 1)%array.length);
}

function getPreviousInit(char) {
  return getPreviousCharInArray(char, MinifiedNameGenerator.ValidInitialCharacters);
}

function getPreviousLater(char) {
  return getPreviousCharInArray(char, MinifiedNameGenerator.ValidFollowingCharacters);
}

function getPrevious(char, index) {
  if (index == 0) {
    return getPreviousInit(char);
  } else {
    return getPreviousLater(char);
  }
}

function getPredecessor(token) {
  for (var index = token.length-1; index >= 0; --index) {
    var curChar = token[index];
    var prevChar = getPrevious(curChar, index);
    token = token.replaceAt(index, prevChar);

    // If we didn't underflow back to the end of the array, we can stop now
    if (prevChar < curChar) {
      break;
    }
  }

  return token;
}

function getReservedKeywordPredecessors() {
  var tokens = Array.from(MinifiedNameGenerator.ReservedKeywords).slice();

  for (var tokenIndex = 0; tokenIndex < tokens.length; ++tokenIndex) {
    tokens[tokenIndex] = getPredecessor(tokens[tokenIndex]);
  }

  return tokens;
}

function createNameGenerator(scopeVars) {
  var minifiedNameGenerator = new MinifiedNameGenerator();
  minifiedNameGenerator.initialize([scopeVars]);
  return minifiedNameGenerator;
}

describe('MinifiedNameGenerator', function() {
  it('does not use reserved keywords when generating minified names', function() {
    // Tokens that represent the previous valid identifier - we want to make sure that
    // the minified name generator does not generate a reserved keyword when the shortest
    // used identifier is set to one of these tokens
    var tokens = getReservedKeywordPredecessors();
    var reservedKeywords = Array.from(MinifiedNameGenerator.ReservedKeywords);
    var minifiedNameGenerator = createNameGenerator(new Set());

    for (var index = 0; index < tokens.length; ++index) {
      var token = tokens[index];
      minifiedNameGenerator.shortestUsedIdentifier = token;
      expect(minifiedNameGenerator.generate()).to.not.equal(reservedKeywords[index]);
    }
  });
});

describe('MinifiedNameGenerator', function() {
  it('respects the passed in scope chain when generating new identifiers', function() {
    var scopeVars = ['abc', 'def', 'ghi'];
    var minifiedNameGenerator = createNameGenerator(new Set(scopeVars));

    for (var index = 0; index < scopeVars.length; ++index) {
      var scopeVarPredecessor = getPredecessor(scopeVars[index]);
      minifiedNameGenerator.shortestUsedIdentifier = scopeVarPredecessor;
      expect(minifiedNameGenerator.generate()).to.not.equal(scopeVars[index]);
    }
  });
});

describe('MinifiedNameGenerator', function() {
  it('correctly detects if an identifier is in use within its scope chain', function() {
    var scopeChain = [];
    scopeChain.push(new Set(['abc', 'def', 'ghi']));
    scopeChain.push(new Set(['bbc', 'bef', 'bhi']));

    var minifiedNameGenerator = new MinifiedNameGenerator();
    minifiedNameGenerator.initialize(scopeChain);

    for (var index = 0; index < scopeChain.length; ++index) {
      var curScope = scopeChain[index];

      curScope.forEach(function(value) { expect(minifiedNameGenerator.inUse(value)).to.equal(true); });
    }
  });
});

describe('MinifiedNameGenerator', function() {
  it('generates identifiers incrementally to guarantee that we have the shortest possible identifier', function() {
    var testTokens = ['abc', 'def', 'ghi'];
    var testTokenPredecessors = [];

    for (var index = 0; index < testTokens.length; ++index) {
      testTokenPredecessors.push(getPredecessor(testTokens[index]));
    }

    var minifiedNameGenerator = createNameGenerator(new Set(testTokenPredecessors));

    for (var index = 0; index < testTokens.length; ++index) {
      minifiedNameGenerator.shortestUsedIdentifier = testTokenPredecessors[index];
      expect(minifiedNameGenerator.generate()).to.equal(testTokens[index]);
    }
  });
});
