/** Scans the production sources for direct writes to standard output and standard error. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	COMMENT_LINE_PATTERN,
	CONSOLE_PATTERN,
	READ_ONLY_STREAM_PATTERN,
	SCANNER_SAMPLES,
	STREAM_DESCRIPTOR_PATTERN,
	STREAM_REFERENCE_PATTERN,
	STREAM_TAKEN_PATTERN,
	SYNCHRONOUS_WRITE_PATTERN,
	TEST_FILE_SUFFIX,
	WRITER_EXCEPTIONS,
} from './print-boundary-scan.constants.ts'

import type { GuardReport, WriterException } from './print-boundary-scan.types.ts'

/**
 * Whether a source line reaches a stream or a console itself: a console print, any use of `process.stdout` or
 * `process.stderr` (a write, the stream passed as a value, bracket access, destructuring, an import) except the
 * read-only terminal properties, and a descriptor passed to a synchronous write.
 */
export function writesDirectly(line: string): boolean {
	if (COMMENT_LINE_PATTERN.test(line)) return false
	if (CONSOLE_PATTERN.test(line) || STREAM_TAKEN_PATTERN.test(line)) return true
	const withoutReads = line.replace(READ_ONLY_STREAM_PATTERN, '')
	const withoutDescriptors = SYNCHRONOUS_WRITE_PATTERN.test(withoutReads)
		? withoutReads
		: withoutReads.replace(STREAM_DESCRIPTOR_PATTERN, '')
	return STREAM_REFERENCE_PATTERN.test(withoutDescriptors)
}

/** The production files of `packageRoot/src` as paths relative to the package root, with `/` separators, sorted. */
export function productionFilesOf(packageRoot: string): string[] {
	return readdirSync(join(packageRoot, 'src'), { recursive: true, encoding: 'utf8' })
		.filter((path) => path.endsWith('.ts') && !path.endsWith(TEST_FILE_SUFFIX))
		.map((path) => `src/${path.split('\\').join('/')}`)
		.sort()
}

/** Whether `exception` names `file`: the file itself, or a file under a folder exception. */
function namesFile(params: { exception: WriterException; file: string }): boolean {
	const { exception, file } = params
	return exception.path.endsWith('/') ? file.startsWith(exception.path) : file === exception.path
}

/** Whether the line `line` of `file` is allowed to write: a file exception, or a line exception whose pattern it matches. */
export function isException(params: { file: string; line: string }): boolean {
	return WRITER_EXCEPTIONS.some(
		(exception) =>
			namesFile({ exception, file: params.file }) &&
			(exception.linePattern === undefined || exception.linePattern.test(params.line)),
	)
}

/** Each `<file>:<line>` outside the exceptions where a production file writes to a stream or a console itself. */
export function offendersOf(packageRoot: string): string[] {
	return productionFilesOf(packageRoot).flatMap(function offendingLines(file) {
		return readFileSync(join(packageRoot, file), 'utf8')
			.split('\n')
			.flatMap((line, index) =>
				writesDirectly(line) && !isException({ file, line }) ? [`${file}:${index + 1}`] : [],
			)
	})
}

/** The exceptions that name no file or folder of the sources. */
export function staleExceptionsOf(packageRoot: string): string[] {
	return WRITER_EXCEPTIONS.filter(
		(exception) => !existsSync(join(packageRoot, exception.path)),
	).map((exception) => exception.path)
}

/** The sample lines the scanner judges the wrong way round. */
export function scannerMissesOf(): string[] {
	return SCANNER_SAMPLES.filter((sample) => writesDirectly(sample.line) !== sample.flagged).map(
		(sample) => sample.line,
	)
}

/** The whole guard's report for the package at `packageRoot`. */
export function guardReportOf(packageRoot: string): GuardReport {
	return {
		offenders: offendersOf(packageRoot),
		staleExceptions: staleExceptionsOf(packageRoot),
		scannerMisses: scannerMissesOf(),
	}
}
