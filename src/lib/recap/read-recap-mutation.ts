/** The mutation runs of a hand-over's lot and what they did, read from the mutation store (never written). */
import { mergedBranchesOf } from '../handover/lot-trees.ts'
import { readMutationDeclaration } from '../mutation/declaration.ts'
import { itemsOf, readLedger } from '../mutation/ledger.ts'
import { packageNameOf, readRuns } from '../mutation/run-store.ts'
import { readPackageJson } from '../package-json.ts'

import type { HandoverFolder } from '../handover/handover.types.ts'
import type { RecapMutation } from './recap.types.ts'

/**
 * The runs of the hand-over's branch and of the branches its merge lots merge, oldest first; the survivors those
 * runs killed or recorded; the survivors first seen on those branches and scheduled. `undeclared` when the package
 * declares no mutation scope; nothing listed when the repository is gone.
 */
export function readRecapMutation(params: {
	handover: HandoverFolder
	repositoryExists: boolean
}): RecapMutation {
	const { lotsFile, lots } = params.handover
	const root = lotsFile.repository
	const nothing: RecapMutation = { kind: 'declared', runs: [], moved: [], scheduled: [] }
	if (!params.repositoryExists) return nothing
	if (readMutationDeclaration({ packageJson: readPackageJson(root) }).kind === 'none')
		return { kind: 'undeclared' }
	const branches = new Set([lotsFile.branch, ...mergedBranchesOf(lots)])
	const packageName = packageNameOf(root)
	const runs = readRuns({ root }).filter(
		(run) => run.package === packageName && branches.has(run.branch),
	)
	const runIds = new Set(runs.map((run) => run.runId))
	const items = itemsOf({ ledger: readLedger({ root }), packageName })
	return {
		kind: 'declared',
		runs,
		moved: items.filter((item) => item.movedBy !== undefined && runIds.has(item.movedBy)),
		scheduled: items.filter(
			(item) => item.state === 'scheduled' && branches.has(item.firstSeen.lot),
		),
	}
}
