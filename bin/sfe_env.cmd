@echo off

REM NOTE: This script should be run EXCLUSIVELY from the SimilarFunctionEliminator directory
REM You can then run node src\run_sfe.js --file <INPUT_FILE>  > <OUTPUT_FILE>
REM You can supply the --no-compact option to not minimize whitespace.
set NODE_PATH =%cd%\node_modules
set PATH=%PATH%;%cd%\node_modules\.bin
