var chai = require('chai');
var expect = chai.expect;
var FunctionTable = require('../../src/function_table.js').FunctionTable;

// Function table tests
describe('FunctionTable.finalize', function() {
  it('correctly pads the end of the function table so that its length is a power of 2', function() {
    var functionTable = new FunctionTable('table', undefined, false);
    functionTable.add('abc');
    var length = 1;

    // Verify upto 2^10
    for (var exponent = 1; exponent <= 10; ++exponent) {
      functionTable.finalize();

      expect(functionTable.length).to.equal(length);

      functionTable.add('abc');
      length *= 2;
    }
  });
});

describe('FunctionTable.at', function() {
  it('correctly returns the value at the passed in index', function() {
    var functionTable = new FunctionTable('table', undefined, false);
    var functions = ['abc', 'def', 'ghi', 'jkl'];

    for (var index = 0; index < functions.length; ++index) {
      functionTable.add(functions[index]);
      expect(functionTable.at(functionTable.length-1)).to.equal(functions[index]);
    }
  });
});

describe('FunctionTable.contains', function() {
  it('correctly returns whether the passed in function is present in the function table', function() {
    var functionTable = new FunctionTable('table', undefined, false);
    var functions = ['abc', 'def', 'ghi', 'jkl'];

    for (var index = 0; index < functions.length; ++index) {
      functionTable.add(functions[index]);
      expect(functionTable.contains(functions[index])).to.equal(true);
    }
  });
});

describe('FunctionTable.functionIndex', function() {
  it('correctly returns the index of the passed in function', function() {
    var functionTable = new FunctionTable('table', undefined, false);
    var functions = ['abc', 'def', 'ghi', 'jkl'];

    for (var index = 0; index < functions.length; ++index) {
      functionTable.add(functions[index]);
      expect(functionTable.functionIndex(functions[index])).to.equal(index);
    }

    expect(functionTable.needsCodegen).to.equal(false);
  });
});

describe('FunctionTable.addNew', function() {
  it('correctly adds the function to the function table and marks the function table as needing codegen', function() {
    var functionTable = new FunctionTable('table', undefined, false);
    var functions = ['abc', 'def', 'ghi', 'jkl'];

    for (var index = 0; index < functions.length; ++index) {
      functionTable.addNew(functions[index]);
      expect(functionTable.functionIndex(functions[index])).to.equal(index);
    }

    expect(functionTable.needsCodegen).to.equal(true);
  });
});
