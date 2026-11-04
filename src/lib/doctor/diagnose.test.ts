import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { planStationAgents } from '../stations/render-station-agent.ts'
import { syncStationAgents } from '../stations/sync-station-agents.ts'
import { answerDoctor } from './answer-doctor.ts'
import { diagnose } from './diagnose.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let workspace: string
let app: string

function write(path: string, content: string): void {
	mkdirSync(dirname(join(workspace, path)), { recursive: true })
	writeFileSync(join(workspace, path), content)
}

function installPackage(params: {
	name: string
	version: string
	skill?: string
	dependencies?: Record<string, string>
	/** Where it is installed, under the workspace: `app/node_modules/<name>` by default. */
	folder?: string
}): void {
	const folder = params.folder ?? `app/node_modules/${params.name}`
	write(
		`${folder}/package.json`,
		JSON.stringify({
			name: params.name,
			version: params.version,
			dependencies: params.dependencies,
		}),
	)
	if (params.skill) write(`${folder}/skills/${params.skill}/SKILL.md`, '---\n')
}

/** A copy sync of both skills into .claude/skills, core's taken from `coreVersion`. */
function writeSynced(params: { coreVersion: string }): void {
	write('app/.claude/skills/dialecte/SKILL.md', '---\n')
	write('app/.claude/skills/dialecte-scl/SKILL.md', '---\n')
	write(
		'app/.claude/skills/.dialecte-skills.json',
		JSON.stringify({
			installed: ['dialecte', 'dialecte-scl'],
			versions: {
				dialecte: { package: '@dialecte/core', version: params.coreVersion },
				'dialecte-scl': { package: '@dialecte/scl', version: '0.10.0' },
			},
		}),
	)
}

function linesOf(): ReturnType<typeof diagnose> {
	return diagnose({ cwd: app, dialecteRoot: undefined, cliVersion: '0.2.0' })
}

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), 'dialecte-cli-doctor-'))
	app = join(workspace, 'app')
	write(
		'app/package.json',
		JSON.stringify({
			name: 'app',
			dependencies: { '@dialecte/core': '0.7.0', '@dialecte/scl': '0.10.0' },
			devDependencies: { '@dialecte/cli': '^0.2.0' },
		}),
	)
	installPackage({ name: '@dialecte/core', version: '0.7.0', skill: 'dialecte' })
	installPackage({
		name: '@dialecte/scl',
		version: '0.10.0',
		skill: 'dialecte-scl',
		dependencies: { '@dialecte/core': '0.7.0' },
	})
	installPackage({ name: '@dialecte/cli', version: '0.2.0' })
	writeSynced({ coreVersion: '0.7.0' })
})

afterEach(() => {
	rmSync(workspace, { recursive: true, force: true })
})

describe('diagnose', () => {
	it('skills copied from an older version than node_modules holds → stale reported with the fix command', () => {
		writeSynced({ coreVersion: '0.6.0' })

		expect(linesOf()).toContainEqual({
			status: 'warning',
			subject: 'skills',
			detail: '.claude/skills holds dialecte of @dialecte/core 0.6.0, 0.7.0 installed',
			fix: 'npx @dialecte/cli skills sync',
		})
	})

	it('a linked skill recorded at another version → not stale (a link follows node_modules)', () => {
		writeSynced({ coreVersion: '0.6.0' })
		rmSync(join(app, '.claude/skills/dialecte'), { recursive: true })
		symlinkSync(
			join(app, 'node_modules/@dialecte/core/skills/dialecte'),
			join(app, '.claude/skills/dialecte'),
			'dir',
		)

		expect(linesOf()).toContainEqual({
			status: 'ok',
			subject: 'skills',
			detail: '.claude/skills in sync with node_modules',
		})
	})

	it('a shipped skill missing from the sync → lacks it, with the fix command', () => {
		installPackage({ name: '@dialecte/plc', version: '0.2.0', skill: 'dialecte-plc' })
		write(
			'app/package.json',
			JSON.stringify({
				dependencies: {
					'@dialecte/core': '0.7.0',
					'@dialecte/scl': '0.10.0',
					'@dialecte/plc': '0.2.0',
				},
			}),
		)

		expect(linesOf()).toContainEqual({
			status: 'warning',
			subject: 'skills',
			detail: '.claude/skills lacks dialecte-plc',
			fix: 'npx @dialecte/cli skills sync',
		})
	})

	it('a dialecte on its own nested core of another version than the app’s → ⚠️ two cores, with the fix', () => {
		installPackage({
			name: '@dialecte/core',
			version: '0.6.4',
			folder: 'app/node_modules/@dialecte/scl/node_modules/@dialecte/core',
		})

		expect(linesOf()).toContainEqual({
			status: 'warning',
			subject: 'core API',
			detail:
				'@dialecte/scl on core 0.6.4, your app on core 0.7.0: two cores side by side (0.6: import and IO hooks before the store owned them: read the skills of this version, not the latest docs)',
			fix: 'align @dialecte/core with the version the dialecte pins (or upgrade the dialecte), then npm install',
		})
	})

	it('a dialecte on its own nested core of the app’s version → ✅ its generation', () => {
		installPackage({
			name: '@dialecte/core',
			version: '0.7.0',
			folder: 'app/node_modules/@dialecte/scl/node_modules/@dialecte/core',
		})

		expect(linesOf()).toContainEqual({
			status: 'ok',
			subject: 'core API',
			detail:
				'@dialecte/scl on core 0.7.0 - 0.7: import inside the store (project.importFile answers { documentId, diagnostics }), per-file IO hook session, createTestHelpers',
		})
	})

	it('everything installed, skills synced from the installed versions → one ✅ line each, exit 0', () => {
		expect(answerDoctor({ lines: linesOf(), json: false })).toEqual({
			output: [
				'✅ dialecte  cli 0.2.0 running',
				'✅ @dialecte/cli  0.2.0',
				'✅ @dialecte/core  0.7.0',
				'✅ @dialecte/scl  0.10.0',
				'✅ profile  consumer (default)',
				'✅ core API  @dialecte/scl on core 0.7.0 - 0.7: import inside the store (project.importFile answers { documentId, diagnostics }), per-file IO hook session, createTestHelpers',
				'✅ skills  .claude/skills in sync with node_modules',
				`✅ checkouts  none in ${workspace} (the installed packages are the source)`,
				'',
			].join('\n'),
			exitCode: 0,
		})
	})

	it('a pinned version other than the installed one, a dependency not installed → ⚠️ with npm install, exit 1', () => {
		write(
			'app/package.json',
			JSON.stringify({ dependencies: { '@dialecte/core': '0.8.0', '@dialecte/plc': '0.2.0' } }),
		)

		const answer = answerDoctor({ lines: linesOf(), json: false })
		expect(answer.output).toContain(
			'⚠️  @dialecte/core  0.7.0 installed, 0.8.0 declared - fix: npm install\n',
		)
		expect(answer.output).toContain('⚠️  @dialecte/plc  not installed - fix: npm install\n')
		expect(answer.exitCode).toBe(1)
	})

	it('no agent folder synced while dependencies ship skills → ⚠️ with the sync command', () => {
		rmSync(join(app, '.claude'), { recursive: true })

		expect(linesOf()).toContainEqual({
			status: 'warning',
			subject: 'skills',
			detail: 'not installed for your agents (dialecte, dialecte-scl shipped)',
			fix: 'npx @dialecte/cli skills sync',
		})
	})

	it('$DIALECTE_ROOT holding checkouts → their folders listed', () => {
		write('dialecte/core/package.json', JSON.stringify({ name: '@dialecte/core' }))
		write('dialecte/scl/package.json', JSON.stringify({ name: '@dialecte/scl' }))
		write('dialecte/notes/README.md', '')
		const root = join(workspace, 'dialecte')

		expect(diagnose({ cwd: app, dialecteRoot: root, cliVersion: '0.2.0' })).toContainEqual({
			status: 'ok',
			subject: 'checkouts',
			detail: `${root}: core, scl`,
		})
	})

	it('more checkouts than a line holds → the first ones and how many more', () => {
		for (const index of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
			write(
				`dialecte/scl-${String(index).padStart(2, '0')}/package.json`,
				JSON.stringify({ name: '@dialecte/scl' }),
			)
		const root = join(workspace, 'dialecte')

		expect(diagnose({ cwd: app, dialecteRoot: root, cliVersion: '0.2.0' })).toContainEqual({
			status: 'ok',
			subject: 'checkouts',
			detail: `${root}: scl-01, scl-02, scl-03, scl-04, scl-05, scl-06, scl-07, scl-08 and 2 more`,
		})
	})
})

describe('diagnose, station agents', () => {
	const MANIFEST = 'app/.claude/skills/.dialecte-skills.json'

	function syncAnthropicStationAgents(): void {
		const manifest = JSON.parse(readFileSync(join(workspace, MANIFEST), 'utf8'))
		write(MANIFEST, JSON.stringify({ ...manifest, vendor: 'anthropic' }))
		syncStationAgents({ cwd: app, plan: planStationAgents({ vendor: 'anthropic' }) })
	}

	function stationLines(): ReturnType<typeof diagnose> {
		return linesOf().filter((line) => line.subject === 'station agents')
	}

	it('in sync -> one ok line', () => {
		syncAnthropicStationAgents()

		expect(stationLines()).toEqual([
			{ status: 'ok', subject: 'station agents', detail: '.claude/agents in sync' },
		])
	})

	it('a station agent whose content differs from what sync writes now -> stale, with the fix command', () => {
		syncAnthropicStationAgents()
		write('app/.claude/agents/dialecte-reviewer.md', 'old text\n')

		expect(stationLines()).toEqual([
			{
				status: 'warning',
				subject: 'station agents',
				detail: '.claude/agents holds stale dialecte-reviewer.md',
				fix: 'npx @dialecte/cli skills sync',
			},
		])
	})

	it('a station agent file missing -> reported as missing', () => {
		syncAnthropicStationAgents()
		rmSync(join(app, '.claude/agents/dialecte-grader.md'))

		expect(stationLines()).toEqual([
			{
				status: 'warning',
				subject: 'station agents',
				detail: '.claude/agents lacks dialecte-grader.md',
				fix: 'npx @dialecte/cli skills sync',
			},
		])
	})

	it("a user's own file of that name (not listed by sync) -> not reported", () => {
		syncAnthropicStationAgents()
		const manifest = JSON.parse(readFileSync(join(workspace, MANIFEST), 'utf8'))
		write(
			MANIFEST,
			JSON.stringify({
				...manifest,
				stationAgents: manifest.stationAgents.filter(
					(name: string) => name !== 'dialecte-reviewer.md',
				),
			}),
		)
		write('app/.claude/agents/dialecte-reviewer.md', 'mine\n')

		expect(stationLines()).toEqual([
			{ status: 'ok', subject: 'station agents', detail: '.claude/agents in sync' },
		])
	})

	it('a manifest recording no station agents (anthropic vendor) -> no station agent line', () => {
		const manifest = JSON.parse(readFileSync(join(workspace, MANIFEST), 'utf8'))
		write(MANIFEST, JSON.stringify({ ...manifest, vendor: 'anthropic' }))

		expect(stationLines()).toEqual([])
	})

	it('brief -> no checkouts scan', () => {
		const lines = diagnose({ cwd: app, dialecteRoot: undefined, cliVersion: '0.2.0', brief: true })

		expect(lines.filter((line) => line.subject === 'checkouts')).toEqual([])
	})

	it('another vendor, or none known -> no station agent line', () => {
		expect(stationLines()).toEqual([])
	})
})

describe('diagnose, the skills of a contributor profile', () => {
	it('a contributor whose manifest is not contributing, core shipping a contributor dialecte-lot → the skills line lacks dialecte-lot', () => {
		write(
			'app/package.json',
			JSON.stringify({
				name: 'app',
				dependencies: { '@dialecte/core': '0.7.0', '@dialecte/scl': '0.10.0' },
				dialecte: { profile: 'contributor' },
			}),
		)
		write(
			'app/node_modules/@dialecte/core/skills/dialecte-lot/SKILL.md',
			'---\nname: dialecte-lot\ndescription: Use it.\nmetadata:\n  audience: contributor\n---\n',
		)

		expect(linesOf()).toContainEqual({
			status: 'warning',
			subject: 'skills',
			detail: '.claude/skills lacks dialecte-lot',
			fix: 'npx @dialecte/cli skills sync',
		})
	})
})
