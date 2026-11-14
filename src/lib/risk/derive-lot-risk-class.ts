/**
 * The risk class of a lot derived now from its work tree (D5): the identity's worktree against its `base.commit` for a
 * store lot, else the work tree of `cwd` against `HEAD`. The declared list is the union of the base's and the root's
 * `package.json` `dialecte.risk.high` (33L1 D30): a diff that drops a glob still counts it.
 */
import { mkdirSync } from 'node:fs'

import { compareApiIndexes } from '../api/api-index-diff.ts'
import { isFolder } from '../file-system.ts'
import { tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readPackageJson } from '../package-json.ts'
import { workTreeTopOf } from '../review-rounds/worktree-state.ts'
import { readIdentity } from '../store/identity.ts'
import { deriveRiskClass } from './derive-risk-class.ts'
import { readRiskDiff } from './read-risk-diff.ts'
import { appendRiskLine } from './risk-records.ts'
import {
	RISK_HEAD_BASE,
	RISK_NOT_DERIVED_LINE,
	RISK_PACKAGE_FILE,
	RISK_SCHEMA,
} from './risk.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { LotRiskRecord, RiskDerivation, RiskDerivedLine } from './risk.types.ts'

/**
 * The class of the lot of `folder` derived now with its reasons; undefined when there is no work tree to read (the
 * identity's worktree gone, or `cwd` in no work tree): never a guess.
 */
export function deriveLotRiskClass(params: {
	folder: string
	cwd: string
}): RiskDerivation | undefined {
	const source = derivationSourceOf(params)
	if (source === undefined) return undefined
	const { root, base } = source
	return deriveRiskClass({
		declaredHigh: readDeclaredHighOfDiff({ root, base }),
		files: readRiskDiff({ root, base }),
		apiChange: compareApiIndexes({ root, base }),
	})
}

/**
 * The class of the lot of `folder` derived now, appended to `<folder>/risk.jsonl` as a `derived` line made `from` the
 * command that derived it, at `now` (33L1 D7, D10); nothing appended when there is no work tree to read, nor when the
 * derivation cannot run, which gives its warning line instead (D26).
 */
export function appendLotRiskClass(params: {
	folder: string
	cwd: string
	now: Date
	from: RiskDerivedLine['from']
}): LotRiskRecord {
	const derived = tryDeriveLotRiskClass({ folder: params.folder, cwd: params.cwd })
	const { derivation } = derived
	if (derivation === undefined) return derived
	appendDerivedRiskLine({ folder: params.folder, derivation, now: params.now, from: params.from })
	return { derivation }
}

/**
 * Appends a derivation made earlier to `<folder>/risk.jsonl` as a `derived` line made `from` the command that derived
 * it, at `now` (the snapshot derives first and appends only when it goes ahead, 33L1 D30).
 */
export function appendDerivedRiskLine(params: {
	folder: string
	derivation: RiskDerivation
	now: Date
	from: RiskDerivedLine['from']
}): void {
	mkdirSync(params.folder, { recursive: true })
	appendRiskLine({
		folder: params.folder,
		line: {
			schema: RISK_SCHEMA,
			kind: 'derived',
			at: params.now.toISOString(),
			class: params.derivation.class,
			reasons: params.derivation.reasons,
			from: params.from,
		},
	})
}

/**
 * The class of the lot of `folder` derived now, never a throw: the derivation, nothing when there is no work tree to
 * read, or the warning line of a derivation that could not run (a base git cannot read, a git that fails; D26, D29).
 */
export function tryDeriveLotRiskClass(params: { folder: string; cwd: string }): LotRiskRecord {
	try {
		const derivation = deriveLotRiskClass(params)
		return derivation === undefined ? {} : { derivation }
	} catch (error) {
		return { warning: notDerivedLineOf({ error }) }
	}
}

/** The warning line of a derivation that could not run: its error's first line as the reason. */
function notDerivedLineOf(params: { error: unknown }): string {
	const message = params.error instanceof Error ? params.error.message : String(params.error)
	return fillMessage({
		template: RISK_NOT_DERIVED_LINE,
		values: { reason: message.split('\n')[0] ?? '' },
	})
}

/** The globs `root`'s `package.json` declares high (`dialecte.risk.high`); none when it declares none. */
export function readDeclaredHigh(params: { root: string }): string[] {
	return declaredHighOf({ manifest: readPackageJson(params.root) })
}

/**
 * The globs declared high by `base`'s `package.json` (none when the base holds none) then those `root`'s adds, each
 * once: a change cannot lower its own class by editing the list.
 */
function readDeclaredHighOfDiff(params: { root: string; base: string }): string[] {
	const baseText = tryReadGit({
		root: params.root,
		args: ['show', `${params.base}:./${RISK_PACKAGE_FILE}`],
	})
	const baseDeclared =
		baseText === undefined ? [] : declaredHighOf({ manifest: JSON.parse(baseText) as PackageJson })
	return [...new Set([...baseDeclared, ...readDeclaredHigh({ root: params.root })])]
}

/** The globs a manifest declares high (`dialecte.risk.high`), its strings only. */
function declaredHighOf(params: { manifest: PackageJson }): string[] {
	const declaredHigh = params.manifest.dialecte?.risk?.high ?? []
	return Array.isArray(declaredHigh) ? declaredHigh.filter(isText) : []
}

/** The root and base a derivation reads: the identity's worktree and base commit, else the cwd's work tree and HEAD. */
function derivationSourceOf(params: {
	folder: string
	cwd: string
}): { root: string; base: string } | undefined {
	const identity = readIdentity({ lotFolder: params.folder })
	if (identity !== undefined) {
		const { worktree } = identity
		if (worktree === null || !isFolder(worktree)) return undefined
		const root = workTreeTopOf(worktree)
		return root === undefined ? undefined : { root, base: identity.base.commit }
	}
	const root = workTreeTopOf(params.cwd)
	return root === undefined ? undefined : { root, base: RISK_HEAD_BASE }
}

/** Whether a declared entry is a string (a manifest edited by hand may hold anything). */
function isText(value: unknown): value is string {
	return typeof value === 'string'
}
