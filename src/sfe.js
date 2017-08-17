// -----------------------------------------------------------------------------
//
// This file is the copyrighted property of Tableau Software and is protected
// by registered patents and other applicable U.S. and international laws and
// regulations.
//
// Unlicensed use of the contents of this file is prohibited. Please refer to
// the NOTICES.txt file for further details.
//
// File that allows for modular access to the various components involved in 
// performing similar function elimination.
// -----------------------------------------------------------------------------

var asmComplianceChecker = require('./asm_compliance_checker.js');
var functionTable = require('./function_table.js');
var functionTableCollection = require('./function_table_collection.js');
var nameGeneration = require('./minified_name_generator.js');
var similarFunctionData = require('./similar_function_data.js');
var similarFunctionEliminator = require('./similar_function_eliminator.js');
var utils = require('./utils.js');

module.exports = {
  AsmComplianceChecker: asmComplianceChecker.AsmComplianceChecker,
  FunctionTable: functionTable.FunctionTable,
  FunctionTableCollection: functionTableCollection.FunctionTableCollection,
  MinifiedNameGenerator: nameGeneration.MinifiedNameGenerator,
  SimilarFunctionData: similarFunctionData.SimilarFunctionData,
  SimilarFunctionEliminator: similarFunctionEliminator.SimilarFunctionEliminator,
  Utils: utils.Utils
};
