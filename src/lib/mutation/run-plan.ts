/** What a `mutants run` mutates, decided before Stryker starts: the declaration, the lot, the mode and the targets. */
import { join } from 'node:path'

import { currentBranchOf, listRepositoryFiles } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { readProfile } from '../profile/profile.ts'
import { readMutationDeclaration } from './declaration.ts'
import { effectiveMode, readMutationMode } from './lot-mode.ts'
import {
	MUTATION_CONSUMER_OPT_IN,
	MUTATION_OFF,
	NOTHING_TO_MUTATE,
	SHORT_TREE_LENGTH,
} from './mutation.constants.ts'
import { baseOf, changedTargets } from './run-base.ts'
import { isMutable } from './scope.ts'

import type { PackageJson } from '../package-json.types.ts'
import type {
	ChangedTargets,
	MutationDeclaration,
	MutationMode,
	RunDeclaration,
	RunPlanResult,
	RunStop,
	ValidModeSetting,
} from './mutation.types.ts'

/**
 * The run the package at `root` asks for with `--mode` (`askedMode`, already one of the run modes) and `--base`, or
 * why it stops first: no declaration, an invalid lot switch, a detached HEAD, no base, a mode that is off, no target.
 * Throws when `--base` or the base branch names no commit.
 */
export function planRun(params: {
	root: string
	askedMode: string | undefined
	askedBase: string | undefined
}): RunPlanResult {
	const { root, askedMode } = params
	const packageJson = readPackageJson(root)
	const declared = declarationOf({ root, packageJson })
	if ('stop' in declared) return declared
	const setting = readMutationMode({ root })
	if (askedMode === undefined && setting.kind === 'invalid')
		return stopOf({ exitCode: 2, line: setting.reason })

	const lot = currentBranchOf(root)
	if (lot === 'HEAD')
		return stopOf({
			exitCode: 1,
			line: `HEAD is detached: check out the lot's branch first (git switch <branch>); a run is filed under its branch`,
		})

	const auditOnly = askedMode === 'audit' || (askedMode === undefined && setting.kind === 'audit')
	const base = auditOnly ? undefined : baseOf({ root, asked: params.askedBase, packageJson })
	if (typeof base === 'object') return stopOf({ exitCode: 2, line: base.refused })
	const changed =
		base === undefined
			? undefined
			: changedTargets({ root, declaration: declared.declaration, base })
	const mode = runModeOf({
		asked: askedMode,
		setting: setting.kind === 'invalid' ? { kind: 'default' } : setting,
		touchesScope: (changed?.targets.length ?? 0) > 0,
	})
	return targetsOf({ root, declaration: declared.declaration, lot, mode, changed })
}

/** The package's mutation declaration, or why a run cannot start without one. */
function declarationOf(params: { root: string; packageJson: PackageJson }): RunDeclaration {
	const { root, packageJson } = params
	const declared = readMutationDeclaration({ packageJson })
	if (declared.kind === 'none' && readProfile(root) === 'consumer')
		return stopOf({ exitCode: 1, line: MUTATION_CONSUMER_OPT_IN })
	if (declared.kind === 'none')
		return stopOf({
			exitCode: 1,
			line: `${join(root, 'package.json')} declares no dialecte.mutation: declare its scope and fast tier first`,
		})
	if (declared.kind === 'invalid') return stopOf({ exitCode: 1, line: declared.reason })
	return { declaration: declared.declaration }
}

/** The run's targets in its mode (every mutable file for an audit, the changed lines else), or why it has none. */
function targetsOf(params: {
	root: string
	declaration: MutationDeclaration
	lot: string
	mode: MutationMode
	changed: ChangedTargets | undefined
}): RunPlanResult {
	const { root, declaration, lot, mode, changed } = params
	const since = `no file of the scope changed since ${changed?.base.slice(0, SHORT_TREE_LENGTH)}`
	if (mode === 'off')
		return stopOf({
			exitCode: 0,
			line: `${MUTATION_OFF} (${(changed?.targets.length ?? 0) > 0 ? 'the lot declares it off' : `${NOTHING_TO_MUTATE}: ${since}`})`,
		})
	const targets =
		mode === 'audit'
			? listRepositoryFiles({ root, folder: '.' }).filter((file) =>
					isMutable({ declaration, file }),
				)
			: (changed?.targets ?? [])
	if (targets.length === 0)
		return stopOf({
			exitCode: 0,
			line: `${NOTHING_TO_MUTATE} (${mode === 'audit' ? 'the scope holds no mutable file' : since})`,
		})
	return {
		plan: {
			declaration,
			lot,
			mode,
			...(mode === 'changed' && changed ? { base: changed.base } : {}),
			targets,
		},
	}
}

/** The mode a run follows: the one asked, else the lot's switch (a gate lot runs as changed). */
function runModeOf(params: {
	asked: string | undefined
	setting: ValidModeSetting
	touchesScope: boolean
}): MutationMode {
	const { asked, setting, touchesScope } = params
	if (asked === 'audit' || asked === 'changed') return asked
	const mode = effectiveMode({ mode: setting, touchesScope })
	return mode === 'gate' ? 'changed' : mode
}

function stopOf(stop: RunStop['stop']): RunStop {
	return { stop }
}
