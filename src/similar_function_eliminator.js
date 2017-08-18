var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');
var crypto = require('crypto');

var SFE = require('./sfe.js');

var jsFileData = "";
var SFE_MIN_LINES = 4;

// Main class that performs all of the tasks associated with similar function elimination
var SimilarFunctionEliminator = function(filename) {
  this.typedArrays = {};
  this.integerMultiplicationFunction = undefined;
  this.bitwiseSignedOperators = new Set(['|', '&', '^', '<<', '>>']);
  this.comparisonOperators = new Set(['==', '!=', '===', '!==', '>', '>=', '<', '<=']);
  this.ast = undefined;
  this.asmAst = undefined;
  this.shadowAsmAst = undefined;
  this.functionNameToIndex = {};
  this.functionTableCollection = undefined;
  this.asmAstFunctionIndexRange = {};
  this.similarFunctions = [];
  this.modifiedTables = undefined;
  this.src = SFE.Utils.read(filename);

  // Used for generating function names and function table names
  this.globalNameGenerator = new SFE.MinifiedNameGenerator();

  // Used for generating variable names within functions
  this.localNameGenerator = new SFE.MinifiedNameGenerator();
}

SimilarFunctionEliminator.prototype.srcToAst = function () {
    return esprima.parse(this.src);
}

SimilarFunctionEliminator.prototype.getIdentifiers = function(ast) {
  var astIdentifiers = new Set();

  estraverse.traverse(ast, {
    enter: function(node)
    {
      if (node.type === "Identifier") {
        astIdentifiers.add(node.name);
      }
    }
  });

  return astIdentifiers;
}

SimilarFunctionEliminator.prototype.populateTypedArrays = function() {
  var asmAstBody = this.asmAst.body;
  var typedArrayToShift = {
    'Int8Array':  0,
    'Int16Array': 1,
    'Int32Array': 2,
    'Uint8Array': 0,
    'Uint16Array': 1,
    'Uint32Array': 2,
    'Float32Array': 2,
    'Float64Array': 3
  };

  var asmAstBodyLength = asmAstBody.length;
  for (var index = 0; index < asmAstBodyLength; ++index) {
    var curNode = asmAstBody[index];
    if (curNode.type === 'VariableDeclaration') {
      var declarations = curNode.declarations;
      var numDeclarations = declarations.length;

      for (var declIndex = 0; declIndex < numDeclarations; ++declIndex) {
        var curDeclaration = declarations[declIndex];
        var init = curDeclaration.init;
        var callee = init.callee;

        // If we detect a typed array declaration
        if (init.type === 'NewExpression' &&
            callee.type === 'MemberExpression' &&
            callee.object.name === 'global' &&
            callee.computed === false &&
            (callee.property.name in typedArrayToShift)) {
          var calleeProperty = callee.property;
          // Store off the name of the variable and its type
          this.typedArrays[curDeclaration.id.name] = {
            type: calleeProperty.name,
            shift: typedArrayToShift[calleeProperty.name]
          };
        }
      }
    }
  }
}

// As per the asm.js spec, the * operator does not support int
// types. The recommended approach is to use the Math.imul function.
// Accordingly, we will use this function when we detect that we are
// parametrizing literals inside multiplication operations.
SimilarFunctionEliminator.prototype.populateIntegerMultiplicationFunction = function() {
  var asmAstBody = this.asmAst.body;
  var length = asmAstBody.length;

  for (var index = 0; index < length; ++index) {
    var curNode = asmAstBody[index];
    if (curNode.type === 'VariableDeclaration') {
      var declarations = curNode.declarations;
      var declLength = declarations.length;
      for (var declIndex = 0; declIndex < declLength; ++declIndex) {
        var curDeclaration = declarations[declIndex];
        var init = curDeclaration.init;

        if (init.type === 'MemberExpression' &&
            init.computed === false) {
          var object = init.object;

          if(object.type === 'MemberExpression' &&
             object.object.name === 'global' &&
             object.property.name === 'Math' &&
             init.property.name === 'imul') {
            this.integerMultiplicationFunction = curDeclaration.id.name;
            break;
          }
        }
      }
    }
  }
}

SimilarFunctionEliminator.prototype.initialize = function() {
  this.ast = this.srcToAst();
  this.asmAst = this.getAsmAst(this.ast);
  this.shadowAsmAst = this.getAsmAst(this.srcToAst());
  this.genFunctionNameToIndexDict();
  this.populateTypedArrays();
  this.populateIntegerMultiplicationFunction();
  this.functionTableCollection = this.computeFunctionTableCollection();

  var scopeChain = new Array(2); // Chain of scopes - where each scopes has the locals for that scope along with their types
  scopeChain[0] = SimilarFunctionEliminator.getLocalsSetForNode(this.ast);
  scopeChain[1] = SimilarFunctionEliminator.getLocalsSetForNode(this.asmAst);

  this.globalNameGenerator.initialize(scopeChain);
}

// Helper function useful for dealing with the shadow asm ast
SimilarFunctionEliminator.prototype.getFunctionNodeFromAst = function(functionName, asmAst) {
  return asmAst.body[this.functionNameToIndex[functionName]]
}

SimilarFunctionEliminator.prototype.getFunctionNode = function(functionName) {
  return this.asmAst.body[this.functionNameToIndex[functionName]];
}

SimilarFunctionEliminator.prototype.genFunctionNameToIndexDict = function() {
  var asmAstBody = this.asmAst.body;
  var asmAstBodyLength = asmAstBody.length;
  var functionNameToIndex = this.functionNameToIndex;

  for (var index = 0; index < asmAstBodyLength; ++index) {
    var node = asmAstBody[index];

    if (node.type === 'FunctionDeclaration') {
      functionNameToIndex[node.id.name] = index;
    }
  }
}

SimilarFunctionEliminator.prototype.getAsmAst = function(ast) {
  var asmAst = undefined;
  var astBody = ast.body;
  var astBodyLength = astBody.length;

  for (var index = 0; index < astBodyLength; ++index) {
    var node = astBody[index];

    if (node.type === "VariableDeclaration" &&
        node.declarations[0].id.name === "asm") {
      asmAst = node.declarations[0].init.callee.body;

      break;
    }
  }

  // Used for custom codegenning as the default codegen option converts floats to int.
  this.markupLiterals(asmAst);

  return asmAst;
}

SimilarFunctionEliminator.prototype.getTableForFunctions = function(functionNames) {
  // All function names MUST belong in the same table
  // Accordingly we first find the common table. If none is present,
  // we will create one.
  var commonTable = undefined;
  var commonType = undefined;
  var tableCollection = this.functionTableCollection;
  var numTables = tableCollection.length;
  var numFunctions = functionNames.length;
  var functionNameToIndex = this.functionNameToIndex;
  var globalNameGenerator = this.globalNameGenerator;

  for (var index = 0; index < numFunctions; ++index) {
    var curFunction = functionNames[index];
    var table = tableCollection.lookupFunction(curFunction);

    if (typeof(commonTable) === 'undefined') {
      commonTable = table;
    } else if ((typeof(table) !== 'undefined') && table.name !== commonTable.name) {
      throw new Error('Found two replacement values in different tables: ' + JSON.stringify(table, null, 2) + ', ' + JSON.stringify(commonTable, null, 2));
    }

    var functionNode = this.getFunctionNode(curFunction);

    if (typeof(functionNode) !== 'undefined') {
      var functionType = SimilarFunctionEliminator.getFunctionType(functionNode);

      if (typeof(commonType) === 'undefined') {
        commonType = functionType;
      } else if (!SFE.Utils.compareValueArrays(functionType, commonType)) {
        throw new Error('Found two replacement values with different function types: ' + JSON.stringify(functionType) + ', ' + JSON.stringify(commonType));
      }
    }
  }

  if (typeof(commonTable) === 'undefined') {
      if (typeof(commonType) !== 'undefined') {
      // Attempt to find the table with the common type
      for (var collectionIndex = 0; collectionIndex < numTables; ++collectionIndex) {
        var curTable = tableCollection.at(collectionIndex);

        if ((typeof(curTable.type) !== 'undefined') && SFE.Utils.compareValueArrays(curTable.type, commonType)) {
          commonTable = curTable;
          break;
        }
      }
    }

    if (typeof(commonTable) === 'undefined') {
      commonTable = new SFE.FunctionTable(globalNameGenerator.generate(), commonType, /*needs codegen*/ true);
      tableCollection.add(commonTable);
    }
  }

  for (var index = 0; index < numFunctions; ++index) {
    // NOTE: We only insert the function if it is present
    // to account for unresolved externals, etc.
    if (!commonTable.contains(functionNames[index]) && (functionNames[index] in functionNameToIndex)) {
      commonTable.addNew(functionNames[index]);
    }
  }

  return commonTable;
}


SimilarFunctionEliminator.prototype.evaluateAsmTypeForNode = function(node, locals) {
  var asmType = undefined;
  var type = node.type;

  if (type === 'Identifier' && (node.name in locals)) {
    asmType = locals[node.name];
  } else if (type === 'Literal') {
    asmType = SimilarFunctionEliminator.getAsmTypeFromLiteral(node);
  } else if (type === 'BinaryExpression') {
    var leftAsmType = this.evaluateAsmTypeForNode(node.left, locals);
    var operator = node.operator;

    if (operator === '+' || operator === '-' || operator === '*') {
      asmType = leftAsmType;
    } else if (operator == '/' || operator === '%') {
      if (leftAsmType === 'signed' || leftAsmType === 'int') {
        asmType = 'int';
      } else if (leftAsmType === 'double') {
        asmType = 'double';
      } else {
        throw new Error("Encountered binary expression that we could not evaluate!");
      }
    } else if (this.bitwiseSignedOperators.has(operator)) {
      asmType = 'signed';
    } else if (operator === '>>>') {
      asmType = 'unsigned';
    } else if (this.comparisonOperators.has(operator)) {
      asmType = 'int';
    }
  } else if (type === 'UnaryExpression') {
    var operator = node.operator;

    var argumentAsmType = this.evaluateAsmTypeForNode(node.argument, locals);
    if (operator === '+') {
      asmType = 'double';
    } else if (operator === '-') {
      asmType = argumentAsmType;
    } else if (operator === '~') {
      asmType = 'signed';
    } else if (operator === '!') {
      asmType = 'int';
    }
  }

  return asmType;
}

// Reverses the canonicalization process - generating parameters for placeholder
// values that are deemed different across a set of similar functions.
SimilarFunctionEliminator.prototype.uncanonicalize = function(functionAst, placeholderData) {
  if (functionAst.defaults.length !== 0) {
    throw new Error("We do not currently support AST modification of functions with default parameters!");
  }

  var localNameGenerator = this.localNameGenerator;
  localNameGenerator.initialize([this.getIdentifiers(functionAst)]);

  var replacementVariables = [];
  var parameters = {};
  var asmComplianceChecker = new SFE.AsmComplianceChecker(this);
  var asmAstBody = this.asmAst.body;

  // Parameter type annotations for the additional parameters
  var additionalParameterAnnotations = [];
  var sfe = this;

  estraverse.traverse(functionAst, {
    enter: function(node, parent) {
      var type = node.type;

      if (type === 'Identifier' && node.name in placeholderData) {
        var name = node.name;
        var placeholderInfo =  placeholderData[name];

        if (placeholderInfo.parametrize) {
          var variableName = parameters[name];

          if (typeof(variableName) === 'undefined')  {
            parameters[name] = localNameGenerator.generate();
            variableName = parameters[name];
            replacementVariables.push(variableName);
            additionalParameterAnnotations.push(sfe.genParameterAnnotation(variableName, placeholderInfo.asmType));
          }

          if (placeholderInfo.type === 'CallExpression') {
            var table = placeholderInfo.functionTable;
            var tableMask = table.length-1; // The length of the table is guaranteed to be a power of 2

            // Morph this identifier into a member expression
            // that invokes the right function table with the
            // right index
            node.type = 'MemberExpression';
            node.computed = true;
            delete node.name;

            node.object = {
              type: 'Identifier',
              name: table.name
            };

            node.property = {
              type: 'BinaryExpression',
              operator: '&',
              left: {
                type: 'Identifier',
                name: variableName
              },
              right: {
                type: 'Literal',
                value: tableMask,
                raw: tableMask.toString()
              }
            };
          } else if (placeholderInfo.type === 'Identifier') {
            node.name = variableName;
          }
        } else {
          node.name = placeholderInfo.replacementValues[0].name;
        }
      } else if (type === 'Literal' && node.value in placeholderData) {
        var nodeValue = node.value;
        var placeholderInfo =  placeholderData[nodeValue];

        if (placeholderInfo.parametrize) {
          var variableName = parameters[nodeValue];

          if (typeof(variableName) === 'undefined') {
            parameters[nodeValue] = localNameGenerator.generate();
            variableName = parameters[nodeValue];
            replacementVariables.push(variableName);
            additionalParameterAnnotations.push(sfe.genParameterAnnotation(variableName, placeholderInfo.asmType));
          }

          // Extra asm checks
          asmComplianceChecker.addToQueue(node, node.type, parent);

          // We morph the node into an identifier
          node.name = variableName;
          delete node.value;
          delete node.raw;
          delete node.verbatim;
          node.type = 'Identifier';
        } else {
          var firstReplacementValue = placeholderInfo.replacementValues[0];
          node.value = firstReplacementValue.value;
          node.raw = firstReplacementValue.raw;
          node.verbatim = firstReplacementValue.verbatim;
        }
      }
    }
  });

  // Add parameter type annotations for the new parameters
  var functionBody = functionAst.body.body;
  functionBody.splice.apply(functionBody, [functionAst.params.length, 0].concat(additionalParameterAnnotations));

  var replacementVariablesLength = replacementVariables.length;
  for (var replacementIndex = 0; replacementIndex < replacementVariablesLength; ++replacementIndex) {
    functionAst.params.push({type: "Identifier", name: replacementVariables[replacementIndex]});
  }

  // Generate a new name for this helper function
  functionAst.id.name = this.globalNameGenerator.generate();

  var locals = SimilarFunctionEliminator.getLocalsForFunctionNode(functionAst);

  // Asm compliance checks
  asmComplianceChecker.run(locals);

  this.localNameGenerator.reset();

  return parameters;
}

// Identify the function tables in the ASM AST
// and store off their data so that we know the
// index of a function in a function table.
SimilarFunctionEliminator.prototype.computeFunctionTableCollection = function() {
  var asmAstBody = this.asmAst.body;
  var tableCollection = new SFE.FunctionTableCollection();

  for (var bodyIndex = 0; bodyIndex < asmAstBody.length; ++bodyIndex) {
    var curNode = asmAstBody[bodyIndex];

    if (curNode.type === 'VariableDeclaration') {
      var declarations = curNode.declarations;
      var declarationsLength = declarations.length;
      for (var declIndex = 0; declIndex < declarationsLength; ++declIndex) {
        var curDeclaration = declarations[declIndex];
        var init = curDeclaration.init;
        if (init.type === 'ArrayExpression') {
          var elements = init.elements;
          var elementsLength = elements.length;

          var curFunctionTable = new SFE.FunctionTable(
            curDeclaration.id.name,
            this.getFunctionTypeFromName(elements[0].name),
            /*needsCodegen*/ false
            );

          for (var arrayIndex = 0; arrayIndex < elementsLength; ++arrayIndex) {
            curFunctionTable.add(elements[arrayIndex].name);
          }

          tableCollection.add(curFunctionTable);
        }
      }
    }
  }

  return tableCollection;
}

SimilarFunctionEliminator.prototype.genVerbatimProperty = function(value) {
  return {content: value, precedence: escodegen.Precedence.Primary};
}

SimilarFunctionEliminator.prototype.clearNode = function(node) {
  for (var member in node) {
    delete node[member];
  }
}

SimilarFunctionEliminator.prototype.annotateInPlace = function(node, asmType) {
  var oldNode = SFE.Utils.deepCopyAst(node);

  if (asmType === 'double') {
    this.clearNode(node);
    node.type = 'UnaryExpression';
    node.prefix = true;
    node.operator = '+';
    node.argument = oldNode;
  } else if (asmType === 'int' || asmType === 'signed') {
    this.clearNode(node);
    node.type = 'BinaryExpression';
    node.operator = '|';
    node.left = oldNode;
    node.right = {
      type: 'Literal',
      value: 0,
      raw: '0'
    };
  } else if (asmType === 'unsigned') {
    this.clearNode(node);
    node.type = 'BinaryExpression';
    node.operator = '>>>';
    node.left = oldNode;
    node.right = {
      type: 'Literal',
      value: 0,
      raw: '0'
    };
  }
}

// Returns an asm.js annotated version of the node
SimilarFunctionEliminator.prototype.annotate = function(node, asmType) {
  var annotatedNode = node;
  if (asmType === 'double') {
    annotatedNode = {
      type: 'UnaryExpression',
      prefix: true,
      operator: '+',
      argument: node
    };
  } else if (asmType === 'int' || asmType === 'signed') {
    annotatedNode = {
      type: 'BinaryExpression',
      operator: '|',
      left: node,
      right: {
        type: 'Literal',
        value: 0,
        raw: '0'
      }
    };
  } else if (asmType === 'unsigned') {
    annotatedNode = {
      type: 'BinaryExpression',
      operator: '>>>',
      left: node,
      right: {
        type: 'Literal',
        value: 0,
        raw: '0'
      }
    };
  }

  return annotatedNode;
}

SimilarFunctionEliminator.prototype.genParameterAnnotation = function(variableName, asmType) {
  var assignmentStatement = {
    type: 'ExpressionStatement',
    expression: {
      type: 'AssignmentExpression',
      operator: '=',
      left: {
        type: 'Identifier',
        name: variableName
      },
      right: this.annotate({
        type: 'Identifier',
        name: variableName
      }, asmType)
    }
  };

  return assignmentStatement;
}

SimilarFunctionEliminator.prototype.modifyAsts = function() {
  var asmAstBody = this.asmAst.body;

  var similarFunctions = this.similarFunctions;
  var similarFunctionsLength = similarFunctions.length;
  for (var index = 0; index < similarFunctionsLength; ++index) {
    var similarFunctionData = similarFunctions[index];
    var functionAst = similarFunctionData.canonicalizedAst;
    this.identifyModifiedFunctionTables();
    var parameters = this.uncanonicalize(functionAst, similarFunctionData.placeholderData);

    // Update the table masks for the function ast
    this.updateTableMasks(functionAst);

    // Add the function ast at the end of the functions block of the asm ast
    asmAstBody.splice(this.asmAstFunctionIndexRange.endIndex+1, 0, functionAst);
    ++this.asmAstFunctionIndexRange.endIndex;

    // Update the ASTs of the other functions
    // We cull the body of the AST so that it invokes the
    // function we just created
    var functions = similarFunctionData.functions;
    var functionsLength = functions.length;
    var tableCollection = this.functionTableCollection;
    var functionNameToIndex = this.functionNameToIndex;

    for (var fnIndex = 0; fnIndex < functionsLength; ++fnIndex) {
      var functionName = functions[fnIndex];
      var astToCull = this.getFunctionNode(functionName);
      var functionType = SimilarFunctionEliminator.getFunctionType(astToCull);

      var returnStatementType = functionType[functionType.length-1];
      var astFnBody = astToCull.body.body;

      // Keep the parameter type annotations if this is an exported function
      astFnBody.splice(astToCull.params.length, astFnBody.length - astToCull.params.length);

      var callExpression = {
        type: 'CallExpression',
        callee: {type: 'Identifier', name: functionAst.id.name},
        arguments: astToCull.params.slice()
      };

      var returnStatement = {
        type: 'ReturnStatement',
        argument: null
      };

      if (returnStatementType === 'void') {
        astFnBody.push(callExpression);
      } else {
        // Since we're returning a non void type, we need to return the result of the call,
        // annotated with the right coercion
        returnStatement.argument = this.annotate(callExpression, returnStatementType);
        astFnBody.push(returnStatement);
      }

      var argsAst = callExpression.arguments;

      for (var placeholderName in parameters) {
        var placeholderInfo = similarFunctionData.placeholderData[placeholderName];
        var argAst = placeholderInfo.replacementValues[fnIndex];

        // For function call identifiers, we want to pass the index of the function
        // rather than the identifier to preserve asm.js functionality
        if (placeholderInfo.type === 'CallExpression') {
          var indexOfFunction = -1;

          if (argAst.name in functionNameToIndex) {
            indexOfFunction = tableCollection.lookupFunction(argAst.name).functionIndex(argAst.name);
          }

          // Morph the identifier ast into a literal ast
          delete argAst.name;
          argAst.type = 'Literal';
          argAst.value = indexOfFunction;
          argAst.raw = indexOfFunction.toString();
          argAst.verbatim = this.genVerbatimProperty(argAst.raw);
        }

        argsAst.push(argAst);
      }
    }
  }
}

SimilarFunctionEliminator.prototype.computeAsmAstFunctionIndexRange = function() {
  var startIndex = -1, endIndex = -1;
  var asmAstBody = this.asmAst.body;
  var asmAstBodyLength = asmAstBody.length;
  for (var index = 0; index < asmAstBodyLength; ++index) {
    if (startIndex === -1 && asmAstBody[index].type === 'FunctionDeclaration') {
      startIndex = index;
    } else if (startIndex !== -1 && ((index === (asmAstBodyLength-1)) || asmAstBody[index+1].type !== 'FunctionDeclaration')) {
      endIndex = index;
      break;
    }
  }

  this.asmAstFunctionIndexRange = {startIndex: startIndex, endIndex: endIndex};
}

// Computes the number of lines within the source function passed in.
// It is expected that the source function begins at the start index
// passed in.
SimilarFunctionEliminator.prototype.computeNumLines = function(startIndex) {
  var numLines = 0;
  var numBraces = 0;
  var sawBrace = false;
  var src = this.src;

  do
  {
    if (src[startIndex] == '{') {
      if (!sawBrace) {
        sawBrace = true;
      }

      ++numLines;
      ++numBraces;
    } else if (src[startIndex] == '}') {
      --numBraces;
      ++numLines;
    } else if (src[startIndex] == ';') {
      ++numLines;
    }
    ++startIndex;
  }
  while (!sawBrace || (numBraces != 0));

  return numLines;
}

// Computes all sets of similar functions in the asmAst passed in
SimilarFunctionEliminator.prototype.computeSimilarFunctions = function() {
  var sfeDict = {};

  var startToken = "// EMSCRIPTEN_START_FUNCS";
  var endToken = "// EMSCRIPTEN_END_FUNCS";
  var src = this.src;
  var startIndex = this.src.indexOf(startToken) + startToken.length;
  var functionsEndIndex = this.src.indexOf(endToken);
  var functionIdentifierToken = 'function ';
  var functionIdentifierTokenLength = functionIdentifierToken.length;

  startIndex = this.src.indexOf(functionIdentifierToken, startIndex) + functionIdentifierToken.length;

  while ((startIndex !== -1) && (startIndex < functionsEndIndex))
  {
    var functionName = this.src.substring(startIndex, this.src.indexOf('(', startIndex));
    var formals = this.src.substring(this.src.indexOf('(', startIndex), this.src.indexOf(')', startIndex)+1);
    var numLines = this.computeNumLines(startIndex);
    startIndex = this.src.indexOf(functionIdentifierToken, startIndex);

    if (startIndex !== -1) {
      startIndex += functionIdentifierTokenLength;
    }

    if (typeof(sfeDict[formals]) === 'undefined')
    {
      sfeDict[formals] = {};
    }

    var sfeFormalsDict = sfeDict[formals];

    if (typeof(sfeFormalsDict[numLines]) === 'undefined') {
      sfeFormalsDict[numLines] = [];
    }

    sfeFormalsDict[numLines].push(functionName);
  }

  var similarFunctions = [];
  var astHashToSimilarFunctionData = {};
  for (var formals in sfeDict) {
    var formalDict = sfeDict[formals];
    for (var numLines in formalDict) {
      var functionList = formalDict[numLines];
      var numFunctions = functionList.length;
      if (numLines >= SFE_MIN_LINES && (numFunctions > 1)) {
        for (var functionIndex = 0; functionIndex < numFunctions; ++functionIndex) {
          var curFunctionName = functionList[functionIndex];
          var placeholderData = {};
          var bodyHash = this.canonicalizeAndHash(curFunctionName, placeholderData);

          var similarFunctionData = astHashToSimilarFunctionData[bodyHash];

          if (typeof(similarFunctionData) === 'undefined') {
            astHashToSimilarFunctionData[bodyHash] = new SFE.SimilarFunctionData(placeholderData.ast);
            similarFunctionData = astHashToSimilarFunctionData[bodyHash];
          }
          similarFunctionData.add(curFunctionName, placeholderData, this);
        }
      }
    }
  }

  for (var astHash in astHashToSimilarFunctionData) {
    if (astHashToSimilarFunctionData[astHash].functions.length > 1) {
      similarFunctions.push(astHashToSimilarFunctionData[astHash]);
    }
  }

  this.similarFunctions = similarFunctions;
}

SimilarFunctionEliminator.prototype.updateTableMasks = function(ast) {
  var modifiedTables = this.modifiedTables;
  var tableCollection = this.functionTableCollection;
  var genVerbatimProperty = this.genVerbatimProperty;

  estraverse.traverse(ast, {
    enter: function(node) {
      var callee = node.callee;
      if (node.type === 'CallExpression' &&
          callee.type === 'MemberExpression') {
        var calleeObject = callee.object;
        var calleeProperty = callee.property;

        if(modifiedTables.has(callee.object.name) &&
           calleeProperty.type === 'BinaryExpression' &&
           calleeProperty.operator === '&') {

          // We know we have a mask for one of the modified tables
          // Lets make sure the mask is correct
          var table = tableCollection.lookupTable(calleeObject.name);
          var right = calleeProperty.right;
          right.value = table.length-1;
          right.raw = right.value.toString();
          right.verbatim = genVerbatimProperty(right.raw);
        }
      }
    }
  });
}

// Function that identifies function tables that we either added to or
// new function tables that were added for functions that did not
// previously belong in any function table.
SimilarFunctionEliminator.prototype.identifyModifiedFunctionTables = function() {
  // Ensure that we update table masks for all
  // function tables that need to be recodegenned
  var modifiedTables = new Set();
  var tableCollection = this.functionTableCollection;
  var collectionLength = tableCollection.length;

  for (var index = 0; index < collectionLength; ++index) {
    var functionTable = tableCollection.at(index);

    if (functionTable.needsCodegen) {
      modifiedTables.add(functionTable.name);
    }
  }

  this.modifiedTables = modifiedTables;

  return;
}

// @static
// Returns the ASM type for the coercion node passed in.
// A coercion node is expected to be of the form:
//
// <child_ast>|0 - integer type
// +<child_ast> - double type
// null - void type
SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode = function(annotatedNode) {
  var asmType = 'void';
  var type = annotatedNode.type;
  var operator = annotatedNode.operator;
  if (type === 'UnaryExpression' && operator === '+') {
    asmType = 'double';
  } else if ((type === 'BinaryExpression' &&
              operator === '|' &&
              annotatedNode.right.type === 'Literal' &&
              annotatedNode.right.value === 0)) {
    asmType = 'int';
  } else if (type === 'Literal') {
    asmType = SimilarFunctionEliminator.getAsmTypeFromLiteral(annotatedNode);
  } else if (type === 'UnaryExpression' && operator === '-' &&
            annotatedNode.argument.type === 'Literal') {
    asmType = 'int';
  }
  return asmType;
}

// @static
// Returns the asm type from the passed in return statement AST node
SimilarFunctionEliminator.getAsmTypeFromReturnStatement = function(functionNode) {
  var asmType = 'void';
  estraverse.traverse(functionNode, {
    enter: function(node) {
      var nodeArgument = node.argument;
      if (node.type === 'ReturnStatement' &&
          typeof(nodeArgument) !== 'undefined' &&
          nodeArgument != null) {

        var curAsmType = SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode(nodeArgument);

        // Its possible for multiple return annotations to exist
        // as there may be multiple return statements.
        // If we detect this - we give double highest preference,
        // followed by int, and then void.
        if ((curAsmType !== asmType) &&
            ((curAsmType === 'double') ||
            ((curAsmType === 'int') && asmType === 'void'))) {
            asmType = curAsmType;
          }
        }
      }
    });
  return asmType;
}

SimilarFunctionEliminator.prototype.getFunctionTypeFromName = function(functionName) {
  return SimilarFunctionEliminator.getFunctionType(this.getFunctionNode(functionName));
}

// Returns an array of asm types (void|int|double)
// The first n-1 asm types represent the asm type for each parameter
// The last asm type represents the asm type for the return statement
SimilarFunctionEliminator.getFunctionType = function(functionNode) {
  var functionType = [];
  var params = functionNode.params;
  var numParams = params.length;
  var functionBody = functionNode.body.body;
  for (var paramIndex = 0; paramIndex < numParams; ++paramIndex) {
    functionType.push(SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode(functionBody[paramIndex].expression.right));
  }

  functionType.push(SimilarFunctionEliminator.getAsmTypeFromReturnStatement(functionNode));
  return functionType;
}

var PlaceHolder = function(type, astData, asmType) {
  this.type = type;
  this.astData = astData;
  this.asmType = asmType;
}

// @static
// This function canonicalizes the passed in AST. Canonicalization involves
// replacing every literal and identifier in the passed in AST with a placeholder
// value. This becomes useful when identifying similar ASTs.
SimilarFunctionEliminator.canonicalizeNode = function(node, tokenToPlaceholder, placeholderData, typeData, locals) {
  var targetNode = (node.type === 'CallExpression') ? node.callee : node;
  var targetNodeCopy = SFE.Utils.deepCopyAst(targetNode);
  var desiredProperty = targetNode.type === 'Literal' ? 'raw' : 'name';
  var tokenName = targetNode[desiredProperty];
  var placeholderName = tokenToPlaceholder[tokenName];

  var nodeName = node.name;
  var nodeType = node.type;

  if (typeof(placeholderName) === 'undefined') {
    placeholderName = typeData[nodeType].canonicalizedPrefix +
                      typeData[nodeType].index.toString();
    typeData[nodeType].index += 1;

    // NOTE: We update the target node (and not the passed in node).
    // This is to account for function calls - for function calls, we
    // want to update the callee node.
    tokenToPlaceholder[tokenName] = placeholderName;

    var asmType = 'int';
    if (nodeType === 'Literal') {
      asmType = SimilarFunctionEliminator.getAsmTypeFromLiteral(node);
    } else if (nodeType === 'Identifier') {
      if (!(nodeName in locals)) {
        throw new Error('Could not find ' + nodeName + ' in locals!!!');
      }

      asmType = locals[nodeName];
    }

    placeholderData[placeholderName] = new PlaceHolder(nodeType, targetNodeCopy, asmType);
  }

  if (targetNode.type === 'Literal') {
    targetNode.value = placeholderName;

    if (typeof(targetNode.raw) !== 'undefined') {
      targetNode.raw = placeholderName;
      targetNode.verbatim = placeholderName;
    }
  } else {
      targetNode.name = placeholderName;
  }
}

// @static
SimilarFunctionEliminator.getAsmTypeFromLiteral = function(literalNode) {
  // We expect only literals
  if (literalNode.type !== 'Literal') {
    throw new Error("Found non literal node!");
  }

  var asmType = 'int';
  if (literalNode.raw.includes('.')) {
    asmType = 'double';
  }

  return asmType;
}

SimilarFunctionEliminator.prototype.getLocalsForFunctionName = function(functionName) {
  return SimilarFunctionEliminator.getLocalsForFunctionNode(this.getFunctionNode(functionName));
}

// @static
SimilarFunctionEliminator.getLocalsForFunctionNode = function(functionAst) {
  var locals = SimilarFunctionEliminator.getLocalsForNode(functionAst);

  // Parameters
  var params = functionAst.params;
  var paramsLength = functionAst.params.length;
  var functionBody = functionAst.body.body;
  for (var paramIndex = 0; paramIndex < paramsLength; ++paramIndex) {
    var param = params[paramIndex];
    locals[param.name] = SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode(functionBody[paramIndex].expression.right);
  }

  return locals;
}

// @static
SimilarFunctionEliminator.getLocalsForNode = function(astNode) {
  var locals = {};
  SimilarFunctionEliminator.getLocalsForNodeWithCallback(astNode, locals, function(node) {
    var asmType = 'void';
    if (node.type === 'FunctionDeclaration') {
      asmType = 'function';
    } else {
      asmType = SimilarFunctionEliminator.getAsmTypeFromLiteral(node.init);
    }

    locals[node.id.name] = asmType;
  });

  return locals;
}

// Similar to getLocalsForNode but here we don't care about the type.
SimilarFunctionEliminator.getLocalsSetForNode = function(astNode) {
  var locals = new Set();

  SimilarFunctionEliminator.getLocalsForNodeWithCallback(astNode, locals, function(node) {
    locals.add(node.id.name);
  });

  return locals;
}

// @static
SimilarFunctionEliminator.getLocalsForNodeWithCallback = function(astNode, locals, callback) {
  if (typeof(callback) !== 'function') {
    throw new Error('Expected valid callback function!');
  }

  if (typeof(locals) === 'undefined') {
    throw new Error('Expected valid locals object!');
  }

  estraverse.traverse(astNode, {
    enter: function(node) {
      if (node.type === 'VariableDeclarator' || node.type === 'FunctionDeclaration') {
        callback(node);
      }

      if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') {
        // Don't descend down into functions as the variables there are not
        // local to this scope
        this.skip();
      }
    }
  });
}

// This function creates a deep copy of the passed in AST
// and canonicalizes the copy.
//
// Canonicalization involves replacing each unique identifier
// and literal with a placeholder token
//
// Canonicalization makes it possible to quickly identify sets
// of similar functions.
SimilarFunctionEliminator.prototype.canonicalize = function(canonicalizedAst, placeholderData) {
  // We distinguish between function calls, variables and literals
  var typeData = {
    'CallExpression': { canonicalizedPrefix: '$FunctionIdentifier', index: 0 },
    'Identifier':     { canonicalizedPrefix: '$VariableIdentifier', index: 0 },
    'Literal':        { canonicalizedPrefix: '$LiteralIdentifier',  index: 0 }
  };

  var functionCallIdentifierIndex = 0, variableIdentifierIndex = 0, literalIndex = 0;
  var locals = SimilarFunctionEliminator.getLocalsForFunctionNode(canonicalizedAst);
  var sfe = this;

  // Dictionary that maps identifier/literal tokens to placeholder values
  var tokenToPlaceholder = {};
  estraverse.traverse(canonicalizedAst.body, {
    enter: function(node, parent) {
      if (node.type === 'Identifier' || node.type === 'Literal') {
        var canonicalizingCallExpression = (parent.type === 'CallExpression' && (parent.callee == node));

        var shouldCanonicalize = true;

        if (node.type === 'Literal') {
          // We can't canonicalize literals inside switch cases as this
          // breaks asm.js compliance.
          shouldCanonicalize = (parent.type !== 'SwitchCase');
        } else {
          // We only canonicalize identifiers that are locals or call expressions
          shouldCanonicalize = canonicalizingCallExpression || (node.name in locals);

          if (canonicalizingCallExpression) {
            // Ensure that the called function is present
            shouldCanonicalize = (node.name in sfe.functionNameToIndex);
          }
        }

        if (shouldCanonicalize) {
          if (canonicalizingCallExpression) {
            // Canonicalize the parent for the callee child
            // since we need to special case call expressions
            // e.g. we want to store off their function pointer index, etc.
            node = parent;
          }

          SimilarFunctionEliminator.canonicalizeNode(node, tokenToPlaceholder, placeholderData, typeData, locals);
        }
      }
    }
  });

  placeholderData.ast = canonicalizedAst;
}

SimilarFunctionEliminator.prototype.canonicalizeAndHash = function(functionName, placeholderData) {
  var canonicalizedAst = this.getFunctionNodeFromAst(functionName, this.shadowAsmAst);
  this.canonicalize(canonicalizedAst, placeholderData);

  // The code for the canonicalized ast
  var sourceString = escodegen.generate(canonicalizedAst.body, {compact: true});

  // Its possible in some rare cases that two canonicalized functions look the
  // same, but are not coalescable because of differences in types of literals or
  // identifiers. We hence also add the types of the canonicalized nodes here for hashing
  for (var placeholderName in placeholderData) {
    if (placeholderName !== 'ast') {
      var placeholderInfo = placeholderData[placeholderName];
      sourceString += placeholderInfo.type;
      sourceString += placeholderInfo.asmType;
    }
  }

  return crypto.createHash('sha256').update(sourceString).digest('hex');
}

SimilarFunctionEliminator.prototype.modifyFunctionTableAsts = function(functionTableAsts) {
  var functionTableAstBody = functionTableAsts.body;
  var functionTableAstBodyLength = functionTableAstBody.length;
  var tableCollection = this.functionTableCollection;
  var collectionLength = tableCollection.length;

  for (var tableIndex = 0; tableIndex < collectionLength; ++tableIndex) {
    var functionTable = tableCollection.at(tableIndex);
    var functionTableLength = functionTable.length;

    if (tableIndex < functionTableAstBodyLength) {
      var astElements = functionTableAstBody[tableIndex].declarations[0].init.elements;
      var astElementsLength = astElements.length;

      if (functionTable.needsCodegen) {
        // We have to modify the current AST. Let's add entries for the newly added functions.
        for (var indexToAdd = astElementsLength; indexToAdd < functionTableLength; ++indexToAdd) {
          astElements.push({
            type: 'Identifier',
            name: functionTable.at(indexToAdd)
          });
        }
      }
    } else {
      // We have to add the new ASTs
      var newAst = {
        type: 'VariableDeclaration',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: {
              type: 'Identifier',
              name: functionTable.name
            },
            init: {
              type: 'ArrayExpression',
              elements: []
            }
          }
        ],
        kind: 'var'
      };

      var newAstElements = newAst.declarations[0].init.elements;
      for (var functionIndex = 0; functionIndex < functionTableLength; ++functionIndex) {
        newAstElements.push({
          type: 'Identifier',
          name: functionTable.at(functionIndex)
        });
      }

      functionTableAstBody.push(newAst);
    }
  }
}

SimilarFunctionEliminator.prototype.markupLiterals = function(ast) {
  var sfe = this;
  estraverse.traverse(ast, {
    enter: function(node) {
      if (node.type === 'Literal') {
        node.verbatim = sfe.genVerbatimProperty(node.raw);
      }
    }
  });
}

SimilarFunctionEliminator.prototype.updateFunctionTables = function() {
  // Canonicalization during similar function computation may have modified function tables.
  // Let's now finalize all function tables. Finalization involves padding the end of the
  // function table with its last value until the length of the table is a power of 2
  var tableCollection = this.functionTableCollection;
  var collectionLength = tableCollection.length;
  for (var index = 0; index < collectionLength; ++index) {
    tableCollection.at(index).finalize();
  }

  // Identify all the modified function tables
  this.identifyModifiedFunctionTables();

  // Update the masks for the table indexers for all modified tables
  this.updateTableMasks(this.asmAst);
}

SimilarFunctionEliminator.prototype.run = function() {
  // Initialization code
  this.initialize();

  // Compute the similar functions based on number of lines and canonicalized ASTs
  this.computeSimilarFunctions();
  var output = "";

  // Update and finalize function tables and table masks
  this.updateFunctionTables();

  if (settings.analyze) {
    output += '[';
    var similarFunctionsLength = similarFunctions.length;
    for (var index = 0; index < similarFunctionsLength; ++index) {
      var curLine = '  ' + JSON.stringify(similarFunctions[index].functions);
      if (parseInt(index) !== similarFunctionsLength-1) {
        curLine += ',';
      }
      output += curLine;
      output += '\n';
    }
    output += ']';
  } else {
    // Modify the ASTs of each function to call a newly generated helper function
    // that will be appended to the top level functions
    this.computeAsmAstFunctionIndexRange();
    this.modifyAsts();

    // We want to only generate code for the functions in the asm ast - the rest of the input file will be exactly as is
    // Let's morph the asm ast so that it only has functions - for this we have to make it look like a top level AST
    this.asmAst.type = 'Program';

    var functionAsts = {type: 'Program', body: this.asmAst.body.slice(this.asmAstFunctionIndexRange.startIndex, this.asmAstFunctionIndexRange.endIndex+1)};
    var functionBodyOutput = escodegen.generate(functionAsts, {format:{compact: settings.compact, quotes: 'double', semicolons: false, newline: '\n'}, verbatim: 'verbatim'});
    var functionTablesPresent = this.asmAstFunctionIndexRange.endIndex+1 < this.asmAst.body.length;
    var functionTableOutput = '';

    if (functionTablesPresent) {
      // The rest are the function asts (we don't care about the return value)
      functionTableAsts = {type: 'Program', body: this.asmAst.body.slice(this.asmAstFunctionIndexRange.endIndex+1, this.asmAst.body.length-1)};

      // Modify/add new function tables to the function table ASTs
      this.modifyFunctionTableAsts(functionTableAsts);

      functionTableOutput = escodegen.generate(functionTableAsts, {format:{compact: settings.compact, quotes: 'double', semicolons: true, newline: '\n'}});
    }

    // Let's return the modified function contents
    var startToken = "// EMSCRIPTEN_START_FUNCS";
    var endToken = "// EMSCRIPTEN_END_FUNCS";
    var functionsStartIndex = this.src.indexOf(startToken) + startToken.length;
    var functionsEndIndex = this.src.indexOf(endToken);

    var functionTablesStartIndex = functionsEndIndex + endToken.length;
    var functionTablesEndIndex = this.src.indexOf('return', functionTablesStartIndex); // Look for the return statement

    output = this.src.substring(0, functionsStartIndex) + '\n' +
             functionBodyOutput + '\n' +
             endToken + '\n' +
             functionTableOutput;

    if (!settings.compact) {
      output += '\n\n';
    }

    output += this.src.substring(functionTablesEndIndex);
  }

  return output;
}

// Run settings
var settings = {
  compact: true,
  analyze: false
};

function create(jsFile) {
  return new SimilarFunctionEliminator(jsFile);
}

function run(jsFile, compact, analyze) {
  settings.compact = compact;
  settings.analyze = analyze;

  var sfe = create(jsFile);
  SFE.Utils.print(sfe.run());
}

// TEST RELATED functions
function getSettings() {
  return settings;
}

// Module exports for unit testing
module.exports = {
  run: run,
  SimilarFunctionEliminator: SimilarFunctionEliminator,
  getSettings: getSettings
};
