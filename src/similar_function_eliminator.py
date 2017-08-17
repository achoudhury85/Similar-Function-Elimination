"""
 SimilarFunctionEliminator version 1.0

 SimilarFunctionEliminator is a tool that analyzes and eliminates similar
 functions from an Emscripten generated Javascript file. Similar functions
 are defined as functions that differ by at most one line or less. This
 analysis comes in handy to identify potential savings that can be offered
 by coalescing similar functions.

 This file is the copyrighted property of Tableau Software and is protected
 by registered patents and other applicable U.S. and international laws and
 regulations.

 Unlicensed use of the contents of this file is prohibited. Please refer to
 the NOTICES.txt file for further details.
"""

import os
import re
import sys
from progress import *
from utils import *
from hashlib import md5
from timeit import default_timer
from logutil import plain_logger, fancy_logger
import subprocess, multiprocessing, json

SIMILAR_FUNCTION_ELIMINATOR = "run_sfe.js"

class SimilarFunctionEliminator:
    def __init__(self, args):
        self._js_file = args.file
        self._output_file = args.outputFile
        assert(os.path.isfile(self._js_file))
        self._analyze = args.analyze
        self._no_minimize_whitespace = args.noMinimizeWhitespace
        self._show_unminified = args.showUnminified
        self._function_identifier = 'function'
        self._function_identifier_len = len(self._function_identifier)

    # Returns the symbol map of minified functions to
    # the original functions
    def get_symbol_map(self):
        symbol_map = {}
        with open("{}.symbols".format(self._js_file), 'r') as f:
            for line in f:
                minified_func, original_func = line.split(':')
                symbol_map[minified_func.strip()] = original_func.strip()

        return symbol_map

    def run(self):
        log_line()
        logging.info("Generating similar function profile ..." if self._analyze else "Eliminating similar functions ...")
        progress_bar = ProgressBar()
        progress_bar.start()

        command = ["node", SIMILAR_FUNCTION_ELIMINATOR, '--file', self._js_file]

        if self._analyze:
            command.append('--analyze')

        if self._no_minimize_whitespace:
            command.append('--no-compact')
        (output,error) = subprocess.Popen(command, stdout=subprocess.PIPE,stderr=subprocess.PIPE).communicate()

        if self._show_unminified:
            unminified_output = []
            symbol_map = self.get_symbol_map()
            parsed_output = json.loads(output)

            for function_set in parsed_output:
                unminified_set = [symbol_map[fn_name] for fn_name in function_set]
                unminified_output.append(unminified_set[:])

            output = json.dumps(unminified_output, indent=4, separators=(',', ': '))

        if len(error) != 0:
            print "ERROR: {}".format(error)
            sys.exit(1)

        progress_bar.stop()
        log_line()

        if self._output_file:
            with open(self._output_file, "wb") as fout:
                fout.write(output)
            print("Output written to {}".format(self._output_file))
        else:
            print(output)

        log_line()

VALID_ARGUMENTS = [
    ("file", "-f", "--file", "Run similar function analyzer on the provided file", 1),
    ("showUnminified", "-su", "--showUnminified", "Show unminified versions of function names", 0),
    ("analyze", "-a", "--analyze", "Analyze similar functions", 0),
    ("outputFile", "-o", "--outputFile", "Output file to redirect standard out to", 1),
    ("noMinimizeWhitespace", "-n", "--noMinimizeWhitespace", "Don't minimize whitespace when writing output file.", 0)
    ]

def parse_args():
    parser = PrintHelpOnErrorArgumentParser()

    for arg_name, short_switch, long_switch, help, num_args in VALID_ARGUMENTS:
        if num_args != 0:
            parser.add_argument(
                short_switch,
                nargs=num_args,
                type=str,
                dest=arg_name)
        else:
            parser.add_argument(
                long_switch,
                short_switch,
                action="store_true",
                help=help,
                dest=arg_name)

    args = parser.parse_args()

    if args.file is None or not os.path.isfile(args.file[0]):
        print("Need a valid JS file for analyzing!")
        sys.exit(1)

    args.file = args.file[0]

    if args.outputFile:
        if os.path.isfile(args.outputFile[0]):
            logging.warning("WARNING: {} already exists. It will be overwritten!".format(args.outputFile[0]))
            os.remove(args.outputFile[0])

        args.outputFile = args.outputFile[0]

    return args

if __name__ == "__main__":
    start_time = default_timer()
    plain_logger()

    args = parse_args()

    similar_function_eliminator = SimilarFunctionEliminator(args)
    similar_function_eliminator.run()

    print("Wall clock time: {:.6f} seconds".format(round(default_timer() - start_time, 6)))
