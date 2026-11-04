/** The hand-over card asks its repository-cli probe (a parameter) to choose the run line; the real probe stays in six cases (an installed cli and one lacking `handover run`, a cli that hangs, three through the cli subprocess). */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import {
	CARD_CLI_PATH,
	DEFAULT_PROBE_TIMEOUT_MILLISECONDS,
	IN_PROCESS_REAL_PROBE_CASES,
	PRODUCTION_PROBE_FILES,
	READING_FILES,
	REAL_PROBE_FILES,
	REAL_PROBE_NAME,
	SOURCE_FOLDERS,
} from '../../../test/handover-card-probe.constants.ts'
import { headOf, hooksRepository, writeGreenRecords } from '../../../test/mutation-hooks.ts'
import {
	noRepositoryCli,
	recordingProbe,
	repositoryCli,
} from '../../../test/repository-cli-probe.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { buildHandoverCard } from './handover-card.ts'

import { describe, expect, it } from 'vitest'

import type { HandoverProbe } from './handover.types.ts'

/** The card of a hand-over on `main` holding no lot, built with `probe`. */
function cardWith(params: {
	probe: HandoverProbe
	cliPath?: string | null
	done?: boolean
	probeTimeout?: number
}) {
	const root = hooksRepository({ declared: false })
	writeGreenRecords(root)
	const folder = temporaryFolder('dialecte-card-folder-')
	const card = buildHandoverCard({
		root,
		folder,
		branch: 'main',
		head: headOf(root),
		notes: undefined,
		lots: [],
		commits: [],
		cliPath: params.cliPath === null ? undefined : (params.cliPath ?? CARD_CLI_PATH),
		done: params.done,
		probeTimeout: params.probeTimeout,
		probe: params.probe,
	})
	return { root, folder, card }
}

describe(
	'buildHandoverCard: the repository-cli probe',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a probe answering true → the command is cd <folder> && bash commit.sh', () => {
			const { folder, card } = cardWith({ probe: repositoryCli })

			expect(card.command).toBe(`cd '${folder}' && bash commit.sh`)
		})

		it('a probe answering false → the command is node <cliPath> handover run <folder>', () => {
			const { folder, card } = cardWith({ probe: noRepositoryCli })

			expect(card.command).toBe(`node '${CARD_CLI_PATH}' handover run '${folder}'`)
		})

		it('no probeTimeout → the probe is asked with the repository root and the default 10 000 ms', () => {
			const asked = recordingProbe({ answer: false })

			const { root } = cardWith({ probe: asked.probe })

			expect(asked.calls).toEqual([{ root, timeout: DEFAULT_PROBE_TIMEOUT_MILLISECONDS }])
		})

		it('a probeTimeout → the probe is asked with it', () => {
			const asked = recordingProbe({ answer: false })

			const { root } = cardWith({ probe: asked.probe, probeTimeout: 300 })

			expect(asked.calls).toEqual([{ root, timeout: 300 }])
		})

		it('done → the probe is not asked, and the command is still bash commit.sh', () => {
			const asked = recordingProbe({ answer: false })

			const { folder, card } = cardWith({ probe: asked.probe, done: true })

			expect(asked.calls).toEqual([])
			expect(card.command).toBe(`cd '${folder}' && bash commit.sh`)
		})

		it('no cliPath given → the probe is not asked, the command is bash commit.sh', () => {
			const asked = recordingProbe({ answer: false })

			const { folder, card } = cardWith({ probe: asked.probe, cliPath: null })

			expect(asked.calls).toEqual([])
			expect(card.command).toBe(`cd '${folder}' && bash commit.sh`)
		})

		it('one card build → the probe is asked once', () => {
			const asked = recordingProbe({ answer: true })

			cardWith({ probe: asked.probe })

			expect(asked.calls).toHaveLength(1)
		})
	},
)

/** The `.ts` files under the source folders, relative to the package root, that `keep` accepts. */
function filesOf(params: { root: string; keep: (file: string) => boolean }): string[] {
	const files: string[] = []
	function walk(folder: string): void {
		for (const name of readdirSync(folder)) {
			const path = join(folder, name)
			if (statSync(path).isDirectory()) walk(path)
			else if (name.endsWith('.ts')) files.push(relative(params.root, path))
		}
	}
	for (const source of SOURCE_FOLDERS) walk(join(params.root, source))
	return files.filter(params.keep)
}

function isTestFile(file: string): boolean {
	return file.startsWith('test/') || file.endsWith('.test.ts')
}

function namingTheRealProbe(params: { root: string; keep: (file: string) => boolean }): string[] {
	return filesOf(params)
		.filter((file) => !READING_FILES.includes(file))
		.filter((file) => readFileSync(join(params.root, file), 'utf8').includes(REAL_PROBE_NAME))
		.sort()
}

describe('the real repository-cli probe', () => {
	const root = join(import.meta.dirname, '../../..')

	it('in the tests: only the real-probe cases name probeRepositoryCli, and handover.test.ts passes it exactly three times (installed cli, cli lacking handover run, hanging cli)', () => {
		const naming = namingTheRealProbe({ root, keep: isTestFile })
		const passes =
			readFileSync(join(root, REAL_PROBE_FILES[0]), 'utf8').split(`probe: ${REAL_PROBE_NAME}`)
				.length - 1

		expect(naming).toEqual(REAL_PROBE_FILES)
		expect(passes).toBe(IN_PROCESS_REAL_PROBE_CASES)
	})

	it('in the production code: only its own file and the command that hands it to the card name probeRepositoryCli', () => {
		const naming = namingTheRealProbe({ root, keep: (file) => !isTestFile(file) })

		expect(naming).toEqual(PRODUCTION_PROBE_FILES)
	})
})
