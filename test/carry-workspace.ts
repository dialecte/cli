/** Source lots for the carry cases: a lot of the start workspace's store with a worktree whose git folder holds a tdd ledger. */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { gitFolderOf } from '../src/lib/git.ts'
import { holdWorkOf, writeStoreLot } from './brief-workspace.ts'
import {
	CARRY_CASES,
	CARRY_PRODUCTION_CONTENT_HASH,
	CARRY_PRODUCTION_FILE,
	CARRY_PRODUCTION_HASH,
	CARRY_SOURCE_BRANCH,
	CARRY_SOURCE_NAME,
	CARRY_TEST_FILE,
	DECLARATION_PATH,
	LEDGER_FILE_NAME,
} from './carry-workspace.constants.ts'
import { git } from './scratch-repository.ts'
import { RECORD_TIME } from './store-records.constants.ts'

import type { StoreEntry } from '../src/lib/handover/handover.types.ts'
import type { Transition } from '../src/lib/store/store.types.ts'
import type { CarryLedger, CarrySourceLot } from './carry-workspace.types.ts'
import type { StartWorkspace } from './lot-start-workspace.types.ts'

function receiptOf(params: { name: string; kind: string; caseHash?: string }) {
	const { name, kind } = params
	return {
		file: CARRY_TEST_FILE,
		name,
		project: '',
		kind,
		testFileHash: 'c'.repeat(64),
		caseHash: params.caseHash ?? 'd'.repeat(64),
		productionHash: CARRY_PRODUCTION_HASH,
		...(kind === 'red' && { message: 'expected 1 to be 2' }),
		at: RECORD_TIME,
	}
}

/** The text of a ledger of this cli: two cases with a red each, a freeze and a green, its production state kept under each base. */
export function carryLedgerText(params: {
	bases: string[]
	version?: number
	production?: boolean
}): string {
	const states = Object.fromEntries(
		params.bases.map((base) => [
			base,
			{
				[CARRY_PRODUCTION_HASH]: {
					[CARRY_PRODUCTION_FILE]: CARRY_PRODUCTION_CONTENT_HASH,
				},
			},
		]),
	)
	return `${JSON.stringify(
		{
			version: params.version ?? 3,
			entries: [
				...CARRY_CASES.map((name, position) =>
					receiptOf({ name, kind: 'red', caseHash: String(position + 1).repeat(64) }),
				),
				// a second red of the first case (a re-red) and a refused receipt: three red receipts for two cases
				receiptOf({ name: CARRY_CASES[0] ?? '', kind: 'red', caseHash: '1'.repeat(64) }),
				receiptOf({ name: CARRY_CASES[1] ?? '', kind: 'refused', caseHash: '2'.repeat(64) }),
				{
					kind: 'freeze',
					files: { [CARRY_TEST_FILE]: 'c'.repeat(64) },
					at: RECORD_TIME,
				},
				receiptOf({ name: CARRY_CASES[0] ?? '', kind: 'green', caseHash: '1'.repeat(64) }),
			],
			...(params.production !== false && { production: states }),
		},
		null,
		'\t',
	)}\n`
}

/** The text of the ledger the cases name, for the real base `base`. */
function ledgerTextOf(params: { ledger: CarryLedger; base: string }): string | undefined {
	const { ledger, base } = params
	if (ledger === 'none') return undefined
	if (ledger === 'default') return carryLedgerText({ bases: [base] })
	if ('text' in ledger) return ledger.text
	if ('version' in ledger) return carryLedgerText({ bases: [base], version: ledger.version })
	if ('production' in ledger) return carryLedgerText({ bases: [base], production: false })
	return carryLedgerText({ bases: ledger.bases })
}

/**
 * A lot of the workspace's store whose worktree is a real linked worktree of its repository, holding `ledger` in its
 * git folder and, when given, `declaration` as `.dialecte/lot.json`. Canceled unless `later` or `registry` say another
 * state; its scope is the default brief's, so a start of that brief meets it.
 */
export function writeCarrySource(params: {
	start: StartWorkspace
	name?: string
	later?: Transition[]
	registry?: StoreEntry['state']
	simulated?: boolean
	ledger?: CarryLedger
	declaration?: string
	/** No worktree is made: the identity names a folder that does not exist. */
	noWorktree?: boolean
	/**
	 * The lot holds its scope for real: its worktree holds a `.git` file naming no git folder, so its work cannot be
	 * read and an overlap with it holds (fails closed). No ledger, no real worktree.
	 */
	heldWork?: boolean
	/** The repository the identity names; the workspace's when left out. */
	repository?: string
	scope?: string[]
}): CarrySourceLot {
	const { start } = params
	const name = params.name ?? CARRY_SOURCE_NAME
	const base = start.workspace.commit
	const worktree = join(start.worktreesFolder, name)
	if (!params.noWorktree && !params.simulated && !params.heldWork) {
		mkdirSync(start.worktreesFolder, { recursive: true })
		git({
			root: start.repository,
			args: ['worktree', 'add', '-q', '-b', CARRY_SOURCE_BRANCH, worktree, base],
		})
	}
	const lotFolder = writeStoreLot({
		workspace: start.workspace,
		name,
		scope: params.scope ?? ['src/dataflow/', 'src/dataflow/**/*.test.ts'],
		branch: CARRY_SOURCE_BRANCH,
		repository: params.repository ?? start.repository,
		worktree,
		simulated: params.simulated,
		later: params.later,
		registry: params.registry,
	})
	if (params.heldWork) holdWorkOf({ workspace: start.workspace, name, worktree })
	const made = !params.noWorktree && !params.simulated && !params.heldWork
	const realWorktree = made ? realpathSync(worktree) : worktree
	const ledgerText = ledgerTextOf({ ledger: params.ledger ?? 'default', base })
	const ledgerFile = made ? join(gitFolderOf(realWorktree), LEDGER_FILE_NAME) : undefined
	if (made && ledgerText !== undefined && ledgerFile !== undefined)
		writeFileSync(ledgerFile, ledgerText)
	if (made && params.declaration !== undefined) {
		const declarationFile = join(realWorktree, DECLARATION_PATH)
		mkdirSync(dirname(declarationFile), { recursive: true })
		writeFileSync(declarationFile, params.declaration)
	}
	return {
		start,
		name,
		lotFolder: realpathSync(lotFolder),
		worktree: realWorktree,
		ledgerFile,
		base,
	}
}
