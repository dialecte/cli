/**
 * Hand-overs for the `lot` guard cases: one in a plain temporary folder, one in a healthy store lot, one in a
 * simulated lot, one in a lot whose identity is damaged, a release; and the summary of a run of one.
 */
import { cpSync, existsSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { runHandover } from '../src/commands/handover.ts'
import { buildHandoverCard } from '../src/lib/handover/handover-card.ts'
import { handoverLockPath } from '../src/lib/handover/handover-lock.ts'
import { readDecisions } from '../src/lib/review-rounds/decisions-file.ts'
import { DECISIONS_FILE } from '../src/lib/review-rounds/review-rounds.constants.ts'
import { replaceRecord } from './damaged-lot-workspace.ts'
import { STORE_NOW, STORE_WRITER_CLI } from './handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	headOf,
	plainHandoverFolder,
	runIn,
	writeLotsFile,
	writeStoreHandover,
} from './handover-store-scenario.ts'
import { startRealLot, startSimulatedLot, writeLotHandover } from './lot-handover-workspace.ts'
import { headOf as hooksHeadOf, hooksRepository, writeGreenRecords } from './mutation-hooks.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { git, temporaryFolder, writeFiles } from './scratch-repository.ts'
import {
	FOLDER_PLACEHOLDER,
	OTHER_LOT_NAME,
	READ_CHANGES,
	RUN_FIRST_LINE_PREFIX,
} from './store-lot-guard-workspace.constants.ts'

import type { HandoverCard } from '../src/lib/handover/handover.types.ts'
import type { LotHandoverWorkspace } from './lot-handover-workspace.types.ts'
import type {
	IdentityDamage,
	PlainHandover,
	RunnableHandover,
	RunSummary,
} from './store-lot-guard-workspace.types.ts'

/** A hand-over written into a new temporary folder (never a lot of the store) of a scratch repository. */
export function plainHandover(): PlainHandover {
	const root = createBranchRepository()
	const { folder } = writeStoreHandover({
		root,
		name: 'plain',
		changes: READ_CHANGES,
		folder: plainHandoverFolder(),
	})
	return { root, folder }
}

/** A release hand-over (`handover write --release`) in a new temporary folder. */
export function releaseHandover(): PlainHandover {
	const root = createBranchRepository()
	writeFiles({ root, files: READ_CHANGES })
	const lotsPath = writeLotsFile({ root, name: 'release' })
	const folder = join(temporaryFolder('dialecte-release-out-'), 'handover')
	const written = runHandover({
		argv: [lotsPath, '--out', folder, '--release'],
		cliPath: STORE_WRITER_CLI,
		probe: noRepositoryCli,
		now: STORE_NOW,
	})
	if (written.exitCode !== 0) throw new Error(`could not write ${folder}: ${written.output}`)
	rmSync(handoverLockPath(root), { force: true })
	return { root, folder }
}

/** A healthy store lot whose folder holds its hand-over: a real `lot start`, the hand-over written into the lot's folder. */
export function storeLotHandover(): LotHandoverWorkspace {
	const lot = startRealLot()
	writeLotHandover(lot)
	return lot
}

/**
 * A simulated lot whose folder holds a hand-over: the cli writes none into a simulated lot, so one written in a
 * temporary folder is copied into it.
 */
export function simulatedLotHandover(): LotHandoverWorkspace {
	const lot = startSimulatedLot()
	const folder = join(temporaryFolder('dialecte-simulated-out-'), 'handover')
	const written = runHandover({
		argv: [lot.lotsPath, '--out', folder],
		cliPath: STORE_WRITER_CLI,
		probe: noRepositoryCli,
		now: STORE_NOW,
	})
	if (written.exitCode !== 0) throw new Error(`could not write ${folder}: ${written.output}`)
	rmSync(handoverLockPath(lot.worktree), { force: true })
	cpSync(folder, lot.lotFolder, { recursive: true })
	return lot
}

/** A store lot holding a hand-over whose identity is then damaged: unreadable, or naming another folder. */
export function damagedLotHandover(damage: IdentityDamage): LotHandoverWorkspace {
	const lot = storeLotHandover()
	const identityText = readFileSync(join(lot.lotFolder, 'identity.json'), 'utf8')
	replaceRecord({
		folder: lot.lotFolder,
		name: 'identity.json',
		text:
			damage === 'unreadable'
				? 'not json'
				: JSON.stringify({ ...JSON.parse(identityText), name: OTHER_LOT_NAME }),
	})
	return lot
}

/** Stages the hand-over's file: the `index` guard, a guard after the `lot` one, then refuses. */
export function stageTheLot(root: string): void {
	git({ root, args: ['add', '--', ...Object.keys(READ_CHANGES)] })
}

/** `handover run <folder> <argv>` from `cwd`, summarised. */
export async function runSummary(params: {
	handover: RunnableHandover
	argv?: string[]
}): Promise<RunSummary> {
	const { handover } = params
	const head = headOf(handover.cwd)
	const run = await runIn({ cwd: handover.cwd, argv: [handover.folder, ...(params.argv ?? [])] })
	const printed = run.lines[0]?.startsWith(RUN_FIRST_LINE_PREFIX)
		? run.lines[0].slice(RUN_FIRST_LINE_PREFIX.length)
		: ''
	const decisions = join(handover.folder, DECISIONS_FILE)
	return {
		exitCode: run.exitCode,
		lot: run.lines
			.filter((line) => /^[✓!✗] lot /.test(line))
			.map((line) => (printed ? line.replaceAll(printed, FOLDER_PLACEHOLDER) : line)),
		failedGuards: run.lines
			.filter((line) => line.startsWith('✗ '))
			.map((line) => line.split(' ')[1] ?? ''),
		rows: readDecisions(decisions),
		hasDecisionsFile: existsSync(decisions),
		committed: headOf(handover.cwd) !== head,
		namesFolder: printed !== '' && realpathSync(printed) === realpathSync(handover.folder),
		usage: run.lines.filter((line) => line.startsWith('handover run: --')),
		forbidden: run.lines.filter((line) => line.includes('holds a forbidden word')),
		rehearsed: run.text.includes('rehearsed:'),
	}
}

/** The card over a repository whose every gate is green on its tree, for the hand-over folder `folder`. */
export function cardOf(params: {
	folder: string
	done?: boolean
	abandoned?: boolean
	release?: boolean
}): HandoverCard {
	const root = hooksRepository({ declared: false })
	writeGreenRecords(root)
	return buildHandoverCard({
		root,
		folder: params.folder,
		branch: 'main',
		head: hooksHeadOf(root),
		notes: undefined,
		lots: [],
		commits: [],
		probe: noRepositoryCli,
		...(params.done && { done: true }),
		...(params.abandoned && { abandoned: true }),
		...(params.release && { release: true }),
	})
}
