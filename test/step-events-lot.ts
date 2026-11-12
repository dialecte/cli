/** A lot whose worktree holds a committed package with a gate, and the reading of the step events it records. */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { readEvents } from '../src/lib/events/read-events.ts'
import { startStep } from '../src/lib/events/record-step.ts'
import { shellQuote } from '../src/lib/shell-quote.ts'
import { STORE_FILES } from '../src/lib/store/store.constants.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { addWorktreeFolder } from './lot-stores.ts'
import { WIRED_DEFAULT_SCRIPTS } from './rule-gaps-unwired.constants.ts'
import { git, temporaryFolder, writeFiles } from './scratch-repository.ts'
import { STEP_LOT } from './step-events-lot.constants.ts'

import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { StepPart } from '../src/lib/events/record-step.types.ts'
import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { StepEvents, StepList, StepLot, StepLotPackage } from './step-events-lot.types.ts'

/**
 * A workspace whose repository commits a package declaring `params`, a lot of its store, and the lot's own real
 * worktree (the folder the lot's identity names). The caller restores the environment (`vi.unstubAllEnvs`).
 */
export function createStepLot(params: StepLotPackage = {}): StepLot {
	const workspace = createBriefWorkspace()
	const markerFolder = join(process.env.XDG_STATE_HOME ?? '', 'dialecte', 'heavy')
	const eventsFile = join(workspace.store, STEP_LOT, STORE_FILES.events)
	function stepsOf(list: StepList | undefined): GateStep[] | undefined {
		return typeof list === 'function' ? list(markerFolder, eventsFile) : list
	}
	const fast = stepsOf(params.fast)
	const full = stepsOf(params.full)
	const release = stepsOf(params.release)
	const contribSteps = stepsOf(params.contribSteps)
	writeFiles({
		root: workspace.repository,
		files: {
			'package.json': `${JSON.stringify({
				name: 'demo',
				// the default steps of a list the lot does not declare are wired: this lot is not about wiring
				scripts: WIRED_DEFAULT_SCRIPTS,
				...params.extraPackage,
				dialecte: {
					...params.extraDialecte,
					...(contribSteps && {
						profile: 'contributor',
						contrib: { steps: contribSteps },
					}),
					gate: {
						...(fast && { fast }),
						...(full && { full }),
						...(release && { release }),
					},
				},
			})}\n`,
			'.gitignore': 'node_modules\n.dialecte\n',
			...params.files,
		},
	})
	git({ root: workspace.repository, args: ['add', '-A'] })
	git({ root: workspace.repository, args: ['commit', '-q', '-m', 'chore: package'] })
	const lotFolder = writeStoreLot({
		workspace,
		name: STEP_LOT,
		scope: ['src/'],
		branch: 'feat/subscribe',
		repository: workspace.repository,
	})
	const worktree = addWorktreeFolder({ workspace, folderName: STEP_LOT })
	return {
		workspace,
		name: STEP_LOT,
		lotFolder,
		eventsFile: join(lotFolder, STORE_FILES.events),
		worktree,
		markerFolder,
	}
}

/** The `step.*` events the lot's file holds, in file order. */
export function stepEventsOf(lot: Pick<StepLot, 'eventsFile'>): StepEvents {
	return readEvents({ file: lot.eventsFile }).events.filter((event) =>
		event.kind.startsWith('step.'),
	)
}

/** The events of one step family (`gate-fast`, ...), start and end. */
export function eventsOfStep(params: {
	lot: Pick<StepLot, 'eventsFile'>
	step: string
}): LotEvent[] {
	return stepEventsOf(params.lot).filter((event) => event.step === params.step)
}

/**
 * Records one gate run of the lot ending with `parts` through the step recorder; the end event it wrote. (Here, not
 * in the test file: a call that throws must be made from a frame inside an `expect`.)
 */
export function recordEndWith(params: {
	lot: StepLot
	parts: StepPart[]
	exit?: number
}): LotEvent | undefined {
	const handle = startStep({
		cwd: params.lot.worktree,
		step: 'gate-fast',
		heavy: false,
		warn: () => undefined,
	})
	handle.end({ exit: params.exit ?? 0, parts: params.parts, reuse: 'none', stateHash: null })
	return stepEventsOf(params.lot).find((event) => event.kind === 'step.end')
}

/** The parts an end event lists, as written (compact: keys whose value is null, false or empty are absent). */
export function partsOf(event: LotEvent | undefined): Record<string, unknown>[] {
	return (event?.parts ?? []) as Record<string, unknown>[]
}

/** A step that copies the live markers' files to `seen` (outside the repository) while it runs, then succeeds. */
export function markerProbeStep(params: {
	name: string
	seen: string
	markerFolder: string
	heavy?: boolean
	counts?: 'tests'
}): GateStep {
	return {
		name: params.name,
		run: `cat ${shellQuote(params.markerFolder)}/*.json > ${shellQuote(params.seen)} 2>/dev/null; true`,
		...(params.heavy && { heavy: true }),
		...(params.counts && { counts: params.counts }),
	}
}

/** A step that copies the lot's events file to `seen` while it runs (nothing when the file does not exist yet), then succeeds. */
export function eventsProbeStep(params: {
	name: string
	seen: string
	eventsFile: string
	counts?: 'tests'
}): GateStep {
	return {
		name: params.name,
		run: `cat ${shellQuote(params.eventsFile)} > ${shellQuote(params.seen)} 2>/dev/null; ${
			params.counts ? "printf ' Tests  1 passed (1)\\n'" : 'true'
		}`,
		...(params.counts && { counts: params.counts }),
	}
}

/** A fresh file outside every repository for a probe step to write to. */
export function seenFile(): string {
	return join(temporaryFolder('dialecte-seen-'), 'seen.txt')
}

/** The marker documents a probe saw (one JSON document per line), in the order the files were listed. */
export function markersSeen(seen: string): Record<string, unknown>[] {
	if (!existsSync(seen)) return []
	return readFileSync(seen, 'utf8')
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => JSON.parse(line) as Record<string, unknown>)
}

/** The files left in the marker folder (it may not exist). */
export function markerFilesIn(folder: string): string[] {
	return existsSync(folder) ? readdirSync(folder).sort() : []
}

/** A collector for the warning lines a step recorder is given. */
export function warningCollector(): { warn: (line: string) => void; lines: string[] } {
	const lines: string[] = []
	return { warn: (line) => void lines.push(line), lines }
}
