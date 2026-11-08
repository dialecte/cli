/**
 * The records a recap is built from, read and never written: the lots and their commits, the gate and rules
 * records of the repository, the lot's mutation runs, the findings ledger, the lot declaration and
 * `decisions.md` of the hand-over folder (then a lot folder's answers), the git user name.
 */
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import {
	buildCardGateLines,
	buildMutationLines,
	buildRulesLine,
} from '../gate-records/card-gates.ts'
import { readGateRecords, readJudgedCases, readRulesRecord } from '../gate-records/gate-records.ts'
import { computeStateTree, hashStateTree } from '../gate-records/state-hash.ts'
import { mainCheckoutOf, readGitConfig } from '../git.ts'
import { findCommittedLots } from '../handover/find-committed-lots.ts'
import { revisionOf } from '../handover/list-handovers.ts'
import { checkedTree, mergedBranchesOf } from '../handover/lot-trees.ts'
import { readDecisions } from '../review-rounds/decisions-file.ts'
import { DECISIONS_FILE, LEDGER_FILE } from '../review-rounds/review-rounds.constants.ts'
import { readDeclaredCases } from '../tdd/lot-declaration.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { LOT_FILE } from '../worktree/worktree.constants.ts'
import { readLotAnswerDecisions } from './lot-answer-decisions.ts'
import { readFindings } from './read-findings.ts'
import { readRecapMutation } from './read-recap-mutation.ts'
import { FOLDER_LOT_FILE, NO_USER_NAME } from './recap.constants.ts'

import type { CardGateLine } from '../gate-records/gate-records.types.ts'
import type { HandoverFolder } from '../handover/handover.types.ts'
import type { LotCaseEntry, LotCaseList } from '../tdd/tdd.types.ts'
import type { RecapCommits, RecapPathBases, RecapRecords } from './recap.types.ts'

/** The records of the hand-over, or why the recap cannot be made. */
export function readRecapRecords(params: {
	handover: HandoverFolder
	/** Where the command runs: the user name when the repository is gone. */
	cwd: string
}): RecapRecords | string {
	const { handover } = params
	const { folder, lotsFile } = handover
	const root = lotsFile.repository
	const repositoryExists = existsSync(root)
	const user = readGitConfig({ root: repositoryExists ? root : params.cwd, key: 'user.name' })
	if (!user)
		return NO_USER_NAME.replace(
			'{where}',
			repositoryExists ? 'the repository' : 'the current folder',
		)
	const declarationPath = existsSync(join(folder, FOLDER_LOT_FILE))
		? join(folder, FOLDER_LOT_FILE)
		: join(root, LOT_FILE)
	const accepted = readCases({ path: declarationPath, list: 'accept' })
	if (typeof accepted === 'string') return accepted
	const revised = readCases({ path: declarationPath, list: 'revised' })
	if (typeof revised === 'string') return revised
	const findings = readFindings({
		path: join(folder, LEDGER_FILE),
		bases: pathBasesOf({ root, repositoryExists }),
	})
	if (typeof findings === 'string') return findings
	const stateTree = repositoryExists ? computeStateTree(root) : undefined
	const stateHash = stateTree && hashStateTree(stateTree)
	const committed = readCommits({ handover, repositoryExists })
	return {
		...committed,
		judgedCases: stateHash ? readJudgedCases({ root, stateHash }) : undefined,
		checks:
			stateTree && stateHash
				? readChecks({
						root,
						folder,
						stateHash,
						// as the card: the tree the lots not committed yet leave, a merge's trial tree included
						tree: checkedTree({
							root,
							stateTree,
							lots: handover.lots.slice(committed.commits.filter((lot) => lot.commit).length),
						}),
						branch: lotsFile.branch,
						mergedBranches: mergedBranchesOf(handover.lots),
					})
				: [],
		mutation: readRecapMutation({ handover, repositoryExists }),
		findings,
		accepted,
		revised,
		// a lot's answers after the file's own rows: never copied into decisions.md
		decisions: [
			...readDecisions(join(folder, DECISIONS_FILE)),
			...readLotAnswerDecisions({ folder }),
		],
		user,
	}
}

/**
 * Each lot's subject, with its commit when found on the branch on top of the recorded HEAD; none when the
 * branch no longer holds the lots on top of it (rebased, reset, another commit in a lot's place).
 */
function readCommits(params: {
	handover: HandoverFolder
	repositoryExists: boolean
}): RecapCommits {
	const { lotsFile, lots } = params.handover
	const root = lotsFile.repository
	const head = params.repositoryExists
		? revisionOf({ root, revision: `${lotsFile.head}^{commit}` })
		: undefined
	const tip = head ? revisionOf({ root, revision: `refs/heads/${lotsFile.branch}` }) : undefined
	const found = head && tip ? findCommittedLots({ root, head, tip, lots }) : undefined
	const branchRewritten = found?.foreign !== undefined
	const commits = branchRewritten ? [] : (found?.commits ?? [])
	return {
		commits: lots.map(function commitOf(lot, index) {
			const subject = lot.message.trim().split('\n')[0]
			return commits[index] ? { subject, commit: commits[index] } : { subject }
		}),
		branchRewritten,
	}
}

/**
 * The folders a ledger's absolute paths may point in: the repository, then the parent folder of its main
 * checkout; when the repository is gone, the parent of the `.worktrees` folder it stood in, else the parent
 * folder of the recorded repository. Each as written and real.
 */
function pathBasesOf(params: { root: string; repositoryExists: boolean }): RecapPathBases {
	const { root, repositoryExists } = params
	const parent = dirname(repositoryExists ? mainCheckoutOf(root) : root)
	const workspace =
		!repositoryExists && basename(parent) === WORKTREES_FOLDER ? dirname(parent) : parent
	return {
		repository: spellingsOf(root),
		workspace: spellingsOf(workspace),
	}
}

/** A folder as written and as its real path, when it exists and differs. */
function spellingsOf(folder: string): string[] {
	const real = existsSync(folder) ? realpathSync(folder) : folder
	return real === folder ? [folder] : [folder, real]
}

/** The gate, rules and mutation lines of the repository (the review is the recap's own); none when nothing was recorded. */
function readChecks(params: {
	root: string
	folder: string
	stateHash: string
	tree: string
	branch: string
	mergedBranches: readonly string[]
}): CardGateLine[] {
	if (readGateRecords(params.root).length === 0 && !readRulesRecord(params.root)) return []
	return [...buildCardGateLines(params), buildRulesLine(params), ...buildMutationLines(params)]
}

/** One list of the lot declaration, or why it cannot be read. */
function readCases(params: { path: string; list: LotCaseList }): LotCaseEntry[] | string {
	const entries = readDeclaredCases(params)
	return 'failure' in entries ? entries.failure : entries
}
