#!/bin/bash
set -e

# Run script that demonstrates the effects of
# Similar Function Elimination
#
# NOTE: You will need to be able to run
# Emscripten, i.e., emcc should be in your path
# and the EMSCRIPTEN and LLVM variables should be set.
#
export NODE_PATH=$PWD/../node_modules
export PATH=$PATH:$PWD/../node_modules/bin

echo "Running Emscripten with full optimizations turned on - writing to printContainer.js"
emcc -s WASM=0 --std=c++11 -O3 ./printContainer.cpp -o printContainer.js

echo "Now running SFE on printContainer.js. Writing to printContainer_reduced.js"
node ../src/run_sfe.js --file printContainer.js > printContainer_reduced.js

echo "Printing out old and new printContainer.js"
ls -l printContainer*.js

