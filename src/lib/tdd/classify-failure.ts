/**
 * Why a test case failed, read from the error the test runner reported and the test file's source: an
 * assertion, the stub's `not implemented` (a red only when thrown from inside an `expect(...)`), or a failure
 * that happens before any behaviour is asserted (a missing export, a type or syntax error, a timeout). A pytest
 * error carries its own answer to "inside an assertion" (an `assert` statement), read from the Python source by
 * the cli's plugin; its stub is a `NotImplementedError`, whatever its message.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import {
	BROWSER_PATH_PREFIX_PATTERN,
	MESSAGE_LINES,
	MISSING_EXPORT_PATTERN,
	NOT_CALLABLE_PATTERN,
	NOT_IMPLEMENTED_PATTERN,
	PYTEST_FAILED_NAME,
	PYTEST_MISSED_PATTERN,
	PYTEST_TIMEOUT_PATTERN,
	PYTHON_MISSING_ATTRIBUTE_PATTERN,
	PYTHON_MISSING_NAME_PATTERN,
	PYTHON_MODULE_SUFFIX,
	PYTHON_PACKAGE_FILE,
	PYTHON_STUB_NAME,
	PYTHON_SYNTAX_ERROR_NAMES,
	QUERY_SUFFIX_PATTERN,
	SNAPSHOT_MISMATCH_PATTERN,
	SYNTAX_FAILURE_PATTERN,
	TIMEOUT_PATTERN,
} from './tdd.constants.ts'
import { importedNames, isInsideAssertion } from './test-source.ts'

import type { CaseFailure, ErrorFrame, FailureKind, ReportedError } from './tdd.types.ts'

export function classifyFailure(params: {
	error: ReportedError
	/** The test file: its absolute path and its text. */
	testFile: { path: string; text: string }
	/** The error was thrown while the file was loaded, before any case ran. */
	atImport: boolean
	/** An absolute path of production code (not test code, not a dependency). */
	isProductionFile: (path: string) => boolean
}): CaseFailure {
	// an error raised bare (`raise NotImplementedError`) carries no message: its name says what it was
	return {
		kind: kindOf(params),
		message: shortMessage(params.error.message) || (params.error.name ?? ''),
	}
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
	// the pytest plugin answers it from the Python source; the TypeScript source is read for the other runners
	const inAssertion = error.inAssertion ?? isTestFrameInAssertion({ frames, testFile })
	if (NOT_IMPLEMENTED_PATTERN.test(message) || error.name === PYTHON_STUB_NAME) {
		if (params.atImport) return 'not-implemented-at-import'
		return inAssertion ? 'not-implemented' : 'not-implemented-outside-assertion'
	}
	if (
		error.name === 'AssertionError' ||
		SNAPSHOT_MISMATCH_PATTERN.test(message) ||
		(error.name === PYTEST_FAILED_NAME && PYTEST_MISSED_PATTERN.test(message))
	)
		return 'assertion'
	if (
		TIMEOUT_PATTERN.test(message) ||
		(error.name === PYTEST_FAILED_NAME && PYTEST_TIMEOUT_PATTERN.test(message))
	)
		return 'timeout'
	if (
		MISSING_EXPORT_PATTERN.test(message) ||
		(error.name === 'ImportError' && PYTHON_MISSING_NAME_PATTERN.test(message)) ||
		isMissingProductionAttribute({ ...params, message })
	)
		return 'missing-export'
	const notCallable = NOT_CALLABLE_PATTERN.exec(message)
	if (error.name === 'TypeError' && notCallable)
		return importedNames({ text: testFile.text, file: testFile.path }).has(notCallable[1])
			? 'missing-export'
			: 'type-error'
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
	if (PYTHON_SYNTAX_ERROR_NAMES.includes(error.name ?? '') || SYNTAX_FAILURE_PATTERN.test(message))
		return 'syntax-error'
	return 'error'
}

/** The innermost frame in the test file lies inside an assertion of its TypeScript source. */
function isTestFrameInAssertion(params: {
	frames: readonly ErrorFrame[]
	testFile: { path: string; text: string }
}): boolean {
	const { testFile } = params
	const testFrame = params.frames.find((candidate) => candidate.file === testFile.path)
	if (!testFrame) return false
	// node reports 1-based columns, a browser run (chromium) 0-based ones: the call starts at either
	return [testFrame.column, testFrame.column + 1].some((column) =>
		isInsideAssertion({
			text: testFile.text,
			file: testFile.path,
			location: { line: testFrame.line, column },
		}),
	)
}

/**
 * A Python `AttributeError: module 'm' has no attribute 'x'` whose module `m` (dotted) is a production file: the
 * module is looked up as `<parts>.py` or `<parts>/__init__.py` from the test file's folder up, the first found.
 */
function isMissingProductionAttribute(params: {
	error: ReportedError
	message: string
	testFile: { path: string }
	isProductionFile: (path: string) => boolean
}): boolean {
	if (params.error.name !== 'AttributeError') return false
	const moduleName = PYTHON_MISSING_ATTRIBUTE_PATTERN.exec(params.message)?.[1]
	if (moduleName === undefined) return false
	const parts = moduleName.split('.')
	for (let folder = dirname(params.testFile.path); ; folder = dirname(folder)) {
		const found = [
			`${join(folder, ...parts)}${PYTHON_MODULE_SUFFIX}`,
			join(folder, ...parts, PYTHON_PACKAGE_FILE),
		].find((path) => existsSync(path))
		if (found) return params.isProductionFile(found)
		if (dirname(folder) === folder) return false
	}
}

/** A frame's file as a path: a browser run may give `http://host/@fs/<path>?v=…` or a `file://` URL. */
export function normalizeFramePath(file: string): string {
	return decodeURI(file.replace(BROWSER_PATH_PREFIX_PATTERN, '').replace(QUERY_SUFFIX_PATTERN, ''))
}

/** The first lines of a message, without terminal colours. */
export function shortMessage(message: string): string {
	return stripVTControlCharacters(message).trim().split('\n').slice(0, MESSAGE_LINES).join('\n')
}

/** The first line of a message, without terminal colours. */
export function firstLine(message: string): string {
	return shortMessage(message).split('\n')[0]
}

/** Why a failure is no red: its kind and the first line of its message. */
export function notARed(failure: CaseFailure): string {
	return `${failure.kind} (not a red): ${firstLine(failure.message)}`
}
