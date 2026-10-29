import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { readSyncManifest } from '../skills/sync-skills.ts'
import { planStationAgents } from './render-station-agent.ts'
import { syncStationAgents } from './sync-station-agents.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { StationAgentPlan } from './station-agents.types.ts'

let root: string

function write(path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

function read(path: string): string {
	return readFileSync(join(root, path), 'utf8')
}

function anthropicPlan(): StationAgentPlan {
	return planStationAgents({ vendor: 'anthropic' })
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-cli-stations-'))
	// the claude skills folder a sync already created, holding the manifest
	write('.claude/skills/.dialecte-skills.json', JSON.stringify({ installed: [] }))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('syncStationAgents', () => {
	it('anthropic plan -> every agent file written and listed in the manifest', () => {
		const report = syncStationAgents({ cwd: root, plan: anthropicPlan() })

		expect(report.written).toHaveLength(8)
		expect(read('.claude/agents/dialecte-reviewer.md')).toContain('model: opus')
		expect(readSyncManifest(join(root, '.claude/skills')).stationAgents).toContain(
			'dialecte-reviewer.md',
		)
	})

	it("a user's own dialecte-reviewer.md -> reported as a conflict, never overwritten", () => {
		write('.claude/agents/dialecte-reviewer.md', 'mine\n')

		const report = syncStationAgents({ cwd: root, plan: anthropicPlan() })

		expect(report.conflicts).toEqual([join(root, '.claude/agents/dialecte-reviewer.md')])
		expect(read('.claude/agents/dialecte-reviewer.md')).toBe('mine\n')
		expect(readSyncManifest(join(root, '.claude/skills')).stationAgents).not.toContain(
			'dialecte-reviewer.md',
		)
	})

	it('a second sync -> the files it owns are replaced by what the sync writes now', () => {
		syncStationAgents({ cwd: root, plan: anthropicPlan() })
		write('.claude/agents/dialecte-grader.md', 'edited by hand\n')

		const report = syncStationAgents({ cwd: root, plan: anthropicPlan() })

		expect(report.conflicts).toEqual([])
		expect(read('.claude/agents/dialecte-grader.md')).toContain('name: dialecte-grader')
	})

	it('a file no longer produced -> removed when the manifest lists it; an unlisted one stays', () => {
		syncStationAgents({ cwd: root, plan: anthropicPlan() })
		write('.claude/agents/dialecte-other.md', 'mine\n')
		const manifestFolder = join(root, '.claude/skills')
		const manifest = readSyncManifest(manifestFolder)
		writeFileSync(
			join(manifestFolder, '.dialecte-skills.json'),
			JSON.stringify({
				...manifest,
				stationAgents: [...(manifest.stationAgents ?? []), 'dialecte-old.md'],
			}),
		)
		write('.claude/agents/dialecte-old.md', 'old\n')

		const report = syncStationAgents({ cwd: root, plan: anthropicPlan() })

		expect(report.removed).toEqual(['dialecte-old.md'])
		expect(existsSync(join(root, '.claude/agents/dialecte-old.md'))).toBe(false)
		expect(existsSync(join(root, '.claude/agents/dialecte-other.md'))).toBe(true)
	})

	it('another vendor after an anthropic sync -> the files it wrote are removed, the reason reported', () => {
		syncStationAgents({ cwd: root, plan: anthropicPlan() })

		const report = syncStationAgents({ cwd: root, plan: planStationAgents({ vendor: 'openai' }) })

		expect(report.removed).toHaveLength(8)
		expect(report.skippedReason).toMatch(/openai/)
		expect(existsSync(join(root, '.claude/agents/dialecte-reviewer.md'))).toBe(false)
		expect(readSyncManifest(join(root, '.claude/skills')).stationAgents).toBeUndefined()
	})

	it('the last owned file removed -> the empty agents folder goes; a folder holding a file of the user stays', () => {
		syncStationAgents({ cwd: root, plan: anthropicPlan() })
		syncStationAgents({ cwd: root, plan: planStationAgents({ vendor: 'openai' }) })
		expect(existsSync(join(root, '.claude/agents'))).toBe(false)

		syncStationAgents({ cwd: root, plan: anthropicPlan() })
		write('.claude/agents/mine.md', 'mine\n')
		syncStationAgents({ cwd: root, plan: planStationAgents({ vendor: 'openai' }) })
		expect(existsSync(join(root, '.claude/agents/mine.md'))).toBe(true)
	})

	it('no manifest folder and nothing to write -> nothing created', () => {
		rmSync(join(root, '.claude'), { recursive: true })

		syncStationAgents({ cwd: root, plan: { kind: 'files', files: [] } })

		expect(existsSync(join(root, '.claude'))).toBe(false)
	})
})
