import { existsSync } from 'node:fs'

import { INDEX_FOLDER_FILES, SAMPLE_WORD } from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	createStandardWorkspace,
	entriesOf,
	filesUnder,
	manifestHashOf,
	sampleStandardText,
	standardCacheFolder,
} from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StandardIndexJson, StandardWorkspace } from '../../test/standard-workspace.types.ts'

/**
 * The file system faults of these cases: the rename of an index folder out of its temporary folder fails with
 * `renameCode`, and `probe` runs after every rename and after every step of a recursive removal (a removal is
 * not atomic: it deletes the entries of a folder one after the other).
 */
const fault = vi.hoisted(() => ({
	renameCode: undefined as string | undefined,
	asideCode: undefined as string | undefined,
	probe: undefined as (() => void) | undefined,
}))

vi.mock('node:fs', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:fs')>()
	return {
		...original,
		renameSync(from: string, to: string) {
			if (fault.renameCode !== undefined && /[0-9a-f]{64}\.tmp-\d+$/u.test(String(from)))
				throw Object.assign(new Error(fault.renameCode), { code: fault.renameCode })
			if (fault.asideCode !== undefined && /[0-9a-f]{64}$/u.test(String(from))) {
				// another rebuild moved the folder away first: it is gone when this rename looks for it
				if (fault.asideCode === 'ENOENT') original.rmSync(from, { recursive: true, force: true })
				throw Object.assign(new Error(fault.asideCode), { code: fault.asideCode })
			}
			original.renameSync(from, to)
			fault.probe?.()
		},
		rmSync(path: string, options?: { recursive?: boolean; force?: boolean }) {
			if (fault.probe === undefined || !options?.recursive) return original.rmSync(path, options)
			if (original.existsSync(path) && original.statSync(path).isDirectory())
				for (const entry of original.readdirSync(path)) {
					original.rmSync(`${path}/${entry}`, options)
					fault.probe?.()
				}
			original.rmSync(path, options)
			fault.probe?.()
		},
	}
})

afterEach(() => {
	fault.renameCode = undefined
	fault.asideCode = undefined
	fault.probe = undefined
})

const FIRST = sampleStandardText({ word: SAMPLE_WORD })
const SECOND = sampleStandardText({ word: 'quillon' })
const ALPHA_IDS = { 'alpha/one': FIRST, 'alpha/two': SECOND }
const COMPLETE_FILES = [...INDEX_FOLDER_FILES, 'lines/one.jsonl', 'lines/two.jsonl'].sort()

function twoFileWorkspace(): StandardWorkspace {
	return createStandardWorkspace({
		standards: { alpha: { 'one.md': FIRST, 'two.md': SECOND } },
	})
}

function alphaFolder(workspace: StandardWorkspace): string {
	return standardCacheFolder({ workspace, standardId: 'alpha' })
}

/** Runs `standard index --json` with `extra` flags over the workspace; the run must exit 0. */
async function indexed(params: { workspace: StandardWorkspace; extra?: string[] }) {
	const answer = await answeredWith({
		run: runStandard({
			argv: ['index', '--json', ...(params.extra ?? [])],
			cwd: params.workspace.cwd,
			environment: params.workspace.environment,
		}),
		exitCode: 0,
	})
	return (JSON.parse(answer.output) as StandardIndexJson).standards[0]
}

describe('standard index: the rename of the finished folder fails for another reason than a taken target', () => {
	for (const code of ['EACCES', 'EPERM'])
		it(
			`${code} → exit 1 naming the code and the folder, no temporary folder left`,
			async () => {
				const workspace = twoFileWorkspace()
				const hash = manifestHashOf({ files: ALPHA_IDS })
				fault.renameCode = code

				const answer = await answeredWith({
					run: runStandard({
						argv: ['index'],
						cwd: workspace.cwd,
						environment: workspace.environment,
					}),
					exitCode: 1,
				})

				expect(answer.output).toContain(code)
				expect(answer.output).toContain(hash)
				expect(entriesOf(alphaFolder(workspace))).toEqual([])
			},
			STANDARD_DISK_CASE_TIMEOUT,
		)
})

describe('standard index: two rebuilds racing for the same folder', () => {
	it(
		'the rename aside finds the folder already moved away (ENOENT) → exit 0, the index whole',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			await indexed({ workspace })
			fault.asideCode = 'ENOENT'

			const alpha = await indexed({ workspace, extra: ['--rebuild'] })

			expect(alpha).toMatchObject({ manifest: `sha256:${hash}`, state: 'built' })
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			expect(filesUnder(`${alphaFolder(workspace)}/${hash}`)).toEqual(COMPLETE_FILES)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the rename aside fails with another code (EACCES) → exit 1 with the standard index prefix naming the code',
		async () => {
			const workspace = twoFileWorkspace()
			await indexed({ workspace })
			fault.asideCode = 'EACCES'

			const answer = await answeredWith({
				run: runStandard({
					argv: ['index', '--rebuild'],
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 1,
			})

			expect(answer.output.startsWith('standard index:')).toBe(true)
			expect(answer.output).toContain('EACCES')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard index: a --rebuild next to a reader', () => {
	it(
		'at every step of the rebuild → the index folder of the manifest is absent or whole, never half removed',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			const target = `${alphaFolder(workspace)}/${hash}`
			await indexed({ workspace })
			const halfFolders: string[] = []
			fault.probe = function probeTarget() {
				if (!existsSync(target)) return
				const files = filesUnder(target)
				if (JSON.stringify(files) !== JSON.stringify(COMPLETE_FILES))
					halfFolders.push(files.join(','))
			}

			const alpha = await indexed({ workspace, extra: ['--rebuild'] })

			expect(alpha.state).toBe('built')
			expect(halfFolders).toEqual([])
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
