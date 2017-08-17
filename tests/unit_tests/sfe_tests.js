///////////////////////////////////////////////////////////////////////////////////////////////
// sfe_tests.js
//
// File that tests similar function elimination. NOTE: We expect to paths to be relative to the
// main similar function elimination directory.
///////////////////////////////////////////////////////////////////////////////////////////////
var chai = require('chai');
var expect = chai.expect;
var SFE = require('../../src/similar_function_eliminator.js');
var SimilarFunctionEliminator = SFE.SimilarFunctionEliminator;
var utils = require('../../src/utils.js');
var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');

// Utility function for trimming strings
if(!String.prototype.trim) {
  String.prototype.trim = function () {
    return this.replace(/^\s+|\s+$/g,'');
  };
}

function expectSetsEqual(set1, set2) {
  set1.forEach(function(value1) { expect(set2.has(value1)).to.equal(true); });
  set2.forEach(function(value2) { expect(set1.has(value2)).to.equal(true); });
}

function verifyAnnotation(annotatedNode, asmType) {
  if (asmType === 'int') {
    expect(annotatedNode.type).to.equal('BinaryExpression');
    expect(annotatedNode.operator).to.equal('|');
    expect(annotatedNode.right.type).to.equal('Literal');
    expect(annotatedNode.right.raw).to.equal('0');
  } else if (asmType === 'double') {
    expect(annotatedNode.type).to.equal('UnaryExpression');
    expect(annotatedNode.operator).to.equal('+');
    expect(annotatedNode.prefix).to.equal(true);
  }
}

describe('getIdentifiers', function() {
  it('should correctly identify all the identifiers in the passed in asm.js AST', 
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/IdentifierTest.js');
      sfe.initialize();

      var identifiers = sfe.getIdentifiers(sfe.ast);
      var expectedSet = new Set(['a', 'b', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'm', 'n', 'o',
                                'abc', 'asm', 'global', 'globals', 'env', 'myEnv', 'buffer', 'myBuffer',
                                'j', 'k', 'm', 'n', 'o']);

      expectSetsEqual(identifiers, expectedSet);
    });
});

describe('populateTypedArrays', function() {
  it('should correctly identify all the typed arrays in the passed in asm.js file',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();
      var asmAst = sfe.asmAst;
      var typedArrays = sfe.typedArrays;

      var expectedVals = {
        c: {shift: 0, type: 'Int8Array'},
        d: {shift: 1, type: 'Int16Array'},
        e: {shift: 2, type: 'Int32Array'},
        f: {shift: 0, type: 'Uint8Array'},
        g: {shift: 1, type: 'Uint16Array'},
        h: {shift: 2, type: 'Uint32Array'},
        i: {shift: 2, type: 'Float32Array'},
        j: {shift: 3, type: 'Float64Array'}
      };

      for (var variableName in expectedVals) {
        var expectedVal = expectedVals[variableName];
        expect(typedArrays[variableName].shift).to.equal(expectedVal.shift);
        expect(typedArrays[variableName].type).to.equal(expectedVal.type);
      }
    });
})

describe('getIntegerMultiplicationFunction', function() {
  it('should correctly populate the integer multiplication function used for replacing the * operator with calls to Math.imul',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.initialize();

        var expectedIntegerMultiplicationFunction = 'S';
        expect(sfe.integerMultiplicationFunction).to.equal(expectedIntegerMultiplicationFunction);
      });
});

describe('getFunctionNode', function() {
  it('should correctly return the function node for a function name from an ASM AST',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.initialize();

        expect(sfe.getFunctionNode('a').id.name).to.equal('a');
      });
});

describe('getTableForFunctions', function() {
  it('should correctly return the table for that passed in list of functions',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.initialize();
        var functionTable = sfe.getTableForFunctions(['a', 'b']);
        expect(functionTable.name).to.equal('table');
      });
});

describe('getTableForFunctions', function() {
  it('should throw when it finds that all the functions do not belong in the same table',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.initialize();

        expect(sfe.getTableForFunctions.bind(sfe, ['a','b','k'])).to.throw(/*we don't care about what it throws*/);
      });
});

describe('evaluateAsmTypeForNode', function() {
  it('can identify int types',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.initialize();
        var functionA = sfe.getFunctionNode('a');
        var locals = SimilarFunctionEliminator.getLocalsForFunctionNode(functionA);
        expect(sfe.evaluateAsmTypeForNode({type: 'Identifier', name: 'f'}, locals)).to.equal('int');
      });
});

describe('evaluateAsmTypeForNode', function() {
  it('can identify double types',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.initialize();
        var functionA = sfe.getFunctionNode('a');
        var locals = SimilarFunctionEliminator.getLocalsForFunctionNode(functionA);
        expect(sfe.evaluateAsmTypeForNode({type: 'Identifier', name: 'd'}, locals)).to.equal('double');
      });
});

describe('evaluateAsmTypeForNode', function() {
  it('can identify signed types',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.initialize();
        var functionA = sfe.getFunctionNode('a');
        var locals = SimilarFunctionEliminator.getLocalsForFunctionNode(functionA);
        expect(sfe.evaluateAsmTypeForNode({
                type: 'BinaryExpression',
                operator: '|',
                left: {
                  type: 'Identifier',
                  name: 'f'
                },
                right: {
                  type: 'Literal',
                  value: 0,
                  raw: '0'
                }
              }, locals)).to.equal('signed');
      });
});

describe('evaluateAsmTypeForNode', function() {
  it('can identify unsigned types',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.initialize();
        var functionA = sfe.getFunctionNode('a');
        var locals = SimilarFunctionEliminator.getLocalsForFunctionNode(functionA);
        expect(sfe.evaluateAsmTypeForNode({
                type: 'BinaryExpression',
                operator: '>>>',
                left: {
                  type: 'Identifier',
                  name: 'f'
                },
                right: {
                  type: 'Literal',
                  value: 0,
                  raw: '0'
                }
              }, locals)).to.equal('unsigned');
      });
});

describe('uncanonicalize', function() {
  it('correctly uncanonicalizes the function based on placeholder data',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.initialize();
        var functionAst = {
          type: 'FunctionDeclaration',
          id: {
            type: 'Identifier',
            name: 'a'
          },
          params: [],
          body: {
            type: 'BlockStatement',
            body: [
              {
                type: 'CallExpression',
                callee: {
                  type: 'Identifier',
                  name: '$FunctionIdentifier0'
                },
                arguments: [
                  {
                    type: 'Literal',
                    value: '$LiteralIdentifier1',
                    raw: '$LiteralIdentifier1'
                  },
                  {
                    type: 'Literal',
                    value: '$LiteralIdentifier1',
                    raw: '$LiteralIdentifier1'
                  },
                  {
                    type: 'Literal',
                    value: '$LiteralIdentifier0',
                    raw: '$LiteralIdentifier0'
                  }
                ]
              },
              {
                type: 'ReturnStatement',
                argument: {
                  type: 'Literal',
                  value: '$LiteralIdentifier0',
                  raw: '$LiteralIdentifier0'
                }
              }
            ]
          },
          defaults: []
        };

        var parameters = sfe.uncanonicalize(
            functionAst,
            {
              '$LiteralIdentifier0':
              {
                type: 'Literal',
                asmType: 'int',
                replacementValues: [ {
                  type: 'Literal',
                  value: 1,
                  raw: '1',
                  verbatim: {
                    content: '1',
                    precedence: 19
                  }
                }],
                parametrize: true
              },
              '$LiteralIdentifier1':
              {
                type: 'Literal',
                asmType: 'double',
                replacementValues: [ {
                  type: 'Literal',
                  value: 1,
                  raw: '1.0',
                  verbatim: {
                    content: '1.0',
                    precedence: 19
                  }
                }],
                parametrize: true
              },
              '$FunctionIdentifier0':
              {
                type: 'CallExpression',
                asmType: 'int', // unused currently
                replacementValues: [ {
                  type: 'Identifier',
                  name: 'b',
                }],
                parametrize: true,
                functionTable: sfe.functionTableCollection.lookupTable('table')
              }
            }
          );

        var expectedParameters = {
          $FunctionIdentifier0: '$',
          $LiteralIdentifier1: 'A',
          $LiteralIdentifier0: 'B'
        };

        // Check parameters
        for (var param in expectedParameters) {
          expect(parameters[param]).to.equal(expectedParameters[param]);
        }

        for (var param in parameters) {
          expect(expectedParameters[param]).to.equal(parameters[param]);
        }

        // We generated a new name as well
        expect(functionAst.id.name).to.not.equal('a');

        // We generated 3 parameter annotations for the new parameters
        expect(functionAst.params.length).to.equal(3);
        expect(SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode(functionAst.body.body[0].expression.right)).to.equal('int');
        expect(SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode(functionAst.body.body[1].expression.right)).to.equal('double');
        expect(SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode(functionAst.body.body[2].expression.right)).to.equal('int');

        // The 4th line contains the call expression. Verify that we are now
        // invoking the table with an indexer
        var callExpression = functionAst.body.body[3];

        expect(callExpression.callee.type).to.equal('MemberExpression');
        expect(callExpression.callee.computed).to.equal(true);
        expect(callExpression.callee.object.name).to.equal('table');

        // Look for the bitmask
        expect(callExpression.callee.property.type).to.equal('BinaryExpression');
        expect(callExpression.callee.property.operator).to.equal('&');
        expect(callExpression.callee.property.right.value).to.equal(1);
      });
});

describe('computeFunctionTableCollection', function() {
  it('correctly computes the function tables within the passed in asm.js file',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();

      var tableCollection = sfe.computeFunctionTableCollection();
      expect(tableCollection.length).to.equal(2);

      var table1 = tableCollection.at(0);
      expect(table1.name).to.equal('table');
      expect(table1.length).to.equal(2);
      expect(table1.at(0)).to.equal('a');
      expect(table1.at(1)).to.equal('b');

      var table2 = tableCollection.at(1);
      expect(table2.name).to.equal('table2');
      expect(table2.length).to.equal(1);
      expect(table2.at(0)).to.equal('k');
    });
});

describe('annotateInPlace', function() {
  it('correctly annotates the passed in AST node in place',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();

      var identifierNode = {
        type: 'Identifier',
        name: 'a'
      }

      var integerAnnotatedNode = utils.deepCopyAst(identifierNode);
      sfe.annotateInPlace(integerAnnotatedNode, 'int');
      verifyAnnotation(integerAnnotatedNode, 'int');

      var doubleAnnotatedNode = utils.deepCopyAst(identifierNode);
      sfe.annotateInPlace(doubleAnnotatedNode, 'double');
      verifyAnnotation(doubleAnnotatedNode, 'double');
    });
});

describe('annotate', function() {
  it('correctly annotates the passed in AST node and returns an annotated node',
     function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();

      var identifierNode = {
        type: 'Identifier',
        name: 'a'
      }

      var integerAnnotatedNode = sfe.annotate(identifierNode, 'int');
      verifyAnnotation(integerAnnotatedNode, 'int');

      var doubleAnnotatedNode = sfe.annotate(identifierNode, 'double');
      verifyAnnotation(doubleAnnotatedNode, 'double');
     });
});

describe('computeAsmAstFunctionIndexRange', function() {
  it('correctly retrieves the start and end index of the function bodies in the ASM AST',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();
      sfe.computeAsmAstFunctionIndexRange();

      expect(sfe.asmAstFunctionIndexRange.startIndex).to.equal(9);
      expect(sfe.asmAstFunctionIndexRange.endIndex).to.equal(12);
    });
});

describe('computeNumLines', function() {
  it('should correctly compute the number of nodes in the function AST passed in',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/NumLinesTest.js');

      var startToken = "// EMSCRIPTEN_START_FUNCS";
      var endToken = "// EMSCRIPTEN_END_FUNCS";

      var startIndex = sfe.src.indexOf(startToken) + startToken.length;
      var functionsEndIndex = sfe.src.indexOf(endToken);
      var functionIdentifierToken = 'function ';

      startIndex = sfe.src.indexOf(functionIdentifierToken, startIndex) + functionIdentifierToken.length;

      var expectedLines = {XYc: 39, D5a: 8};
      while ((startIndex !== -1) && (startIndex < functionsEndIndex))
      {
        var functionName = sfe.src.substring(startIndex, sfe.src.indexOf('(', startIndex));
        var numLines = sfe.computeNumLines(startIndex);

        expect(numLines).to.equal(expectedLines[functionName]);

        startIndex = sfe.src.indexOf(functionIdentifierToken, startIndex);

        if (startIndex !== -1) {
           startIndex += functionIdentifierToken.length;
        }
      }
    });
});

describe('computeSimilarFunctions', function() {
  it('should correctly compute the set of similar functions in an asm.js file',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.initialize();
        sfe.computeSimilarFunctions();
        expect(sfe.similarFunctions.length).to.equal(1);
        expect(utils.compareValueArrays(sfe.similarFunctions[0].functions, ['a', 'b'])).to.equal(true);
      });
});

describe('identifyModifiedFunctionTables', function() {
  it('should correctly compute the set of function tables that were changed (or were newly added)',
      function() {
        var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
        sfe.run();
        expect(utils.compareValueArrays(Array.from(sfe.modifiedTables), ['table2'])).to.equal(true);
      });
});

describe('getAsmTypeFromAnnotatedNode', function() {
  it('should correctly be able to identify int types from annotated nodes',
    function() {
      expect(SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode({
        type: 'BinaryExpression',
        operator: '|',
        left: {
          type: 'Identifier',
          name: 'a'
        },
        right: {
          type: 'Literal',
          value: 0,
          raw: '0'
        }
      })).to.equal('int');
    });
});

describe('getAsmTypeFromAnnotatedNode', function() {
  it('should correctly be able to identify double types from annotated nodes',
    function() {
      expect(SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode({
        type: 'UnaryExpression',
        operator: '+',
        argument: {
          type: 'Identifier',
          name: 'a'
        }
      })).to.equal('double');
    });
});

describe('getAsmTypeFromAnnotatedNode', function() {
  it('should correctly be able to identify double types from literal nodes',
    function() {
      expect(SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode({
        type: 'Literal',
        value: 0,
        raw: '0.0'
      })).to.equal('double');
    });
});

describe('getAsmTypeFromAnnotatedNode', function() {
  it('should correctly be able to identify int types from literal nodes',
    function() {
      expect(SimilarFunctionEliminator.getAsmTypeFromAnnotatedNode({
        type: 'Literal',
        value: 0,
        raw: '0'
      })).to.equal('int');
    });
});

describe('getAsmTypeFromReturnStatement', function() {
  it('should correctly be able to identify int types from annotated nodes',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();

      expect(SimilarFunctionEliminator.getAsmTypeFromReturnStatement({
        type: 'FunctionDeclaration',
        body: {
          type: 'BlockStatement',
          body: [
            {
              type: 'ReturnStatement',
              argument: {
                type: 'BinaryExpression',
                operator: '|',
                left: {
                  type: 'Identifier',
                  name: 'a'
                },
                right: {
                  type: 'Literal',
                  value: 0,
                  raw: '0'
                }
              }
            }
          ]
        }
      }, new Set())).to.equal('int');
    });
});

describe('getAsmTypeFromReturnStatement', function() {
  it('should correctly be able to identify double types from annotated nodes',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();

      expect(SimilarFunctionEliminator.getAsmTypeFromReturnStatement({
        type: 'FunctionDeclaration',
        body: {
          type: 'BlockStatement',
          body: [
            {
              type: 'ReturnStatement',
              argument: {
                type: 'UnaryExpression',
                operator: '+',
                argument: {
                  type: 'Identifier',
                  name: 'a',
                }
              }
            }
          ]
        }
      }, new Set())).to.equal('double');
    });
});

describe('getAsmTypeFromReturnStatement', function() {
  it('should correctly be able to identify int types from literal nodes',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();

      expect(SimilarFunctionEliminator.getAsmTypeFromReturnStatement({
        type: 'FunctionDeclaration',
        body: {
          type: 'BlockStatement',
          body: [
            {
              type: 'ReturnStatement',
              argument: {
                type: 'Literal',
                value: 0,
                raw: '0'
              }
            }
          ]
        }
      }, new Set())).to.equal('int');
    });
});

describe('getAsmTypeFromReturnStatement', function() {
  it('should correctly be able to identify double types from literal nodes',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();

      expect(SimilarFunctionEliminator.getAsmTypeFromReturnStatement({
        type: 'FunctionDeclaration',
        body: {
          type: 'BlockStatement',
          body: [
            {
              type: 'ReturnStatement',
              argument: {
                type: 'Literal',
                value: 0,
                raw: '0.0'
              }
            }
          ]
        }
      }, new Set())).to.equal('double');
    });
});

describe('getFunctionType', function() {
  it('should correctly be able to identify the function type of a function node',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();
      var functionNodeA = sfe.getFunctionNode('a');
      var functionNodeL = sfe.getFunctionNode('l');

      expect(utils.compareValueArrays(
              SimilarFunctionEliminator.getFunctionType(functionNodeA),
              ['double', 'double', 'int', 'int']
            )).to.equal(true);

      expect(utils.compareValueArrays(SimilarFunctionEliminator.getFunctionType(functionNodeL),['int'])).to.equal(true);
    });
});

describe('getFunctionTypeFromName', function() {
  it('should correctly be able to identify the function type of a function from its name',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();

      expect(utils.compareValueArrays(
              sfe.getFunctionTypeFromName('a'),
              ['double', 'double', 'int', 'int']
            )).to.equal(true);

      expect(utils.compareValueArrays(sfe.getFunctionTypeFromName('l'),['int'])).to.equal(true);
    });
});

describe('getLocalsForFunctionNode', function() {
  it('should correctly be able to identify the local variables within a function',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();
      var functionA = sfe.getFunctionNode('a');
      var expectedLocals = {
        "a": "function",
        "d": "double",
        "e": "double",
        "f": "int"
      };

      var locals = SimilarFunctionEliminator.getLocalsForFunctionNode(functionA);

      for (var local in expectedLocals) {
        expect(expectedLocals[local]).to.equal(locals[local]);
      }

      for (var local in locals) {
        expect(locals[local]).to.equal(expectedLocals[local]);
      }
    });
});

describe('getLocalsForFunctionName', function() {
  it('should correctly be able to identify the local variables within a function',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
      sfe.initialize();
      var expectedLocals = {
        "a": "function",
        "d": "double",
        "e": "double",
        "f": "int"
      };

      var locals = sfe.getLocalsForFunctionName('a');

      for (var local in expectedLocals) {
        expect(expectedLocals[local]).to.equal(locals[local]);
      }

      for (var local in locals) {
        expect(locals[local]).to.equal(expectedLocals[local]);
      }
    });
});

describe('canonicalizeAndHash', function() {
  it('should correctly disambiguate between two similar functions with differing literal types',
    function() {
      var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/CanonicalizationTest.js');
      sfe.initialize();
      var function1 = 'Unb', function2 = 'WCb';
      var placeholder1 = {}, placeholder2 = {};
      var hash1 = sfe.canonicalizeAndHash(function1, placeholder1);
      var hash2 = sfe.canonicalizeAndHash(function2, placeholder2);
      expect(hash1).to.not.equal(hash2);

      // Now make sure that the canonicalized ast's look the same
      var ast1 = sfe.getFunctionNodeFromAst(function1, sfe.shadowAsmAst);
      var ast2 = sfe.getFunctionNodeFromAst(function2, sfe.shadowAsmAst);

      var body1 = escodegen.generate(ast1.body, {compact: true});
      var body2 = escodegen.generate(ast2.body, {compact: true});
      expect(body1).to.equal(body2);
    });
});
