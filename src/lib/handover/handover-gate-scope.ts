/**
 * What `handover run` (real and rehearsal) reads of the package's gate once, before its guards: the config is one
 * the cli can run (else a refusal, nothing staged), and when the hook runs a scoped step, the hand-over base its
 * hooks are handed.
 */
import { realPathOf } from '../file-system.ts'
import { hasScopedHookStep, resolveConfiguredBase } from '../gate/gate-base.ts'
import {
	GateConfigError,
	holdsScopedStep,
	resolveGateSteps,
	validateGateConfig,
} from '../gate/gate-config.ts'
import { readPackageJson } from '../package-json.ts'
import { HANDOVER_GATE_CONFIG_REFUSAL } from './handover-gate-scope.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { Refusal } from '../refusal.types.ts'
import type { HandoverGateScope } from './handover-gate-scope.types.ts'
import type { HandoverFolder } from './handover.types.ts'

/**
 * The gate scope of the hand-over `handover`, read from its repository's package.json: a refusal when the gate
 * config is invalid; else the hand-over base resolved once on the lots file's HEAD when a gate list holds a scoped
 * step (the base branch's merge-base with it, else the empty tree); whether the hook's test steps hold a scoped
 * step (the hook records fold their base then); and, when the full steps hold one (the hook keys with a base then),
 * that base with the real path of the hand-over folder to hand down. A package without a base branch hands nothing
 * down.
 */
export function resolveHandoverGateScope(params: {
	handover: HandoverFolder
}): HandoverGateScope | Refusal {
	const { lotsFile } = params.handover
	const root = lotsFile.repository
	const packageJson = readPackageJsonOf(root)
	// a package.json that is no JSON: the guards say what is wrong with the working files, not this read
	if (packageJson === undefined) return { scoped: false }
	try {
		validateGateConfig(packageJson)
	} catch (error) {
		if (error instanceof GateConfigError)
			return { refusal: HANDOVER_GATE_CONFIG_REFUSAL.replace('{message}', error.message) }
		throw error
	}
	const base = resolveConfiguredBase({ root, packageJson, head: lotsFile.head })
	// the hook keys its full records with a base whenever a full step is scoped: it gets the hand-over's then
	const handsDown = holdsScopedStep(resolveGateSteps({ packageJson, mode: 'full' }))
	return {
		scoped: hasScopedHookStep(packageJson),
		...(base && { base }),
		// the empty tree is no commit a hook could check: a hook without a base branch finds it by itself
		...(handsDown &&
			base?.source === 'base-branch' && {
				handoverBase: { commit: base.commit, folder: realPathOf(params.handover.folder) },
			}),
	}
}

/** The package.json at `root` (`readPackageJson`); undefined when it is no JSON (a file being edited, a conflict). */
function readPackageJsonOf(root: string): PackageJson | undefined {
	try {
		return readPackageJson(root)
	} catch (error) {
		if (error instanceof SyntaxError) return undefined
		throw error
	}
}
