/** The first syntax error of a script file, read without a type checker and without emitting anything. */
import { SYNTAX_CHECK_OPTIONS } from './first-syntax-error.constants.ts'

import ts from 'typescript'

import type { FirstSyntaxError } from './first-syntax-error.types.ts'

/**
 * The first syntax error of an already-parsed `source`, at its 1-based line and column; undefined when it parses.
 * The syntactic diagnostics `ts.transpileModule(..., { reportDiagnostics: true })` reports, without its emit (a
 * sixth of the time over a whole package), and without parsing the file again.
 */
export function firstSyntaxErrorOf(params: {
	source: ts.SourceFile
}): FirstSyntaxError | undefined {
	const { source } = params
	const program = ts.createProgram({
		rootNames: [source.fileName],
		options: SYNTAX_CHECK_OPTIONS,
		host: singleFileHost(source),
	})
	const [first] = program.getSyntacticDiagnostics(source)
	if (first === undefined) return undefined
	const position = source.getLineAndCharacterOfPosition(first.start ?? 0)
	return {
		line: position.line + 1,
		column: position.character + 1,
		message: ts.flattenDiagnosticMessageText(first.messageText, ' '),
	}
}

/** A compiler host that knows one file, already parsed, and reads nothing from the disk. */
function singleFileHost(source: ts.SourceFile): ts.CompilerHost {
	return {
		getSourceFile: function sourceNamed(name) {
			return name === source.fileName ? source : undefined
		},
		fileExists: function isTheFile(name) {
			return name === source.fileName
		},
		readFile: function readNothing() {
			return undefined
		},
		writeFile: function writeNothing() {},
		getDefaultLibFileName: function noLibrary() {
			return ''
		},
		getCurrentDirectory: function noDirectory() {
			return ''
		},
		getCanonicalFileName: function sameName(name) {
			return name
		},
		useCaseSensitiveFileNames: function caseSensitive() {
			return true
		},
		getNewLine: function newLine() {
			return '\n'
		},
	}
}
