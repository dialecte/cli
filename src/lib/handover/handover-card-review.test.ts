import { UNLISTED_EDITOR_WORD } from '../../../test/editor-workspace.constants.ts'
import { createFakeEditors, createGitFolder, searchPathOf } from '../../../test/editor-workspace.ts'
import { editedPackage } from '../../../test/handover-profile.ts'
import {
	STORE_BRANCH,
	STORE_FIRST_NAME,
	STORE_NOW,
	STORE_WRITER_CLI,
} from '../../../test/handover-store-scenario.constants.ts'
import {
	boxLines,
	commitStoreHandover,
	markAbandoned,
	show,
	writeLotsFile,
	writeStoreHandover,
} from '../../../test/handover-store-scenario.ts'
import { noRepositoryCli } from '../../../test/repository-cli-probe.ts'
import { runGateIn } from '../../../test/scratch-checks.ts'
import { git, isolateGitConfig, temporaryFolder } from '../../../test/scratch-repository.ts'
import { EDITOR_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
/**
 * The card's `review` row: every READY card names the command that opens the hand-over in an editor and the
 * editor's word; BLOCKED, DONE and ABANDONED cards have none. The row reads the search path when the card is
 * built (no spawn).
 */
import { runHandover } from '../../commands/handover.ts'
import { renderSectionCard } from '../card/render-section-card.ts'
import { EDITOR_CANDIDATES, EDITOR_CONFIG_KEY } from '../editor/editor.constants.ts'
import { STANDARD_ENVIRONMENT_VARIABLE } from '../standard/standard.constants.ts'
import { handoverCardSections } from './handover-card.ts'
import { HANDOVER_FILES } from './handover.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HandoverCard } from './handover.types.ts'

const REVIEW_SECTION_RULE = '├─ review '

/** What the row says instead of an editor when none is found: the hint the verb refuses with. */
const NO_EDITOR_HINT = `no editor found: set git config ${EDITOR_CONFIG_KEY}`

/** A READY card as `handoverCardSections` renders it, with the `review` row of a hand-over named `named`. */
const READY_CARD: HandoverCard = {
	repository: '/work/core',
	worktree: '/work/core',
	branch: 'main',
	head: '2d1cce9a4b7e0f3c5d6e7f8091a2b3c4d5e6f708',
	verdict: 'READY',
	failedGates: [],
	otherTreeGates: [],
	declarations: 0,
	profile: 'consumer',
	gates: [{ name: 'check', status: 'passed', detail: '12 passed' }],
	lots: [
		{ index: 1, fileCount: 1, insertions: 3, deletions: 1, subject: 'fix: one', pending: true },
	],
	name: 'named',
	command: "cd '/work/handover' && bash commit.sh",
}

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The rows of the card's section `name` (opened by `├─ <name> ─…┤`), up to the next rule, frame and padding left out. */
function sectionRowsOf(params: { output: string; rule: string }): string[] | undefined {
	const box = boxLines(params.output)
	const first = box.findIndex((line) => line.startsWith(params.rule))
	if (first < 0) return undefined
	const rows: string[] = []
	for (const line of box.slice(first + 1)) {
		if (!line.startsWith('│')) break
		rows.push(line.slice('│ '.length).replace(/ *│$/, '').trim())
	}
	return rows
}

/**
 * A package on the store scenario's branch with one edited file and a green gate run on that tree (so the card of
 * its hand-over is READY), `editor` configured in it when given. The host's standard never blocks it.
 */
async function gatedRepository(params: { editor?: string }): Promise<string> {
	isolateGitConfig()
	vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, undefined)
	const root = editedPackage({ profile: null })
	git({ root, args: ['checkout', '-q', '-b', STORE_BRANCH] })
	if (params.editor !== undefined) git({ root, args: ['config', EDITOR_CONFIG_KEY, params.editor] })
	await runGateIn({ cwd: root, argv: [] })
	return root
}

/** A READY hand-over of the edited file's lot, `editor` configured in its repository when given. */
async function pendingHandover(params: {
	editor?: string
}): Promise<{ root: string; folder: string }> {
	const root = await gatedRepository(params)
	const { folder } = writeStoreHandover({ root, name: 'review' })
	return { root, folder }
}

/** The review row the card of a hand-over named STORE_FIRST_NAME holds with `fake-editor` configured, and its json. */
const REVIEW_ROW = `dialecte handover review ${STORE_FIRST_NAME}  (opens fake-editor)`
const REVIEW_JSON = {
	command: `dialecte handover review ${STORE_FIRST_NAME}`,
	editor: 'fake-editor',
}

/** Where the card of the hand-over of `root` stands now: its verdict, its review rows, its json's review. */
function cardStandingOf(params: { root: string }): {
	verdict: unknown
	rows: string[] | undefined
	review: unknown
} {
	const card = jsonCardOf(params.root)
	return {
		verdict: card.verdict,
		rows: sectionRowsOf({
			output: show({ cwd: params.root, argv: [STORE_FIRST_NAME] }).output,
			rule: REVIEW_SECTION_RULE,
		}),
		review: card.review,
	}
}

/** The card of `show --json` in `root`. */
function jsonCardOf(root: string): Record<string, unknown> {
	return JSON.parse(show({ cwd: root, argv: [STORE_FIRST_NAME, '--json'] }).output)
}

describe('the review row of a READY card', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('READY, dialecte.editor "fake-editor --wait" -> a review section whose one row is dialecte handover review <name>, two spaces, (opens fake-editor)', async () => {
		const { root } = await pendingHandover({ editor: 'fake-editor --wait' })

		const output = show({ cwd: root, argv: [STORE_FIRST_NAME] }).output

		expect(sectionRowsOf({ output, rule: REVIEW_SECTION_RULE })).toEqual([REVIEW_ROW])
	})

	it('READY, nothing configured, only the last candidate of the list on PATH -> the row names that candidate', async () => {
		const last = EDITOR_CANDIDATES.at(-1)?.word ?? ''
		const { root } = await pendingHandover({})
		const editors = createFakeEditors({ words: [last] })
		vi.stubEnv('PATH', searchPathOf([createGitFolder(), editors.folder]))

		const output = show({ cwd: root, argv: [STORE_FIRST_NAME] }).output

		expect(sectionRowsOf({ output, rule: REVIEW_SECTION_RULE })).toEqual([
			`dialecte handover review ${STORE_FIRST_NAME}  (opens ${last})`,
		])
	})

	it('READY, nothing configured, none of the list on PATH, $EDITOR and $VISUAL set to another -> the row names the refusal hint the verb prints, never code', async () => {
		const { root } = await pendingHandover({})
		const unrelated = createFakeEditors({ words: [UNLISTED_EDITOR_WORD] })
		vi.stubEnv('PATH', searchPathOf([createGitFolder(), unrelated.folder]))
		vi.stubEnv('EDITOR', UNLISTED_EDITOR_WORD)
		vi.stubEnv('VISUAL', UNLISTED_EDITOR_WORD)

		const output = show({ cwd: root, argv: [STORE_FIRST_NAME] }).output

		// a long row may wrap inside the box: its rows read as one
		const row = (sectionRowsOf({ output, rule: REVIEW_SECTION_RULE }) ?? []).join(' ')
		expect(row).toContain(`dialecte handover review ${STORE_FIRST_NAME}`)
		expect(row).toContain(NO_EDITOR_HINT)
		expect(row).not.toContain('(opens code)')
	})

	it('--json of a READY card -> review { command, editor }: the command that opens it and the editor word', async () => {
		const { root } = await pendingHandover({ editor: 'fake-editor --wait' })

		expect(jsonCardOf(root)).toMatchObject({
			verdict: 'READY',
			review: { command: `dialecte handover review ${STORE_FIRST_NAME}`, editor: 'fake-editor' },
		})
	})

	it('the card handover write prints, READY -> the same review row', async () => {
		const root = await gatedRepository({ editor: 'fake-editor' })

		const { output } = runHandover({
			argv: [writeLotsFile({ root, name: 'review' }), '--out', temporaryFolder('dialecte-out-')],
			cliPath: STORE_WRITER_CLI,
			probe: noRepositoryCli,
			now: STORE_NOW,
		})

		expect(sectionRowsOf({ output, rule: REVIEW_SECTION_RULE })).toEqual([REVIEW_ROW])
	})

	it('a card holding a review row, rendered at 80 columns -> a review section after the gates, one row, the box exactly 80 wide', () => {
		const card: HandoverCard = {
			...READY_CARD,
			review: { command: 'dialecte handover review named', editor: 'code' },
		}

		const output = renderSectionCard({ card: handoverCardSections(card), colour: false, width: 80 })

		const box = boxLines(output)
		expect({
			rows: sectionRowsOf({ output, rule: REVIEW_SECTION_RULE }),
			afterGates:
				box.findIndex((line) => line.startsWith(REVIEW_SECTION_RULE)) >
				box.findIndex((line) => line.startsWith('├─ gates ')),
			widths: [...new Set(box.map((line) => [...line].length))],
		}).toEqual({
			rows: ['dialecte handover review named  (opens code)'],
			afterGates: true,
			widths: [80],
		})
	})

	it('the same card without its review field, rendered -> no review section, where the one with it has one', () => {
		function rendered(card: HandoverCard): string[] | undefined {
			return sectionRowsOf({
				output: renderSectionCard({ card: handoverCardSections(card), colour: false, width: 80 }),
				rule: REVIEW_SECTION_RULE,
			})
		}

		expect({
			without: rendered(READY_CARD),
			with: rendered({
				...READY_CARD,
				review: { command: 'dialecte handover review named', editor: 'code' },
			}),
		}).toEqual({
			without: undefined,
			with: ['dialecte handover review named  (opens code)'],
		})
	})
})

describe('no review row on a card that is not READY', { timeout: EDITOR_CASE_TIMEOUT }, () => {
	it('READY, then BLOCKED (a standard configured and not consulted) -> the review row goes, and review leaves the json', async () => {
		const { root } = await pendingHandover({ editor: 'fake-editor' })
		const ready = cardStandingOf({ root })
		vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, temporaryFolder('dialecte-standard-'))

		expect({ ready, blocked: cardStandingOf({ root }) }).toEqual({
			ready: { verdict: 'READY', rows: [REVIEW_ROW], review: REVIEW_JSON },
			blocked: { verdict: 'BLOCKED', rows: undefined, review: undefined },
		})
	})

	it('READY, then DONE (every lot committed) -> the review row goes, and review leaves the json', async () => {
		const { root, folder } = await pendingHandover({ editor: 'fake-editor' })
		const ready = cardStandingOf({ root })
		await commitStoreHandover({ root, folder })

		expect({ ready, done: cardStandingOf({ root }) }).toEqual({
			ready: { verdict: 'READY', rows: [REVIEW_ROW], review: REVIEW_JSON },
			done: { verdict: 'DONE', rows: undefined, review: undefined },
		})
	})

	it('READY, then ABANDONED -> the review row goes, and review leaves the json', async () => {
		const { root, folder } = await pendingHandover({ editor: 'fake-editor' })
		const ready = cardStandingOf({ root })
		markAbandoned({ folder, file: HANDOVER_FILES.abandoned })

		expect({ ready, abandoned: cardStandingOf({ root }) }).toEqual({
			ready: { verdict: 'READY', rows: [REVIEW_ROW], review: REVIEW_JSON },
			abandoned: { verdict: 'ABANDONED', rows: undefined, review: undefined },
		})
	})
})
