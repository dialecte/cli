/**
 * Why a test case failed, read from the error the test runner reported and the test file's source: an
 * assertion, the stub's `not implemented` (a red only when thrown from inside an `expect(...)`), or a failure
 * that happens before any behaviour is asserted (a missing export, a type or syntax error, a timeout).
 */
import { stripVTControlCharacters } from 'node:util'

import {
	BROWSER_PATH_PREFIX_PATTERN,
	MESSAGE_LINES,
	MISSING_EXPORT_PATTERN,
	NOT_CALLABLE_PATTERN,
	NOT_IMPLEMENTED_PATTERN,
	QUERY_SUFFIX_PATTERN,
	SNAPSHOT_MISMATCH_PATTERN,
	SYNTAX_FAILURE_PATTERN,
	TIMEOUT_PATTERN,
} from './tdd.constants.ts'
import { importedNames, isInsideAssertion } from './test-source.ts'

import type { CaseFailure, FailureKind, ReportedError } from './tdd.types.ts'

export function classifyFailure(params: {
	error: ReportedError
	/** The test file: its absolute path and its text. */
	testFile: { path: string; text: string }
	/** The error was thrown while the file was loaded, before any case ran. */
	atImport: boolean
	/** An absolute path of production code (not test code, not a dependency). */
	isProductionFile: (path: string) => boolean
}): CaseFailure {
	return { kind: kindOf(params), message: shortMessage(params.error.message) }
}

function kindOf(params: {
	error: ReportedError
	testFile: { path: string; text: string }
	atImport: boolean
	isProductionFile: (path: string) => boolean
}): FailureKind {
	const { error, testFile } = params
	const message = stripVTControlCharacters(error.message)
	const frames = error.frames.map((frame) => ({ ...frame, file: normalizeFramePath(frame.file) }))
	const testFrame = frames.find((candidate) => candidate.file === testFile.path)
	// node reports 1-based columns, a browser run (chromium) 0-based ones: the call starts at either
	const inAssertion = Boolean(
		testFrame &&
		[testFrame.column, testFrame.column + 1].some((column) =>
			isInsideAssertion({ text: testFile.text, location: { line: testFrame.line, column } }),
		),
	)
	if (NOT_IMPLEMENTED_PATTERN.test(message)) {
		if (params.atImport) return 'not-implemented-at-import'
		return inAssertion ? 'not-implemented' : 'not-implemented-outside-assertion'
	}
	if (error.name === 'AssertionError' || SNAPSHOT_MISMATCH_PATTERN.test(message)) return 'assertion'
	if (TIMEOUT_PATTERN.test(message)) return 'timeout'
	if (MISSING_EXPORT_PATTERN.test(message)) return 'missing-export'
	const notCallable = NOT_CALLABLE_PATTERN.exec(message)
	if (error.name === 'TypeError' && notCallable)
		return importedNames(testFile.text).has(notCallable[1]) ? 'missing-export' : 'type-error'
	// existing code throws inside an asserting expect: a bug the test pins, whatever the error's class (a
	// deliberate throw in production looks the same, like a stub would: the review reads the diff)
	const thrower = frames[0]
	if (
		!params.atImport &&
		inAssertion &&
		thrower &&
		thrower.file !== testFile.path &&
		params.isProductionFile(thrower.file)
	)
		return 'error-in-production'
	if (error.name === 'TypeError') return 'type-error'
	if (error.name === 'SyntaxError' || SYNTAX_FAILURE_PATTERN.test(message)) return 'syntax-error'
	return 'error'
}

/** A frame's file as a path: a browser run may give `http://host/@fs/<path>?v=…` or a `file://` URL. */
export function normalizeFramePath(file: string): string {
	return decodeURI(file.replace(BROWSER_PATH_PREFIX_PATTERN, '').replace(QUERY_SUFFIX_PATTERN, ''))
}

/** The first lines of a message, without terminal colours. */
export function shortMessage(message: string): string {
	return stripVTControlCharacters(message).trim().split('\n').slice(0, MESSAGE_LINES).join('\n')
}
