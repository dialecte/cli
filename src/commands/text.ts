/**
 * `dialecte text check <file> [--kind pr|issue|comment|commit]`: checks the human part of a GitHub text
 * before the user posts it - its fixed headings and its word cap.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { printOut } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { checkText } from '../lib/text-check/check-text.ts'
import { renderTextCheck } from '../lib/text-check/render-text-check.ts'
import {
	DEFAULT_TEXT_KIND,
	TEXT_CHECK_OPTIONS,
	TEXT_CHECK_USAGE,
	TEXT_USAGE,
	WORD_CAPS,
} from '../lib/text-check/text-check.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { TextKind } from '../lib/text-check/text-check.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runText({ cwd: process.cwd(), argv })
	printOut({ stream: result.exitCode === 0 ? 'stdout' : 'stderr', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runText(params: { cwd: string; argv: string[] }): CommandResult {
	const [subcommand, ...argv] = params.argv
	if (subcommand !== 'check') return resultOf({ exitCode: 2, lines: [TEXT_USAGE] })
	const read = readArguments({ argv, valueOptions: TEXT_CHECK_OPTIONS })
	if (typeof read === 'string')
		return resultOf({ exitCode: 2, lines: [`${TEXT_CHECK_USAGE} (${read})`] })
	const kind = read.values.get('kind') ?? DEFAULT_TEXT_KIND
	if (!isTextKind(kind))
		return resultOf({ exitCode: 2, lines: [`${TEXT_CHECK_USAGE} (unknown kind ${kind})`] })
	if (read.words.length !== 1) return resultOf({ exitCode: 2, lines: [TEXT_CHECK_USAGE] })
	const [file] = read.words
	const path = resolve(params.cwd, file)
	if (!existsSync(path)) return resultOf({ exitCode: 1, lines: [`text check: no file ${path}`] })
	return renderTextCheck({
		file,
		kind,
		check: checkText({ text: readFileSync(path, 'utf8'), kind }),
	})
}

function isTextKind(kind: string): kind is TextKind {
	return Object.hasOwn(WORD_CAPS, kind)
}
