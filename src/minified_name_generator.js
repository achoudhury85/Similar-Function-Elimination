String.prototype.replaceAt=function(index, character) {
  return this.substr(0, index) + character + this.substr(index+character.length);
}

// Targeted class that generates minified names for two different scenarios for SFE:
//
// a. Function identifier generation when generating helper functions for similar functions
// b. Variable name generation when generating extra parameters for a generated helper function
//
// Restrictions:
// a. Function names should not conflict with any other variable/function defined at global scope
// b. Variable names should not conflict with any identifier at local scope
//
// One thing to note here is that variable names can conflict with other variables at global scope
// that are not referenced by the current function
var MinifiedNameGenerator = function() {
  // Members used for generating minified names
  this.scopeChain = undefined;
  this.shortestUsedIdentifier = undefined;
}

MinifiedNameGenerator.ReservedKeywords = new Set(['do', 'if', 'in', 'for', 'new', 'try', 'var', 'env', 'let', 'case', 'else', 'enum', 'void', 'this', 'void', 'with', 'await']);
MinifiedNameGenerator.ValidInitialCharacters = '$ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
MinifiedNameGenerator.ValidFollowingCharacters = '$0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

// Static methods
MinifiedNameGenerator.getNextCharInArray = function(curChar, array) {
  var index = array.indexOf(curChar);
  return array.charAt((index+1)%array.length);
}

MinifiedNameGenerator.getNextValidLater = function(curChar) {
  return MinifiedNameGenerator.getNextCharInArray(curChar, MinifiedNameGenerator.ValidInitialCharacters);
}

MinifiedNameGenerator.getNextValidInit = function(curChar) {
  return MinifiedNameGenerator.getNextCharInArray(curChar, MinifiedNameGenerator.ValidInitialCharacters);
}

MinifiedNameGenerator.getNextValidCharacter = function(curChar, index) {
  if (index === 0) {
    return MinifiedNameGenerator.getNextValidInit(curChar);
  }

  return MinifiedNameGenerator.getNextValidLater(curChar);
}

MinifiedNameGenerator.generateHelper = function(minifiedName, charIndex) {
  if (charIndex === -1) {
    minifiedName = MinifiedNameGenerator.ValidInitialCharacters.charAt(0) + minifiedName;
  } else {
    var moveLeft = ((charIndex === 0) && (minifiedName[charIndex] === MinifiedNameGenerator.ValidInitialCharacters.slice(-1))) ||
                    ((charIndex > 0) && (minifiedName[charIndex] === MinifiedNameGenerator.ValidInitialCharacters.slice(-1)));

    minifiedName = minifiedName.replaceAt(
                      charIndex,
                      MinifiedNameGenerator.getNextValidCharacter(minifiedName.charAt(charIndex), charIndex));

    if (moveLeft) {
      minifiedName = MinifiedNameGenerator.generateHelper(minifiedName, charIndex-1);
    }
  }

  return minifiedName;
}

// Instance methods
MinifiedNameGenerator.prototype.reset = function() {
  this.scopeChain = undefined;
  this.shortestIdentifier = undefined;
}

// Scope chain here is an array of sets, where each
// value in the set represents a unique identifier
MinifiedNameGenerator.prototype.initialize = function(scopeChain) {
  this.scopeChain = scopeChain;

  // Start off at the shortest possible name
  this.shortestUsedIdentifier = MinifiedNameGenerator.ValidInitialCharacters[0];
}

MinifiedNameGenerator.prototype.inUse = function(identifier) {
  var used = false;
  var scopeChain = this.scopeChain;
  var numScopes = scopeChain.length;
  for (var scopeIndex = 0; scopeIndex < numScopes; ++scopeIndex) {
    var curIdentifiers = scopeChain[scopeIndex];

    if (curIdentifiers.has(identifier)) {
      used = true;
      break;
    }
  }

  return used;
}

MinifiedNameGenerator.prototype.generate = function() {
  var minifiedName = this.shortestUsedIdentifier;
  var scopeChain = this.scopeChain;

  while (MinifiedNameGenerator.ReservedKeywords.has(minifiedName) || this.inUse(minifiedName)) {
    minifiedName = MinifiedNameGenerator.generateHelper(minifiedName, minifiedName.length-1);
  }

  // Add to scope chain
  scopeChain[scopeChain.length-1].add(minifiedName);
  this.shortestUsedIdentifier  = minifiedName;

  return minifiedName;
}

module.exports = {
  MinifiedNameGenerator: MinifiedNameGenerator
};
