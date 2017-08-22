#!/bin/bash

# NOTE: This script should be run EXCLUSIVELY from the SimilarFunctionEliminator directory
# You can then run node src\run_sfe.js --file <INPUT_FILE>  > <OUTPUT_FILE>
# You can supply the --no-compact option to not minimize whitespace.
export NODE_PATH=$PWD/node_modules
export PATH=$PATH:$PWD/node_modules/.bin
