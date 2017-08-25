var utils = require('./utils.js');

var QueueData = function(node, type, parent) {
  this.node = node;
  this.type = type;
  this.parent = parent;
}

var AsmComplianceChecker = function(similarFunctionEliminator) {
  this.sfe = similarFunctionEliminator;
  this.queue = [];
}

AsmComplianceChecker.prototype.addToQueue = function(node, type, parent) {
  this.queue.push(new QueueData(node, type, parent));
}

// Function to be called on nodes that are going to be parametrized.
AsmComplianceChecker.prototype.run = function (locals) {
  var queue = this.queue;
  var numItems = queue.length;
  var sfe = this.sfe;
  var typedArrays = sfe.typedArrays;
  var genVerbatimProperty = sfe.genVerbatimProperty;

  for (var queueIndex = 0; queueIndex < numItems; ++queueIndex) {
    var item = queue[queueIndex];
    var node = item.node;
    var parent = item.parent;
    var type = item.type;
    var asmType = locals[node.name];

    if (type === 'Literal') {
      // If we're parametrizing a literal, it
      // will be morphed into an identifier

      // If we're indexing into a typed array using a literal,
      // we need to ensure that we shift the identifier by 0
      // to make asm.js happy that we might not have an undefined value.
      if (parent.type === 'MemberExpression' &&
          node == parent.property &&
          parent.computed === true &&
          (parent.object.name in typedArrays)) {
        var shift = typedArrays[parent.object.name].shift;

        // Morph the parent's property field according to the desired shift
        if (shift == 0) {
          parent.property = {
            "type": "BinaryExpression",
            "operator": ">>",
            "left": {
              "type": "Identifier",
              "name": node.name
            },
            "right": {
              "type": "Literal",
              "value": shift,
              "raw": shift.toString(),
              "verbatim": genVerbatimProperty(shift.toString())
            }
          };
        } else {
          var shiftToString = shift.toString();

          // For non zero shifts, we have a nested binary expression
          parent.property = {
            "type": "BinaryExpression",
            "operator": ">>",
            "left": {
              "type": "BinaryExpression",
              "operator": "<<",
              "left": {
                "type": "Identifier",
                "name": node.name
              },
              "right": {
                "type": "Literal",
                "value": shift,
                "raw": shiftToString,
                "verbatim": genVerbatimProperty(shiftToString)
              }
            },
            "right": {
              "type": "Literal",
              "value": shift,
              "raw": shiftToString,
              "verbatim": genVerbatimProperty(shiftToString)
            }
          };
        }
      }
      // Use math.imul when substituting a literal with an identifier
      // when the literal is used as part of a multiplication expression
      else if (asmType === 'int' &&
               parent.type === 'BinaryExpression' &&
               parent.operator === '*') {
        var leftNode = utils.deepCopyAst(parent.left);
        var rightNode = utils.deepCopyAst(parent.right);

        if (leftNode.type === 'Identifier' && (leftNode.name in locals)) {
          leftNode = this.sfe.annotate(leftNode, locals[leftNode.name]);
        }

        if (rightNode.type === 'Identifier' && (rightNode.name in locals)) {
          rightNode = this.sfe.annotate(rightNode, locals[rightNode.name]);
        }

        parent.operator = "|";
        parent.left = {
          "type": "CallExpression",
          "callee": {
            "type": "Identifier",
            "name": sfe.integerMultiplicationFunction
          },
          "arguments": [
            leftNode,
            rightNode
          ]
        };
        parent.right = {
          "type": "Literal",
          "value": 0,
          "raw": "0"
        };
      } else if (parent.type === 'BinaryExpression' && (parent.operator === '/' || parent.operator === '%')) {
        var otherOperand = (parent.left == node) ? parent.right : parent.left;
        var otherAsmType = sfe.evaluateAsmTypeForNode(otherOperand, locals);

        if (otherAsmType === 'signed' || otherAsmType === 'unsigned') {
          sfe.annotateInPlace(node, otherAsmType);
        }
      } else if (parent.type === 'CallExpression' && !(node == parent.callee)) {
        // The node is present as one of the arguments - we've morphed a literal
        // into an identifier, and now have to add the right type coercion to the node
        sfe.annotateInPlace(node, asmType);
      } else if (parent.type === 'ReturnStatement' && node == parent.argument) {
        // Add the right coercion to the node if it is present as a return value
        sfe.annotateInPlace(node, asmType);
      } else if (parent.type === 'BinaryExpression' && sfe.comparisonOperators.has(parent.operator)) {
        // comparison operator checks
        var otherOperand = (parent.left == node) ? parent.right : parent.left;
        var otherAsmType = sfe.evaluateAsmTypeForNode(otherOperand, locals);

        if (otherAsmType === 'signed' || otherAsmType === 'unsigned'){
          // Add the right annotation
          sfe.annotateInPlace(node, otherAsmType);
        }
      } else if (parent.type === 'UnaryExpression') {
        if (parent.operator === '-' && asmType !== 'double') {
          // -<literal> has type signed, -<identifier> has type intish.
          // Lets coerce to signed
          sfe.annotateInPlace(parent, 'signed');
        }
      }
    }
  }
}

module.exports = {
  AsmComplianceChecker: AsmComplianceChecker
};
