import { describeRunError } from './describe-run-error.ts'
import { toJsonSafe } from './json-safe.ts'
import { installDeterminism } from './run-determinism.ts'
import { createRunGuard, StagedHalt } from './run-guard.ts'
import { NO_DOCUMENT_QUERY, RUN_PROJECT_NAME } from './run.constants.ts'

import type {
	RunOutcome,
	RunProject,
	RunScript,
	RunScriptParams,
	RunScriptResult,
} from './run.types.ts'

/**
 * Run a script against a fresh in-memory project of the dialecte and answer one structured outcome:
 * the error it threw (code, key, element path), the diagnostics of its input, the records it wrote
 * per tag, in `prepare` mode the staged transaction (nothing committed), the expectations met or
 * failed, what it returned. Ids are seeded and time can be frozen from the moment the script module
 * loads, so the same script, input and seed give the same outcome. No file system: the caller loads
 * the script and writes the export. Ids and clock are put back whatever happens, a timeout included -
 * but a script that timed out may still be running in the caller's process.
 */
export async function runScript(params: RunScriptParams): Promise<RunScriptResult> {
	const { environment, mode, seed, now, input, expectations } = params
	const { core } = environment
	const outcome: RunOutcome = { ok: true, diagnostics: [], operations: {} }
	const restoreDeterminism = installDeterminism({ core, seed, now })
	let project: RunProject | undefined
	let file: Blob | undefined

	let script: RunScript
	try {
		script = await params.loadScript()
	} catch (thrown) {
		restoreDeterminism()
		throw thrown
	}

	try {
		project = await environment.createProject().open(RUN_PROJECT_NAME)
		const { documentId, diagnostics } = input
			? await project.importFile(input)
			: await openEmptyDocument({ project })
		outcome.diagnostics = diagnostics

		const document = project.openDocument(documentId)
		const guard = createRunGuard({ project, document, mode })
		let thrownByScript: unknown
		try {
			const result = await withTimeout({
				running: script({
					project: guard.project,
					doc: guard.document,
					documentId,
					dialecte: environment.dialecte,
					helpers: core.helpers,
					utils: core.utils,
				}),
				timeoutInMilliseconds: params.timeoutInMilliseconds,
			})
			if (result !== undefined) {
				const { value, note } = toJsonSafe({ value: result })
				outcome.result = value
				if (note) outcome.resultNote = note
			}
		} catch (thrown) {
			if (!(thrown instanceof StagedHalt)) thrownByScript = thrown
		}

		// a refused write counts even when the script caught it
		const [firstRefusal] = guard.refusals
		const failure = firstRefusal ?? thrownByScript
		if (failure !== undefined)
			outcome.error = await describeRunError({ thrown: failure, core, query: document.query })

		outcome.operations = guard.operations()
		const staged = guard.staged()
		if (staged) {
			outcome.prepared = { label: staged.label }
			if (staged.report !== undefined) {
				const { value, note } = toJsonSafe({ value: staged.report })
				outcome.prepared.report = value
				if (note) outcome.prepared.reportNote = note
			}
		}

		if (expectations) {
			const { passed, failed } = await core.evaluateExpectations(
				staged?.prepared.query ?? document.query,
				{ expectations },
			)
			outcome.expectations = { passed: passed.length, failed }
		}
		staged?.prepared.discard()

		if (params.exportDocument && mode === 'commit' && !outcome.error) {
			;({ file } = await project.export({ documentId }))
			outcome.export = { bytes: file.size }
		}
	} catch (thrown) {
		outcome.error = await describeRunError({ thrown, core, query: NO_DOCUMENT_QUERY })
	} finally {
		restoreDeterminism()
		await project?.destroy()
	}

	outcome.ok = !outcome.error && (outcome.expectations?.failed.length ?? 0) === 0
	return { outcome, ...(file && { file }) }
}

async function openEmptyDocument(params: {
	project: RunProject
}): Promise<{ documentId: string; diagnostics: [] }> {
	const documentId = await params.project.initEmptyDocument()
	return { documentId, diagnostics: [] }
}

/** The script's result, or a rejection once the time limit passed. */
async function withTimeout<Result>(params: {
	running: Promise<Result>
	timeoutInMilliseconds: number
}): Promise<Result> {
	const { running, timeoutInMilliseconds } = params
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>(function rejectLater(_resolve, reject) {
		timer = setTimeout(function giveUp() {
			reject(new Error(`the script ran longer than ${timeoutInMilliseconds} ms`))
		}, timeoutInMilliseconds)
	})
	try {
		return await Promise.race([running, timeout])
	} finally {
		clearTimeout(timer)
	}
}
