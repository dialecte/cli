/**
 * The one verdict on a test file whose run ran no case of it, shared by `tdd red`, `tdd green` and the gate's tdd
 * state: the run reports no module or no case of it -> the package's vitest configs say why (held by the default
 * config or unknown (a config the reader cannot fully read may hold it: fail closed), by a config the default one does
 * not list, or by none: no vitest test file, out of the selection); every
 * case it reports is skipped or a todo -> refused, a skipped case proves nothing.
 */
import { modulesOf } from './select-cases.ts'
import {
	NOT_A_VITEST_FILE_LABEL,
	NOT_A_VITEST_FILE_LINE,
	NOT_RUN_CASE_STATES,
	REFUSED_LABEL,
	ZERO_CASE_REASONS,
} from './tdd.constants.ts'
import { everyTestCallSkipped } from './test-source.ts'
import { configHolding } from './vitest-configs.ts'

import type {
	ChangedTestFile,
	ReportedModule,
	UnlistedFile,
	VitestConfigs,
	ZeroCaseFiles,
} from './tdd.types.ts'

export function judgeZeroCaseFiles(params: {
	root: string
	configs: VitestConfigs
	modules: readonly ReportedModule[]
	/** The test files the run was given. */
	files: readonly ChangedTestFile[]
	/** The files whose cases cannot be listed (a load failure): refused on their own, never judged here. */
	unlisted: readonly UnlistedFile[]
	/** A collect-only run reports every case skipped: which ones the file skips is read from its source. */
	collectOnly: boolean
}): ZeroCaseFiles {
	const verdicts: ZeroCaseFiles = { refused: [], notVitest: [] }
	for (const file of params.files) {
		if (params.unlisted.some((unlisted) => unlisted.file === file.file)) continue
		const modules = modulesOf({ root: params.root, modules: params.modules, file: file.file })
		const cases = modules.flatMap((testModule) => testModule.cases)
		if (cases.length === 0) {
			// a module reported is a file the run holds: no config reading can say otherwise
			const holding =
				modules.length > 0
					? { kind: 'default' as const }
					: configHolding({ configs: params.configs, path: file.file })
			if (holding.kind === 'none') verdicts.notVitest.push(file.file)
			else
				verdicts.refused.push({
					file: file.file,
					reason:
						holding.kind === 'other'
							? ZERO_CASE_REASONS.otherConfig.replace('{config}', () => holding.config)
							: ZERO_CASE_REASONS.noCase,
				})
			continue
		}
		const everySkipped = params.collectOnly
			? everyTestCallSkipped({
					text: file.text,
					file: file.file,
					locations: cases.map((testCase) => testCase.location),
				})
			: cases.every((testCase) => NOT_RUN_CASE_STATES.includes(testCase.state))
		if (everySkipped)
			verdicts.refused.push({ file: file.file, reason: ZERO_CASE_REASONS.allSkipped })
	}
	return verdicts
}

/**
 * The lines of the files a run ran no case of, as `tdd` and the gate print them: `refused  <file>  <reason>`, and
 * `outside  <file>  not a vitest test file (...)` for a file no vitest config includes (no refusal).
 */
export function zeroCaseLines(zeroCases: ZeroCaseFiles): string[] {
	return [
		...zeroCases.refused.map((refusal) => `${REFUSED_LABEL}  ${refusal.file}  ${refusal.reason}`),
		...zeroCases.notVitest.map(
			(file) => `${NOT_A_VITEST_FILE_LABEL}  ${file}  ${NOT_A_VITEST_FILE_LINE}`,
		),
	]
}
