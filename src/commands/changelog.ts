/**
 * `dialecte changelog check [--base <revision>] | release <x.y.z> [--date YYYY-MM-DD]`: the changelog fragments of the
 * package (`changes/<name>.md`, one per lot). `check` reads every fragment and the Unreleased part, then the released
 * sections: against `--base` when given (CI hands the commit the change goes onto), else against the base branch and
 * where the change left it; `release` folds the fragments, after the Unreleased entries, into a new version section of
 * `CHANGELOG.md` and deletes them, with the no-entry notes (`changes/<name>.none.md`) - nothing written when a fragment
 * or the Unreleased part cannot be read.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	CHANGELOG_FILE,
	FOLD_REFUSALS,
	RELEASE_DATE_PATTERN,
	RELEASE_VERSION_PATTERN,
} from '../lib/changelog/changelog.constants.ts'
import { readFragments } from '../lib/changelog/fragments.ts'
import { foldChangelog, readUnreleasedOf } from '../lib/changelog/release-changelog.ts'
import { releasedSectionChanges } from '../lib/changelog/released-sections.ts'
import { getArg } from '../lib/config.ts'
import { errorReasonOf } from '../lib/error-reason.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { printOut, textOf } from '../lib/print/print.ts'
import {
	baseBranchReleaseOf,
	releasedChangeMessage,
	releasedTextsOf,
	verifiedCommitOf,
} from '../lib/rules/released-changelog.ts'
import { CHANGELOG_LINES, CHANGELOG_USAGE, CHANGELOG_VERBS } from './changelog.constants.ts'

import type { FragmentProblem, ReleaseBase } from '../lib/changelog/changelog.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = runChangelog({ cwd: process.cwd(), argv })
	printOut({ stream: result.exitCode === 0 ? 'stdout' : 'stderr', text: result.output })
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export function runChangelog(params: { cwd: string; argv: string[] }): CommandResult {
	const [verb, version] = params.argv
	if (!(CHANGELOG_VERBS as readonly (string | undefined)[]).includes(verb)) return usageError()
	const date = getArg(params.argv, 'date') ?? localDay()
	if (
		verb === 'release' &&
		(version === undefined ||
			!RELEASE_VERSION_PATTERN.test(version) ||
			!RELEASE_DATE_PATTERN.test(date))
	)
		return usageError()
	const read = readFragments({ root: params.cwd })
	if (read.problems.length > 0) return problemsOf({ problems: read.problems })
	const file = join(params.cwd, CHANGELOG_FILE)
	const text = existsSync(file) ? readFileSync(file, 'utf8') : undefined
	if (verb === 'check') {
		const unreleased = text === undefined ? undefined : readUnreleasedOf({ text })
		if (unreleased && 'problem' in unreleased)
			return refusedWith({
				problem: FOLD_REFUSALS.unreleased.replace('{problem}', unreleased.problem),
			})
		const released = releasedProblemsOf({ cwd: params.cwd, base: getArg(params.argv, 'base') })
		if ('unknownBase' in released)
			return {
				exitCode: 2,
				output: textOf([
					CHANGELOG_LINES.refused.replace('{problem}', () =>
						CHANGELOG_LINES.unknownBase.replace('{value}', () => released.unknownBase),
					),
				]),
			}
		if (released.messages.length > 0)
			return {
				exitCode: 1,
				output: textOf(
					released.messages.map((message) =>
						CHANGELOG_LINES.refused.replace('{problem}', () => message),
					),
				),
			}
		return {
			exitCode: 0,
			output: textOf([
				CHANGELOG_LINES.readable.replace('{fragments}', countOf({ count: read.fragments.length })),
			]),
		}
	}
	if (text === undefined || version === undefined)
		return refusedWith({ problem: FOLD_REFUSALS.noChangelog })
	const folded = foldChangelog({ text, version, date, fragments: read.fragments })
	if ('refusal' in folded) return refusedWith({ problem: folded.refusal })
	writeFileSync(file, folded.text)
	const leftovers = deleteFragments({
		cwd: params.cwd,
		files: [...read.fragments, ...read.notes].map((entry) => entry.file),
	})
	const released = CHANGELOG_LINES.released
		.replace('{version}', version)
		.replace('{date}', date)
		.replace('{fragments}', countOf({ count: read.fragments.length }))
	return { exitCode: leftovers.length > 0 ? 1 : 0, output: textOf([released, ...leftovers]) }
}

/** Deletes each fragment, every one tried; the line of each that could not be deleted. */
function deleteFragments(params: { cwd: string; files: readonly string[] }): string[] {
	return params.files.flatMap(function deleteFragment(file) {
		try {
			rmSync(join(params.cwd, file))
			return []
		} catch (error) {
			return [
				`changelog: ${FOLD_REFUSALS.leftover.replace('{file}', file).replace('{reason}', errorReasonOf(error))}`,
			]
		}
	})
}

/** Today in the machine's time zone, `YYYY-MM-DD`. */
function localDay(): string {
	const now = new Date()
	return `${now.getFullYear()}-${twoDigits({ value: now.getMonth() + 1 })}-${twoDigits({ value: now.getDate() })}`
}

function twoDigits(params: { value: number }): string {
	return String(params.value).padStart(2, '0')
}

function usageError(): CommandResult {
	return { exitCode: 2, output: textOf([CHANGELOG_USAGE]) }
}

function refusedWith(params: { problem: string }): CommandResult {
	return {
		exitCode: 1,
		output: textOf([CHANGELOG_LINES.refused.replace('{problem}', params.problem)]),
	}
}

function problemsOf(params: { problems: readonly FragmentProblem[] }): CommandResult {
	return {
		exitCode: 1,
		output: textOf(
			params.problems.map((entry) =>
				CHANGELOG_LINES.problem.replace('{file}', entry.file).replace('{problem}', entry.problem),
			),
		),
	}
}

/** `1 fragment`, `2 fragments`. */
function countOf(params: { count: number }): string {
	return `${params.count} fragment${params.count === 1 ? '' : 's'}`
}

/**
 * The lines of the released sections the change altered: against `base` alone when given (two-way: it is the commit
 * the change goes onto), else against the base branch and where the change left it; none without a base branch. An
 * unknown `base` is answered as such, never read as a base without a changelog.
 */
function releasedProblemsOf(params: {
	cwd: string
	base: string | undefined
}): { messages: string[] } | { unknownBase: string } {
	const { cwd, base } = params
	if (base !== undefined) {
		const commit = verifiedCommitOf({ root: cwd, revision: base })
		if (commit === undefined) return { unknownBase: base }
		return messagesOf({
			cwd,
			releaseBase: { commit, name: commit.slice(0, SHORT_SHA_LENGTH) },
			threeWay: false,
		})
	}
	const releaseBase = baseBranchReleaseOf({ root: cwd })
	return releaseBase === undefined
		? { messages: [] }
		: messagesOf({ cwd, releaseBase, threeWay: true })
}

function messagesOf(params: { cwd: string; releaseBase: ReleaseBase; threeWay: boolean }): {
	messages: string[]
} {
	const { releaseBase } = params
	const changes = releasedSectionChanges(
		releasedTextsOf({ root: params.cwd, base: releaseBase, threeWay: params.threeWay }),
	)
	return {
		messages: changes.map((change) => releasedChangeMessage({ change, base: releaseBase.name })),
	}
}
