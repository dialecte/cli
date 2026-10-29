import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { planStationAgents } from './render-station-agent.ts'
import { syncStationAgents } from './sync-station-agents.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const failure = vi.hoisted(() => ({ code: undefined as string | undefined }))

vi.mock('node:fs', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:fs')>()
	return {
		...original,
		rmdirSync(path: string) {
			if (failure.code === undefined) return original.rmdirSync(path)
			throw Object.assign(new Error(failure.code), { code: failure.code })
		},
	}
})

let root: string

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-agents-folder-'))
	mkdirSync(join(root, '.claude/skills'), { recursive: true })
	writeFileSync(join(root, '.claude/skills/.dialecte-skills.json'), '{"installed":[]}')
	syncStationAgents({ cwd: root, plan: planStationAgents({ vendor: 'anthropic' }) })
})

afterEach(() => {
	failure.code = undefined
	rmSync(root, { recursive: true, force: true })
})

describe('removing the agents folder once its files are gone', () => {
	it.each(['ENOTEMPTY', 'ENOENT'])(
		'%s (a file arrived, or the folder is gone) -> ignored',
		(code) => {
			failure.code = code

			expect(() =>
				syncStationAgents({ cwd: root, plan: planStationAgents({ vendor: 'openai' }) }),
			).not.toThrow()
		},
	)

	it('any other error -> thrown', () => {
		failure.code = 'EACCES'

		expect(() =>
			syncStationAgents({ cwd: root, plan: planStationAgents({ vendor: 'openai' }) }),
		).toThrow('EACCES')
	})
})
