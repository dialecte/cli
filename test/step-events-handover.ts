/** A lot whose folder holds a hand-over (hook, lots file, snapshot), for the hand-over step-event cases. */
import { chmodSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { runHandover } from '../src/commands/handover.ts'
import { shellQuote } from '../src/lib/shell-quote.ts'
import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import { writeStoreLot } from './brief-workspace.ts'
import { storeOf } from './handover-store-scenario.ts'
import { PASSING_HOOK_LINES } from './hook-output-lines.constants.ts'
import { isolateStateFolder } from './lot-handover-workspace.ts'
import { addWorktreeFolder } from './lot-stores.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import { createScopedHookedPackage } from './scoped-hook-package.ts'
import { READ_LOT } from './scratch-checks.constants.ts'
import { editReadLot, headOf } from './scratch-checks.ts'
import { temporaryFolder } from './scratch-repository.ts'
import {
	BYSTANDER_LOT,
	HANDOVER_LOT,
	HANDOVER_LOT_SCOPE,
	HANDOVER_WRITER_CLI,
	HANDOVER_WRITTEN_AT,
} from './step-events-handover.constants.ts'
import { TEST_SUMMARY_COMMAND } from './step-events-lot.constants.ts'

import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { HandoverLot, HandoverLotParams } from './step-events-handover.types.ts'

/** A shell command printing each line as given. */
export function printLines(lines: readonly string[]): string {
	return `printf '%s\\n' ${lines.map((line) => shellQuote(line)).join(' ')}`
}

/**
 * A hook script that copies the heavy markers' files to `seen` (outside the repository) when it runs, then prints a
 * passing hook summary: what a case reads to know which markers stood while the hook ran.
 */
export function markerCopyingHook(params: { markerFolder: string; seen: string }): string {
	return [
		`cat ${shellQuote(params.markerFolder)}/*.json > ${shellQuote(params.seen)} 2>/dev/null || true`,
		printLines(PASSING_HOOK_LINES),
	].join('\n')
}

/**
 * A declared heavy test step that copies the heavy markers' files to `seen` when it runs and prints a passing test
 * summary (the hook needs a step that counts tests).
 */
export function heavyTestProbeStep(params: { markerFolder: string; seen: string }): GateStep {
	return {
		name: 'probe',
		run: `cat ${shellQuote(params.markerFolder)}/*.json > ${shellQuote(params.seen)} 2>/dev/null; ${TEST_SUMMARY_COMMAND}`,
		counts: 'tests',
		heavy: true,
	}
}

/**
 * A repository (a husky commit hook, a package with `params.gate`, `src/read.ts` and the changelog edited) that
 * holds a real lot named `HANDOVER_LOT`: its identity names a linked worktree apart from the repository (the commit
 * root), its folder holds the hand-over of the edit; a second lot (`BYSTANDER_LOT`) has a linked worktree too. `XDG_STATE_HOME` points into the test's folder (the caller restores the environment).
 */
export function createHandoverLot(params: HandoverLotParams = {}): HandoverLot {
	isolateStateFolder()
	const markerFolder = join(process.env.XDG_STATE_HOME ?? '', 'dialecte', 'heavy')
	const gate = typeof params.gate === 'function' ? params.gate(markerFolder) : params.gate
	const hookScript =
		typeof params.hookScript === 'function' ? params.hookScript(markerFolder) : params.hookScript
	const root = realpathSync(
		createScopedHookedPackage({
			gate: gate ?? {},
			hookScript: hookScript ?? printLines(PASSING_HOOK_LINES),
		}),
	)
	editReadLot(root)
	const registry = storeOf(root)
	// the folder the `.worktrees/` of the case goes in: its own, never shared with another case's
	const container = realpathSync(temporaryFolder('dialecte-step-ws-'))
	const workspace: BriefWorkspace = {
		workspace: container,
		repository: root,
		briefFolder: container,
		briefPath: join(container, 'brief.json'),
		store: join(dirname(registry), 'dialecte-lots'),
		registry,
		commit: headOf(root),
		storeList: join(process.env.XDG_STATE_HOME ?? '', 'dialecte', 'lot-stores'),
	}
	// written with the repository as the lot's worktree (a hand-over is refused otherwise); re-pointed below
	const lotFolder = realpathSync(
		writeStoreLot({
			workspace,
			name: HANDOVER_LOT,
			scope: HANDOVER_LOT_SCOPE,
			branch: 'main',
			repository: root,
			worktree: root,
		}),
	)
	// another lot of the store, in its own linked worktree: the folder a command runs in, which must stay unrecorded
	const bystanderWorktree = addWorktreeFolder({ workspace, folderName: BYSTANDER_LOT })
	const bystanderFolder = writeStoreLot({
		workspace,
		name: BYSTANDER_LOT,
		scope: ['docs/'],
		branch: `feat/${BYSTANDER_LOT}`,
		repository: root,
		worktree: bystanderWorktree,
	})
	const lotsPath = join(temporaryFolder('dialecte-step-lots-'), 'lots.json')
	writeFileSync(
		lotsPath,
		JSON.stringify({
			repository: root,
			branch: 'main',
			head: headOf(root),
			gates: 'npm run check',
			lots: [READ_LOT],
		}),
	)
	const folder = params.outside ? realpathSync(temporaryFolder('dialecte-step-out-')) : lotFolder
	const written = runHandover({
		argv: [lotsPath, '--out', folder],
		cliPath: HANDOVER_WRITER_CLI,
		probe: noRepositoryCli,
		now: HANDOVER_WRITTEN_AT,
	})
	if (written.exitCode !== 0) throw new Error(`could not write the hand-over: ${written.output}`)
	// the lot's identity now names a linked worktree apart from the commit root the hand-over runs in
	const identityWorktree = addWorktreeFolder({ workspace, folderName: HANDOVER_LOT })
	const identityFile = join(lotFolder, STORE_FILES.identity)
	// published records are read-only: this case alone re-points the file it made
	chmodSync(identityFile, 0o644)
	writeFileSync(
		identityFile,
		`${JSON.stringify({ ...JSON.parse(readFileSync(identityFile, 'utf8')), worktree: identityWorktree }, null, 2)}\n`,
	)
	return {
		root,
		identityWorktree,
		bystander: {
			worktree: bystanderWorktree,
			eventsFile: join(bystanderFolder, STORE_FILES.events),
		},
		lotName: HANDOVER_LOT,
		lotFolder,
		folder,
		eventsFile: join(lotFolder, STORE_FILES.events),
		markerFolder,
	}
}
