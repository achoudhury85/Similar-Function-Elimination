var FunctionTable = function(name, type, needsCodegen) {
  this.type = type;
  this.needsCodegen = needsCodegen;
  this.name = name;
  this.functions = [];
  this.functionToIndex = {};
  this.length = 0;
}

FunctionTable.prototype.add = function(functionName) {
  this.functions.push(functionName);
  this.functionToIndex[functionName] = this.functions.length-1;
  this.length++;
}

FunctionTable.prototype.addNew = function(functionName) {
  this.add(functionName);
  this.needsCodegen = true;
}

FunctionTable.prototype.contains = function(functionName) {
  return (functionName in this.functionToIndex);
}

FunctionTable.prototype.functionIndex = function(functionName) {
  return this.functionToIndex[functionName];
}

FunctionTable.prototype.at = function(index) {
  return this.functions[index];
}

FunctionTable.prototype.finalize = function() {
  if (this.length > 0) {
    // Finalization involves ensuring that the length of the function
    // table is a power of 2. To ensure this, we pad in the last element
    // until the length is a power of 2.
    var lastFunction = this.functions[this.length-1];

    while ((this.length & (this.length-1)) !== 0) {
      this.functions.push(lastFunction);
      ++this.length;
    }
  }
}

FunctionTable.prototype.dump = function() {
  SFE.Utils.printErr("FUNCTION TABLE:");
  SFE.Utils.printErr(JSON.stringify(
  {
    name: this.name,
    needsCodegen: this.needsCodegen,
    type: this.type,
    functions: this.functions
  }, null, 2));
}

module.exports = {
  FunctionTable: FunctionTable
};
