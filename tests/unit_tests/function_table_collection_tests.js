// -----------------------------------------------------------------------------
// This file is the copyrighted property of Tableau Software and is protected
// by registered patents and other applicable U.S. and international laws and
// regulations.
//
// Unlicensed use of the contents of this file is prohibited. Please refer to
// the NOTICES.txt file for further details.
//
// Tests for function table collection code
// -----------------------------------------------------------------------------

var chai = require('chai');
var expect = chai.expect;
var FunctionTable = require('../../src/function_table.js').FunctionTable;
var FunctionTableCollection = require('../../src/function_table_collection.js').FunctionTableCollection;

describe('FunctionTableCollection.lookupFunction', function() {
  it('correctly returns the table associated with the function', function() {
    var functionTableCollection = new FunctionTableCollection();

    // Add 10 tables and verify that we can lookup functions in them
    for (var index = 0; index < 10; ++index) {
      var tableName = 'table' + index.toString();
      var functionTable = new FunctionTable(tableName, undefined, false);
      for (var functionIndex = 0; functionIndex < 10; ++functionIndex) {
        var functionName = tableName + '_function_' + functionIndex.toString();
        functionTable.add(functionName);
      }

      functionTableCollection.add(functionTable);
    }

    // Now lets verify that we can lookup each function
    for (var index = 0; index < 10; ++index) {
      var tableName = 'table' + index.toString();
      for (var functionIndex = 0; functionIndex < 10; ++functionIndex) {
        var functionName = tableName + '_function_' + functionIndex.toString();
        expect(functionTableCollection.lookupFunction(functionName).name).to.equal(tableName);
      }
    }
  });
});

describe('FunctionTableCollection.add', function() {
  it('correctly adds a table to the collection', function() {
    var functionTableCollection = new FunctionTableCollection();
    var functionTable = new FunctionTable('table', undefined, false);
    functionTableCollection.add(functionTable);
    expect(functionTableCollection.at(0).name).to.equal(functionTable.name);
  });
});

describe('FunctionTableCollection.lookupTable', function() {
  it('correctly returns the table for the passed in name', function() {
    var functionTableCollection = new FunctionTableCollection();
    var functionTable = new FunctionTable('table', undefined, false);
    functionTableCollection.add(functionTable);

    expect(functionTableCollection.lookupTable(functionTable.name).name).to.equal(functionTable.name);
  });
});
