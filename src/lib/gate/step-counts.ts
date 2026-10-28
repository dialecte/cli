/**
 * Counts read from a step's own summary lines (vitest, node --test, tsc, oxlint, `dialecte skills check`), never from
 * a wrapper's summary: the gate decides on these and on the exit code.
 */

import { stripVTControlCharacters } from 'node:util'

import type { StepCounts } from './gate.types.ts'

export function readStepCounts(output: string): StepCounts {
	const text = stripVTControlCharacters(output)
	const counts: StepCounts = {}

	const testsLine = lastMatch({ text, pattern: /^\s*Tests\s+(.+)\((\d+)\)\s*$/gm })
	if (testsLine)
		counts.tests = {
			passed: countOf({ text: testsLine[1], word: 'passed' }),
			failed: countOf({ text: testsLine[1], word: 'failed' }),
			skipped:
				countOf({ text: testsLine[1], word: 'skipped' }) +
				countOf({ text: testsLine[1], word: 'todo' }),
			total: Number(testsLine[2]),
		}
	// node --test: `ℹ tests 3` (spec reporter) or `# tests 3` (tap), one line per count
	const nodeTotal = lastMatch({ text, pattern: /^[ℹ#] tests (\d+)$/gm })
	if (!testsLine && nodeTotal) {
		counts.tests = {
			passed: nodeTestCount({ text, word: 'pass' }),
			failed: nodeTestCount({ text, word: 'fail' }) + nodeTestCount({ text, word: 'cancelled' }),
			skipped: nodeTestCount({ text, word: 'skipped' }) + nodeTestCount({ text, word: 'todo' }),
			total: Number(nodeTotal[1]),
		}
	}
	const filesLine = lastMatch({ text, pattern: /^\s*Test Files\s+(.+)\((\d+)\)\s*$/gm })
	if (filesLine)
		counts.testFiles = {
			passed: countOf({ text: filesLine[1], word: 'passed' }),
			failed: countOf({ text: filesLine[1], word: 'failed' }),
			total: Number(filesLine[2]),
		}

	// tsc prints one `error TS<code>:` per error, piped or pretty
	const typeErrors = text.match(/\berror TS\d+:/g)?.length ?? 0
	let errors = typeErrors
	let warnings = 0
	let found = typeErrors > 0
	// oxlint: a `Found` summary on a terminal, one `file:line:column: severity` line per finding piped
	const lintSummaries = [...text.matchAll(/Found (\d+) warnings? and (\d+) errors?/g)]
	for (const match of lintSummaries) {
		warnings += Number(match[1])
		errors += Number(match[2])
		found = true
	}
	if (lintSummaries.length === 0)
		for (const match of text.matchAll(/^\S.*:\d+:\d+: (error|warning) /gm)) {
			if (match[1] === 'error') errors += 1
			else warnings += 1
			found = true
		}
	// dialecte skills check
	for (const match of text.matchAll(/checked: (\d+) error\(s\), (\d+) warning\(s\)/g)) {
		errors += Number(match[1])
		warnings += Number(match[2])
		found = true
	}
	if (found) Object.assign(counts, { errors, warnings })
	return counts
}

export function renderStepCounts(counts: StepCounts): string {
	const parts: string[] = []
	if (counts.tests) {
		const { passed, failed, skipped, total } = counts.tests
		parts.push(
			`tests ${passed} passed${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''} / ${total}`,
		)
	}
	if (counts.testFiles) parts.push(`files ${counts.testFiles.total}`)
	if (counts.errors !== undefined)
		parts.push(`${counts.errors} error(s), ${counts.warnings ?? 0} warning(s)`)
	return parts.join(', ')
}

/** One count of the node test runner's summary: `ℹ pass 3`. */
function nodeTestCount(params: { text: string; word: string }): number {
	const pattern = new RegExp(`^[ℹ#] ${params.word} (\\d+)$`, 'gm')
	return Number(lastMatch({ text: params.text, pattern })?.[1] ?? 0)
}

function lastMatch(params: { text: string; pattern: RegExp }): RegExpMatchArray | undefined {
	return [...params.text.matchAll(params.pattern)].at(-1)
}

function countOf(params: { text: string; word: string }): number {
	const match = new RegExp(`(\\d+) ${params.word}`).exec(params.text)
	return match ? Number(match[1]) : 0
}
