var FunctionTableCollection = function() {
  this.functionTableCollection = [];
  this.length = 0;
  this.tableNameToIndex = {};
}

FunctionTableCollection.prototype.lookupFunction = function(functionName) {
  var table = undefined;
  var tableCollection = this.functionTableCollection;
  var numTables = tableCollection.length;

  for (var tableIndex = 0; tableIndex < numTables; ++tableIndex) {
    var curTable = tableCollection[tableIndex];
    if (curTable.contains(functionName)) {
      table = curTable;
      break;
    }
  }

  return table;
}

FunctionTableCollection.prototype.add = function(functionTable) {
  this.functionTableCollection.push(functionTable);
  this.tableNameToIndex[functionTable.name] = this.length;
  this.length++;
}

FunctionTableCollection.prototype.at = function(index) {
  return this.functionTableCollection[index];
}

FunctionTableCollection.prototype.lookupTable = function(tableName) {
  return this.functionTableCollection[this.tableNameToIndex[tableName]];
}

module.exports = {
  FunctionTableCollection: FunctionTableCollection
};
