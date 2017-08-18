var SimilarFunctionData = function(canonicalizedAst) {
  this.functions = [];

  // Placeholder data
  // type - either CallExpression, Identifier, or Literal
  // replacementValues - an array of replacement values, with one for each function being coalesced
  // parametrize - true if we are parametrizing, false if not
  this.placeholderData = {};
  this.canonicalizedAst = canonicalizedAst;
  this.functionIndexDict = {};
}

SimilarFunctionData.prototype.compareReplacementValues = function(value1, value2) {
  if (value1.type === 'Identifier') {
    return value1.name == value2.name;
  } else { // Literal
    return (value1.value === value2.value) &&
           (value1.raw === value2.raw);
  }
}

SimilarFunctionData.prototype.add = function(functionName, functionPlaceholderData, sfe) {
  this.functions.push(functionName);

  for (var placeholderName in functionPlaceholderData) {
    // Ignore the ast node
    if (placeholderName !== 'ast') {
      var placeholderInfo = functionPlaceholderData[placeholderName];
      var placeholderData = this.placeholderData;

      // If we don't have data for this placeholder, create one
      if (!(placeholderName in placeholderData)) {
        placeholderData[placeholderName] = {
          type: placeholderInfo.type,
          asmType: placeholderInfo.asmType,
          replacementValues: [placeholderInfo.astData],
          parametrize: false, // True if not all the placeholder values are equal
          functionTable: undefined // Only used if we are a call expression and get parametrized
        };
      } else {
        var curPlaceholderData = placeholderData[placeholderName];
        var replacementValues = curPlaceholderData.replacementValues;

        if ((curPlaceholderData.type !== placeholderInfo.type) ||
            (curPlaceholderData.asmType !== placeholderInfo.asmType)) {
          throw new Error("DETECTED placeholder " + placeholderName + " with different types across functions!!!!");
        } else {
          var numReplacementValues = replacementValues.length;
          var parametrize = curPlaceholderData.parametrize;

          // If we find the placeholder for the function to be different from the last replacement value, we want to parametrize
          if (!parametrize && !this.compareReplacementValues(replacementValues[numReplacementValues-1], placeholderInfo.astData)) {
            curPlaceholderData.parametrize = true; // Yep, we want to parametrize this placeholder

            if (placeholderInfo.type === 'CallExpression') {
              var functionNames = [];
              for (var index = 0; index < numReplacementValues; ++index) {
                functionNames.push(replacementValues[index].name);
              }

              // Ensure that these functions all belong in the same table
              curPlaceholderData.functionTable = sfe.getTableForFunctions(functionNames);
            }
          }

          replacementValues.push(placeholderInfo.astData);

          var functionTable = curPlaceholderData.functionTable;
          if (typeof(functionTable) !== 'undefined') {
            var astData = placeholderInfo.astData;
            if (!functionTable.contains(astData.name) && (astData.name in sfe.functionNameToIndex)) {
              functionTable.addNew(astData.name);
            }
          }
        }
      }
    }
  }

  this.functionIndexDict[functionName] = this.functions.length-1;
}

module.exports = {
  SimilarFunctionData: SimilarFunctionData
}
