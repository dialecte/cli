/** What `dialecte text check` prints: the count when the text holds, else one line per problem. */
import { resultOf } from '../command-result.ts'
import { counted } from '../counted.ts'
import { HEADED_KINDS, PROBLEM_TEXT } from './text-check.constants.ts'

import type { CommandResult } from '../command-result.types.ts'
import type { TextCheck, TextKind, TextProblem } from './text-check.types.ts'

export function renderTextCheck(params: {
	file: string
	kind: TextKind
	check: TextCheck
}): CommandResult {
	const { file, kind, check } = params
	const { overCap } = check
	const problemCount = check.problems.length + (overCap ? 1 : 0)
	if (problemCount === 0)
		return resultOf({
			exitCode: 0,
			lines: [
				`text check: ${file} - ${kind}, ${check.words} of ${check.cap} words${HEADED_KINDS.includes(kind) ? ', headings ok' : ''}`,
			],
		})
	return resultOf({
		exitCode: 1,
		lines: [
			`text check: ${file} - ${kind}: ${counted({ count: problemCount, noun: 'problem' })}`,
			...check.problems.map((problem) => problemLine({ file, problem })),
			...(overCap
				? [
						`${file}: ${overCap.words} words, the cap is ${overCap.cap} (cut ${overCap.words - overCap.cap})`,
						...overCap.lines.map((line) =>
							problemLine({ file, problem: { line, what: PROBLEM_TEXT.pastTheCap } }),
						),
					]
				: []),
		],
	})
}

/**
 * `<file>:<line>: <what> - <the line's text>` (`<file>:<line>: <what>` for an empty line), or `<file>: <what>`
 * for a problem of no line.
 */
function problemLine(params: { file: string; problem: TextProblem }): string {
	const { line, what } = params.problem
	if (!line) return `${params.file}: ${what}`
	const text = line.text.trimEnd()
	return `${params.file}:${line.number}: ${what}${text ? ` - ${text}` : ''}`
}
