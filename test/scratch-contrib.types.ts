import type { GateStep } from '../src/lib/gate/gate-config.types.ts'

/** What `dialecte contrib --json` prints. */
export type ContribJson = {
	profile: string
	rows: { name: string; status: string; detail: string }[]
	reused?: { at: string; head: string }
}

/** A scratch package for the tests of `dialecte contrib`. */
export type ContribPackageParams = {
	/** `dialecte.profile`; `contributor` by default, `null` leaves the field out. */
	profile?: string | number | null
	/** `dialecte.contrib.steps`; absent: the field is left out (the default steps). */
	steps?: GateStep[]
	/** `dialecte.gate.fast`. */
	gateFast?: GateStep[]
	/** `dialecte.gate.full`. */
	gateFull?: GateStep[]
	/** `dialecte.generatedDocs`. */
	generatedDocs?: string[]
	/** More package.json fields (`scripts`, `devDependencies`). */
	packageJson?: Record<string, unknown>
	/** More committed files. */
	files?: Record<string, string>
}
