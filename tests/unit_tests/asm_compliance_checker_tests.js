///////////////////////////////////////////////////////////////////////////////////////////////
// asm_js_compliance_tests.js
//
// File that tests the asm.js compliance checker module
///////////////////////////////////////////////////////////////////////////////////////////////
var chai = require('chai');
var expect = chai.expect;
var SFE = require('../../src/similar_function_eliminator.js');
var SimilarFunctionEliminator = SFE.SimilarFunctionEliminator;
var checker = require('../../src/asm_compliance_checker.js');
var AsmComplianceChecker = checker.AsmComplianceChecker;
var utils = require('../../src/utils.js');

describe('asmComplianceChecker', function() {
  it('should ensure that identifiers created from literals used as function table ' +
     'indexers provide the correct shift depending on the type of table',
     function() {
       var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
       sfe.initialize();
       var typedArrays = sfe.typedArrays;

       for (var typedArrayName in typedArrays) {
         var asmComplianceChecker = new AsmComplianceChecker(sfe);
         var memberExpression = {
            type: 'MemberExpression',
            computed: true,
            object: {
              type: 'Identifier',
              name: typedArrayName
            },
            property: {
              type: 'Identifier',
              name: 'm'
            }
         };
         var node = memberExpression.property;
         asmComplianceChecker.addToQueue(node, 'Literal', memberExpression);
         asmComplianceChecker.run({});

         // Ensure that the node is now a binary expression that provides the right shift
         expect(memberExpression.property.type).to.equal('BinaryExpression');

         var shift = typedArrays[typedArrayName].shift;
         expect(memberExpression.property.operator).to.equal('>>');

         if (shift === 0) {
           expect(memberExpression.property.left.name).to.equal('m');
           expect(memberExpression.property.right.type).to.equal('Literal');
           expect(memberExpression.property.right.value).to.equal(0);
           expect(memberExpression.property.right.raw).to.equal('0');
         }
         else {
           // We now have a nested binary expression
           expect(memberExpression.property.type).to.equal('BinaryExpression');
           expect(memberExpression.property.operator).to.equal('>>');

           expect(memberExpression.property.left.type).to.equal('BinaryExpression');
           expect(memberExpression.property.left.operator).to.equal('<<');
           expect(memberExpression.property.left.right.type).to.equal('Literal');
           expect(memberExpression.property.left.right.value).to.equal(shift);
           expect(memberExpression.property.left.right.raw).to.equal(shift.toString());

           expect(memberExpression.property.right.type).to.equal('Literal');
           expect(memberExpression.property.right.value).to.equal(shift);
           expect(memberExpression.property.right.raw).to.equal(shift.toString());
         }
       }
     });
});

describe('asmComplianceChecker', function() {
  it('should ensure that for integer multiplications where we replaced a literal with an identifier, ' +
     'we replace the parent expression with a call to the integer multiplication function and annotate ' +
     'the node',
     function() {
       var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
       sfe.initialize();
       var asmComplianceChecker = new AsmComplianceChecker(sfe);
       var multiplicationExpression = {
         type: 'BinaryExpression',
         operator: '*',
         left: {
           type: 'Identifier',
           name: 'm'
         },
         right: {
          type: 'Identifier',
          value: 'n'
         }
       };

       var locals = {
         m: 'int',
         n: 'int'
       }

       asmComplianceChecker.addToQueue(multiplicationExpression.left, 'Literal', multiplicationExpression);
       asmComplianceChecker.run(locals);

       // Ensure that the multiplication expression is now a call expression annotated with an integer coercion
       var expectedExpression = {
        "type": "BinaryExpression",
        "operator": "|",
        "left": {
          "type": "CallExpression",
          "callee": {
            "type": "Identifier",
            "name": "S"
          },
          "arguments": [
            {
              "type": "BinaryExpression",
              "operator": "|",
              "left": {
                "type": "Identifier",
                "name": "m"
              },
              "right": {
                "type": "Literal",
                "value": 0,
                "raw": "0"
              }
            },
            {
              "type": "Identifier",
              "value": "n"
            }
          ]
        },
        "right": {
          "type": "Literal",
          "value": 0,
          "raw": "0"
        }
      };

      expect(multiplicationExpression).to.deep.equal(expectedExpression);
     });
});

describe('asmComplianceChecker', function() {
  it('should ensure that for binary expressions involving the division operator, make sure that if we ' +
     'replaced a literal with an identifier, we annotate the identifier with the asm type of the other' +
     'operand',
     function() {
       var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
       sfe.initialize();
       var asmComplianceChecker = new AsmComplianceChecker(sfe);
       var divisionExpression = {
         type: 'BinaryExpression',
         operator: '/',
         left: {
           type: 'Identifier',
           name: 'm'
         },
         right: {
          type: 'BinaryExpression',
          operator: '|',
          left: {
            type: 'Identifier',
            name: 'n'
          },
          right: {
            type: 'Literal',
            value: 0,
            raw: '0'
          }
         }
       };

       var locals = {
         m: 'int',
         n: 'signed'
       }

       asmComplianceChecker.addToQueue(divisionExpression.left, 'Literal', divisionExpression);
       asmComplianceChecker.run(locals);

       // Ensure that the division expression's left operand now contains an annotation coercing it to signed
       var expectedExpression =  {
        "type": "BinaryExpression",
        "operator": "|",
        "left": {
          "type": "Identifier",
          "name": "m"
        },
        "right": {
          "type": "Literal",
          "value": 0,
          "raw": "0"
        }
      };

      expect(expectedExpression).to.deep.equal(divisionExpression.left);
     });
});

describe('asmComplianceChecker', function() {
  it('should ensure that for binary expressions involving the modulus operator, make sure that if we ' +
     'replaced a literal with an identifier, we annotate the identifier with the asm type of the other' +
     'operand',
     function() {
       var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
       sfe.initialize();
       var asmComplianceChecker = new AsmComplianceChecker(sfe);
       var modulusExpression = {
         type: 'BinaryExpression',
         operator: '%',
         left: {
           type: 'Identifier',
           name: 'm'
         },
         right: {
          type: 'BinaryExpression',
          operator: '|',
          left: {
            type: 'Identifier',
            name: 'n'
          },
          right: {
            type: 'Literal',
            value: 0,
            raw: '0'
          }
         }
       };

       var locals = {
         m: 'int',
         n: 'signed'
       }

       asmComplianceChecker.addToQueue(modulusExpression.left, 'Literal', modulusExpression);
       asmComplianceChecker.run(locals);

       // Ensure that the modulus expression's left operand now contains an annotation coercing it to signed
       var expectedExpression =  {
        "type": "BinaryExpression",
        "operator": "|",
        "left": {
          "type": "Identifier",
          "name": "m"
        },
        "right": {
          "type": "Literal",
          "value": 0,
          "raw": "0"
        }
      };

      expect(modulusExpression.left).to.deep.equal(expectedExpression);
     });
});

describe('asmComplianceChecker', function() {
  it('should ensure that for literals inside call expressions that we have replaced with identifiers, ' +
     'we annotate the identifier with the type of the literal',
     function() {
       var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
       sfe.initialize();
       var asmComplianceChecker = new AsmComplianceChecker(sfe);

       var callExpression = {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: 'b'
        },
        arguments: [
          {
            type: 'Identifier',
            name: 'm'
          }
        ]
       };

       var locals = {
         m: 'double'
       };

       asmComplianceChecker.addToQueue(callExpression.arguments[0], 'Literal', callExpression);
       asmComplianceChecker.run(locals);

       // Ensure that the call expressions first argument now contains an annotation coercing it to double
       var expectedExpression = {
        "type": "UnaryExpression",
        "prefix": true,
        "operator": "+",
        "argument": {
          "type": "Identifier",
          "name": "m"
        }
      };

      expect(callExpression.arguments[0]).to.deep.equal(expectedExpression);
     });
});

describe('asmComplianceChecker', function() {
  it('should ensure that for return statements where we’ve replaced literals with identifiers, ' +
     'we annotate the return statement with the asm type of the literal',
     function() {
       var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
       sfe.initialize();
       var asmComplianceChecker = new AsmComplianceChecker(sfe);

       var returnStatement = {
        type: 'ReturnStatement',
        argument: {
          type: 'Identifier',
          name: 'm'
        }
      };

       var locals = {
         m: 'int'
       };

       asmComplianceChecker.addToQueue(returnStatement.argument, 'Literal', returnStatement);
       asmComplianceChecker.run(locals);

       // Ensure that the call expressions first argument now contains an annotation coercing it to double
       var expectedExpression = {
        "type": "BinaryExpression",
        "operator": "|",
        "left": {
          "type": "Identifier",
          "name": "m"
        },
        "right": {
          "type": "Literal",
          "value": 0,
          "raw": "0"
        }
      };

      expect(returnStatement.argument).to.deep.equal(expectedExpression);
     });
});

describe('asmComplianceChecker', function() {
  it('For binary expressions with comparator operators, ensure that if we replaced a literal with an identifier, ' +
     'then we annotate the identifier with the type of the other operand.',
     function() {
       var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
       sfe.initialize();

       for (var index = 0; index < sfe.comparisonOperators; ++index) {
         var asmComplianceChecker = new AsmComplianceChecker(sfe);

         var binaryExpression = {
          type: 'BinaryExpression',
          operator: sfe.comparisonOperators[index],
          left: {
            type: 'Identifier',
            name: 'm'
          },
          right: {
            type: 'BinaryExpression',
            operator: '|',
            left: {
              type: 'Identifier',
              name: 'n'
            },
            right: {
              type: 'Literal',
              value: 0,
              raw: '0'
            }
          }
         };

         var locals = {};

         asmComplianceChecker.addToQueue(binaryExpression.left, 'Literal', binaryExpression);
         asmComplianceChecker.run(locals);

         // Ensure that the binary expression's left operand is annotated with an integer coercion
         var expectedExpression = {
          "type": "BinaryExpression",
          "operator": "|",
          "left": {
            "type": "Identifier",
            "name": "m"
          },
          "right": {
            "type": "Literal",
            "value": 0,
            "raw": "0"
          }
        };

        expect(binaryExpression.left).to.deep.equal(expectedExpression);
       }
     });
});

describe('asmComplianceChecker', function() {
  it('For unary expressions with the – operator, make sure that we annotate the ' +
     'unary expression if we replaced a literal with an identifier',
     function() {
       var sfe = new SimilarFunctionEliminator('tests/unit_tests/input_files/Simple.js');
       sfe.initialize();
       var asmComplianceChecker = new AsmComplianceChecker(sfe);

       var unaryExpression = {
        type: 'UnaryExpression',
        operator: '-',
        prefix: true,
        argument: {
          type: 'Identifier',
          name: 'm'
        }
       };

       var locals = {};

       asmComplianceChecker.addToQueue(unaryExpression.argument, 'Literal', unaryExpression);
       asmComplianceChecker.run(locals);

       // Ensure that the unary expression now has the right integer coercion
       var expectedExpression = {
        "type": "BinaryExpression",
        "operator": "|",
        "left": {
          "type": "UnaryExpression",
          "operator": "-",
          "prefix": true,
          "argument": {
            "type": "Identifier",
            "name": "m"
          }
        },
        "right": {
          "type": "Literal",
          "value": 0,
          "raw": "0"
        }
      };

      expect(unaryExpression).to.deep.equal(expectedExpression);
     });
});
