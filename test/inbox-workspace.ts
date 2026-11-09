/** Two scratch workspaces (repositories `scl` and `core`) holding lots of every state, both stores in the store list. */
import { realpathSync } from 'node:fs'

import { runInbox } from '../src/commands/inbox.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import {
	CALLER_QUESTION,
	CORE_LOTS,
	CORE_REPOSITORY,
	COUNT_LINE,
	FAILURE_REASON,
	PERSON_QUESTION,
	SCL_LOTS,
	SCL_REPOSITORY,
} from './inbox-workspace.constants.ts'
import { writeStoreListFile } from './lot-stores.ts'
import { transitionOf } from './store-records.ts'

import type { InboxSeams } from '../src/commands/inbox.types.ts'
import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { QuestionRecord, Transition } from '../src/lib/store/store.types.ts'
import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { InboxLotKind, InboxWorkspaces } from './inbox-workspace.types.ts'

/** The branch of a lot: `feat/` and the name after its index and repository. */
export function lotBranchOf(name: string): string {
	return `feat/${name.split('-').slice(2).join('-')}`
}

/** The transition that asks `question`. */
export function questionTransitionFor(params: {
	seq: number
	question: QuestionRecord
}): Transition {
	return transitionOf({ seq: params.seq, kind: 'question', question: params.question })
}

/** The transition that fails a lot with `reason`. */
export function failedTransitionFor(params: { seq: number; reason: string }): Transition {
	const failed = transitionOf({ seq: params.seq, state: 'failed', kind: 'fail' })
	return { ...failed, cause: { kind: 'fail', by: 'engine', reason: params.reason } }
}

/** The lot `name` of `workspace` in the state `kind` names; its real folder. */
export function writeInboxLot(params: {
	workspace: BriefWorkspace
	name: string
	kind: InboxLotKind
}): string {
	const { workspace, name, kind } = params
	const base = {
		workspace,
		name,
		scope: ['src/'],
		branch: lotBranchOf(name),
		repository: workspace.repository,
	}
	const written = writeLotOfKind({ base, kind })
	return realpathSync(written)
}

/** The lots of both workspaces written, the two stores listed; `XDG_STATE_HOME` points into the test's folder. */
export function createInboxWorkspaces(): InboxWorkspaces {
	const scl = createBriefWorkspace({ repositoryFolder: SCL_REPOSITORY })
	const core = createBriefWorkspace({ repositoryFolder: CORE_REPOSITORY })
	const folders: Record<string, string> = {}
	for (const [kind, name] of Object.entries(SCL_LOTS))
		folders[name] = writeInboxLot({ workspace: scl, name, kind: kind as InboxLotKind })
	for (const [kind, name] of Object.entries(CORE_LOTS))
		folders[name] = writeInboxLot({ workspace: core, name, kind: kind as InboxLotKind })
	writeStoreListFile({ stores: [storePathOf(scl), storePathOf(core)] })
	return { scl, core, folders }
}

/** The real path of the workspace's store (the folder exists once a lot is written). */
export function storePathOf(workspace: BriefWorkspace): string {
	return realpathSync(workspace.store)
}

/** `inbox <words>` from `cwd`. */
export function inboxIn(params: {
	cwd: string
	words?: string[]
	seams?: InboxSeams
}): CommandResult {
	return runInbox({ cwd: params.cwd, argv: params.words ?? [], seams: params.seams })
}

/** The pattern of an inbox line made of `parts`: each exactly as given, the columns between them any spacing. */
export function inboxLine(parts: readonly string[]): RegExp {
	const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
	return new RegExp(`^${escaped.join('\\s+')}$`)
}

/** The count line with `working` and `simulated` filled in. */
export function countLineOf(params: { working: number; simulated: number }): string {
	return COUNT_LINE.replace('{working}', String(params.working)).replace(
		'{simulated}',
		String(params.simulated),
	)
}

/** The first four characters of each line that opens with an index: the order the lots are listed in. */
export function listedIndexesOf(output: string): string[] {
	return output.split('\n').flatMap((line) => {
		const index = /^(\d{4})\s/.exec(line)?.[1]
		return index === undefined ? [] : [index]
	})
}

/** The lot of the kind, written into the workspace's store. */
function writeLotOfKind(params: {
	base: {
		workspace: BriefWorkspace
		name: string
		scope: string[]
		branch: string
		repository: string
	}
	kind: InboxLotKind
}): string {
	const { base, kind } = params
	if (kind === 'person')
		return writeStoreLot({
			...base,
			later: [questionTransitionFor({ seq: 2, question: PERSON_QUESTION })],
		})
	if (kind === 'caller')
		return writeStoreLot({
			...base,
			later: [questionTransitionFor({ seq: 2, question: CALLER_QUESTION })],
		})
	if (kind === 'simulatedQuestion')
		return writeStoreLot({
			...base,
			simulated: true,
			later: [questionTransitionFor({ seq: 2, question: CALLER_QUESTION })],
		})
	if (kind === 'simulatedWorking') return writeStoreLot({ ...base, simulated: true })
	if (kind === 'ready' || kind === 'readyWithoutEntry')
		return writeStoreLot({
			...base,
			later: [transitionOf({ seq: 2, state: 'ready', kind: 'ready' })],
			registry: kind === 'ready' ? 'pending' : undefined,
		})
	if (kind === 'failed')
		return writeStoreLot({
			...base,
			later: [failedTransitionFor({ seq: 2, reason: FAILURE_REASON })],
		})
	if (kind === 'committed') return writeStoreLot({ ...base, registry: 'committed' })
	if (kind === 'canceled')
		return writeStoreLot({
			...base,
			later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })],
		})
	return writeStoreLot(base)
}
