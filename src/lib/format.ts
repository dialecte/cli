/**
 * Format CLI-emitted files with oxfmt — same idea as `bench` running the project's own `tsc`: the
 * generated output ends up in the consuming package's exact style, so it never churns against that
 * package's `format:check`. oxfmt formats .ts/.json/.md.
 *
 * Binary: the CONSUMER's oxfmt wins (its version + the config it auto-discovers); otherwise the CLI's
 * own bundled oxfmt (the shared house style). Config: `--format-config <path>` overrides; otherwise
 * oxfmt auto-discovers the nearest `.oxfmtrc`. Graceful: if no oxfmt is available or it fails, we warn
 * and leave the files as written (valid, just unformatted). `--no-format` skips it.
 */
import { spawnSync } from 'node:child_process'

import { resolveBin } from './bin.ts'
import { getArg, hasFlag } from './config.ts'
import {
	EXITED_WARNING_END,
	FAILED_FILES_NAMED,
	FAILURE_DETAIL_INDENT,
	NOT_STARTED_WARNING_END,
	WARNING_INDENT,
} from './format.constants.ts'
import { joinedOf, printLines, printOut, textOf } from './print/print.ts'
import { relayedTextOf } from './print/relayed.ts'

import type { FormatFilesParams, FormatOpts } from './format.types.ts'

export function formatOptsFromArgv(argv: string[]): FormatOpts {
	return { config: getArg(argv, 'format-config'), skip: hasFlag(argv, 'no-format') }
}

/**
 * Run oxfmt over `files` (absolute or root-relative). No-op on skip / when no oxfmt is available.
 * Answers false when oxfmt failed or could not start, so a caller that must not leave unformatted files
 * can say so; the warning says why (the error, or the files and oxfmt's own lines).
 */
export function formatFiles(params: FormatFilesParams): boolean {
	const { root, files, options = {} } = params
	if (options.skip || !files.length) return true
	const oxfmt = resolveBin('oxfmt', 'oxfmt', root)
	if (!oxfmt) {
		printLines({
			stream: 'stderr',
			lines: ['  ⚠ oxfmt not found (project nor @dialecte/cli) — emitted files left unformatted'],
		})
		return true
	}
	const args = [...(options.config ? ['--config', options.config] : []), ...files]
	const res = spawnSync(oxfmt.path, args, { cwd: root, encoding: 'utf8' })
	if (res.status === 0) return true
	if (res.error) {
		printLines({
			stream: 'stderr',
			lines: [
				`${WARNING_INDENT}⚠ oxfmt could not start (${res.error.message}) ${NOT_STARTED_WARNING_END}`,
			],
		})
		return false
	}
	function indentDetail(line: string): string {
		return `${FAILURE_DETAIL_INDENT}${line}`
	}
	const own = textOf([
		`${WARNING_INDENT}⚠ oxfmt exited ${res.status ?? '?'} ${EXITED_WARNING_END}`,
		...namedFiles(files).map(indentDetail),
	])
	// oxfmt's own lines are relayed: its colours kept, every other control escaped
	const relayed = outputLines({ stderr: res.stderr, stdout: res.stdout }).map(indentDetail)
	printOut({
		stream: 'stderr',
		text: relayed.length ? joinedOf([own, relayedTextOf(relayed)]) : own,
	})
	return false
}

/** The files oxfmt was given, as given, the first few named and the others counted. */
function namedFiles(files: string[]): string[] {
	const named = files.slice(0, FAILED_FILES_NAMED)
	const others = files.length - named.length
	return others > 0 ? [...named, `and ${others} more`] : named
}

/** oxfmt's own lines: its stderr, or its stdout when stderr is empty. */
function outputLines(params: { stderr: string; stdout: string }): string[] {
	const output = params.stderr.trim() ? params.stderr : params.stdout
	return output.split(/\r?\n/).filter(function hasText(line) {
		return line.trim() !== ''
	})
}
