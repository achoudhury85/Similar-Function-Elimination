# Similar Function Elimination

## Overview
This repository contains a reference implementation of *Similar Function Elimination*, a post build optimization
pass for the Emscripten transpiler that coalesces functions that share similar structure but different literals or identifiers into
helper functions. It maintains asm.js compliance as well.

## Requirements
* The ability to run (a hopefully recent version of) Emscripten. This has been tested with version 1.37.16.
* Some flavor of Linux (might work on Windows and OSX but not tested on those platforms). This has been tested on CentOS 7.
* A version of NodeJS that understands ES6. Tested with version 8.4.0.

## Running
* Clone the repository and check out the master branch
* Navigate to the examples directory. Make sure that you can run emcc from your command line.
* Run the following command:
    sh ./run.sh
* This will run Emscripten on the printContainers.cpp example code, followed by a subsequent execution of SFE. In our testing, we see the following results.

    -rw-r--r-- 1 achoudhury domain users **627268** Aug 17 16:46 printContainer.js  
    -rw-r--r-- 1 achoudhury domain users **505126** Aug 17 16:46 printContainer_reduced.js

## Observed Behavior
SFE works quite well on template heavy codebases. On our simple example where we were printing the contents of a number
of STL containers, we see a 20% size reduction with SFE. Your mileage may vary depending on how template heavy your codebase is.