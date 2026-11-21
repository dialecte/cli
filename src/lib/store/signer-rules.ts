/**
 * The rules every signed store verb shares (KEEP 3.3, SAFE 3.5): the orchestrator recorded as one word; one predicate
 * for a lot's workplace (its worktree or one of its review throwaways), from which a lot's own session may neither run
 * the verbs on what a person decided nor sign as the orchestrator; and the cli's own lots as the only ones the
 * orchestrator approves.
 */
import { basename, dirname, join } from 'node:path'

import { commandSurfaceOf } from '../command-map/command-surface.ts'
import { listedEntryOf } from '../command-map/render-help.ts'
import { END_OF_OPTIONS } from '../command-map/verb-options.constants.ts'
import { verbOptionsOf } from '../command-map/verb-options.ts'
import { realPathOf, realPathThroughAncestors } from '../file-system.ts'
import { OPTION_PREFIX } from '../handover/store-lot-guard.constants.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { THROWAWAY_WORKTREE_PATTERN } from '../plan/plan.constants.ts'
import { CLI_PACKAGE } from '../skills/cli-invocations.constants.ts'
import { lotOfWorktree } from './resolve-lot.ts'
import {
	APPROVAL_SIGNER_REFUSAL,
	LOT_SESSION_SIGNER,
	ORCHESTRATOR_SIGNER,
	OWN_WORKTREE_REFUSAL,
	WORKPLACE_SIGNER_REFUSAL,
} from './signer-rules.constants.ts'
import { listLotIdentities, locateStore, workTreeHolding } from './store-folder.ts'
import { BY_OPTION } from './store.constants.ts'

/** The orchestrator in any casing and spacing is recorded as the one word every view names. */
export function recordedByOf(params: { by: string }): string {
	const { by } = params
	return isOrchestratorSigner(by) ? ORCHESTRATOR_SIGNER : by
}

/**
 * The refusal of `command` run from the lot's own worktree, or from a review throwaway beside it (`-round-<n>` or
 * `-verify`, the rule `worktree prune` maps throwaways by); undefined elsewhere.
 */
export function ownWorktreeRefusal(params: {
	lotFolder: string
	cwd: string
	/** The verb's own words the refusal starts with (`lot design: approve`, `lot unkeep`). */
	command: string
}): string | undefined {
	const workplace = lotWorkplaceOf({ cwd: params.cwd })
	if (workplace === undefined || workplace !== realPathOf(params.lotFolder)) return undefined
	return fillMessage({ template: OWN_WORKTREE_REFUSAL, values: { command: params.command } })
}

/** Whether `by` signs as the orchestrator: trimmed and case-folded, it is `orchestrator`. */
export function isOrchestratorSigner(by: string): boolean {
	return by.trim().toLowerCase() === ORCHESTRATOR_SIGNER
}

/**
 * The real path of the lot whose workplace `cwd` is: its own worktree, or a `-round-<n>` or `-verify` throwaway beside
 * it; undefined elsewhere (the main checkout, a clone, a folder of no repository).
 */
export function lotWorkplaceOf(params: { cwd: string }): string | undefined {
	const { cwd } = params
	// the lot's own worktree, its link, or a `-round-<n>` throwaway of its index
	const own = lotOfWorktree({ cwd })
	if (own !== undefined) return realPathOf(own)
	const workTree = workTreeHolding({ from: cwd })
	if (workTree === undefined) return undefined
	const here = realPathOf(workTree)
	const lotName = THROWAWAY_WORKTREE_PATTERN.exec(basename(here))?.[1]
	const store = locateStore({ from: workTree })?.store
	if (lotName === undefined || store === undefined) return undefined
	// a `-verify` throwaway: the lot whose worktree is its sibling, the suffix stripped
	const sibling = join(dirname(here), lotName)
	const holder = listLotIdentities({ store }).find(function isBeside(entry) {
		const { worktree } = entry.identity
		// the lot's worktree may be gone: its path resolved through its nearest present ancestor, as git's
		return typeof worktree === 'string' && realPathThroughAncestors(worktree) === sibling
	})
	return holder === undefined ? undefined : realPathOf(join(store, holder.name))
}

/**
 * The refusal of `--by orchestrator` (any candidate of the line, in any casing and spacing) from a lot's workplace, for
 * any verb that signs: `command` the cli command, `argv` the words after it; undefined otherwise. Pure argv work
 * first: the workplace is read only when a candidate is the orchestrator.
 */
export function workplaceSignerRefusal(params: {
	command: string
	argv: readonly string[]
	cwd: string
}): string | undefined {
	const candidates = signerCandidatesOf(params)
	if (!candidates.some(isOrchestratorSigner)) return undefined
	const lotFolder = lotWorkplaceOf({ cwd: params.cwd })
	if (lotFolder === undefined) return undefined
	return fillMessage({
		template: WORKPLACE_SIGNER_REFUSAL,
		values: { lot: basename(lotFolder), signer: LOT_SESSION_SIGNER },
	})
}

/** The refusal of `--by orchestrator` on a lot approval of a package other than the cli; undefined otherwise. */
export function approvalSignerRefusal(params: {
	by: string
	packageName: string
}): string | undefined {
	if (!isOrchestratorSigner(params.by) || params.packageName === CLI_PACKAGE) return undefined
	return fillMessage({ template: APPROVAL_SIGNER_REFUSAL, values: { package: params.packageName } })
}

/**
 * Every signer a command line may be read as signing with (fail closed: the verbs read the first `--by`, the last, or
 * their own way): the word after every `--by` and the value of every `--by=<v>`, up to `--`, in one left-to-right walk
 * where a value option of the verb consumes the word after it. None when the command or its verb takes no `--by`.
 */
function signerCandidatesOf(params: { command: string; argv: readonly string[] }): string[] {
	const options = signingOptionsOf(params)
	if (options === undefined) return []
	const candidates: string[] = []
	const { words } = options
	const signer = BY_OPTION
	for (let index = 0; index < words.length; index++) {
		const word = words[index]
		if (word === END_OF_OPTIONS) break
		if (word.startsWith(`${signer}=`)) candidates.push(word.slice(signer.length + 1))
		else if (word === signer) {
			// the word after is a candidate, and is walked too: a `--by` there is a candidate of its own
			if (index + 1 < words.length) candidates.push(words[index + 1])
		} else if (
			word.startsWith(OPTION_PREFIX) &&
			options.valueOptions.includes(word.slice(OPTION_PREFIX.length))
		)
			index++
	}
	return candidates
}

/**
 * The words after a signing verb and the verb's value options (`verbOptionsOf`); undefined for a command the map does
 * not list or a verb whose usage takes no `--by`.
 */
function signingOptionsOf(params: {
	command: string
	argv: readonly string[]
}): { words: readonly string[]; valueOptions: readonly string[] } | undefined {
	const { command, argv } = params
	const entry = listedEntryOf(command)
	if (entry === undefined) return undefined
	const verb = commandSurfaceOf({ name: command, entry }).verbs.includes(argv[0] ?? '')
		? argv[0]
		: undefined
	const options = verbOptionsOf({ name: command, usage: entry.usage, accepted: [verb] })
	if (![...options.valueOptions, ...options.flags].includes(BY_OPTION.slice(OPTION_PREFIX.length)))
		return undefined
	return { words: verb === undefined ? argv : argv.slice(1), valueOptions: options.valueOptions }
}
