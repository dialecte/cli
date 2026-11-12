import type { LotsFile, TargetVerdict } from '../src/lib/handover/handover.types.ts'
import type { PackageJson } from '../src/lib/package-json.types.ts'

/** A repository on `main` and the branch `feat/x` cut from it: the lots file of a hand-over of two plain lots, none committed. */
export type TargetScenario = {
	root: string
	/** The commit both branches start at (the lots file's `head`). */
	start: string
	lotsFile: LotsFile
}

/** What one case of the `targetMoved` table arranges in its scenario: the call's inputs and the verdict expected. */
export type TargetArrangement = {
	lotsFile: LotsFile
	packageJson?: PackageJson
	/** How many lots the case commits on the branch (what the callers count); none by default. */
	committed?: number
	done?: true
	abandoned?: true
	expected: TargetVerdict
}

/** One case of the `targetMoved` table. */
export type TargetRow = {
	/** The case's full title. */
	title: string
	arrange: (scenario: TargetScenario) => TargetArrangement
}
