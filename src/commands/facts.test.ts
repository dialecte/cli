import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { wholeFactOf } from '../../test/fact-check-fixtures.ts'
import {
	factDraft,
	readFactFile,
	readHistoryFile,
	writeFactFile,
} from '../../test/fact-fixtures.ts'
import { LONG_REASON, REASON_LIMIT } from '../../test/facts-workspace.constants.ts'
import {
	createFactsWorkspace,
	leadingIdsOf,
	outputLinesOf,
	recordInto,
} from '../../test/facts-workspace.ts'
import { createScratchRepository, temporaryFolder } from '../../test/scratch-repository.ts'
import { answeredWith, createStandardWorkspace } from '../../test/standard-workspace.ts'
import { CLI_SURFACE_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { runFacts } from './facts.ts'

import { describe, expect, it } from 'vitest'

import type { FactsWorkspace } from '../../test/facts-workspace.types.ts'
import type { CommandOutput } from '../lib/command-output.types.ts'
import type { FactCheck, FactView } from '../lib/knowledge/facts/facts.types.ts'

/** Every fact is still valid, except F-0008 which the check cannot verify. */
function CHECK(params: Parameters<FactCheck>[0]): ReturnType<FactCheck> {
	return params.fact.id === 'F-0008' ? { state: 'unverifiable' } : { state: 'valid' }
}

const STATES = ['valid', 'stale', 'unverifiable', 'unchecked', 'forgotten', 'orphan']

/** Runs `facts` in the workspace with the check above, answering its exit code and output. */
function runIn(params: {
	workspace: FactsWorkspace
	argv: string[]
	exitCode: CommandOutput['exitCode']
}): Promise<CommandOutput> {
	return answeredWith({
		run: runFacts({
			argv: params.argv,
			cwd: params.workspace.cwd,
			environment: params.workspace.environment,
			check: CHECK,
		}),
		exitCode: params.exitCode,
	})
}

/**
 * A ledger holding every state: F-0001 valid; F-0002 superseded by F-0003 (valid); F-0004 outside (unchecked);
 * F-0005 a person fact given without documents; F-0006 stale; F-0007 forgotten; F-0008 valid that the check cannot
 * verify; F-0009 an orphan (no pointer, no history); F-0010 a file that is not JSON.
 */
function ledgerWithEveryState(): FactsWorkspace {
	const workspace = createFactsWorkspace()
	recordInto({ workspace, draft: factDraft() })
	recordInto({
		workspace,
		draft: factDraft({
			question: 'Is DD_1 required in D?',
			subject: {
				package: 'core-test',
				tags: [{ tag: 'DD_1', parent: 'D' }],
				attributes: [],
				codes: [],
				methods: [],
			},
			effort: 'low',
		}),
	})
	recordInto({
		workspace,
		draft: factDraft({
			question: 'Is DD_1 required in D?',
			subject: {
				package: 'core-test',
				tags: [{ tag: 'DD_1', parent: 'D' }],
				attributes: [],
				codes: [],
				methods: [],
			},
			effort: 'high',
			answer: { verdict: 'no', value: null, text: 'DD_1 is optional in D.' },
		}),
	})
	recordInto({
		workspace,
		draft: factDraft({
			question: 'Is AA_1 repeatable?',
			source: 'outside',
			sources: [{ kind: 'outside', url: 'https://example.com' }],
		}),
	})
	recordInto({
		workspace,
		draft: factDraft({
			question: 'Is A unique?',
			source: 'person',
			sources: [],
			unchecked: true,
		}),
	})
	recordInto({ workspace, draft: factDraft({ question: 'Is AA_2 ordered?' }) })
	recordInto({ workspace, draft: factDraft({ question: 'Is AA_3 ordered?' }) })
	recordInto({ workspace, draft: factDraft({ question: 'Is AA_4 ordered?' }) })
	for (const [id, state] of [
		['F-0006', 'stale'],
		['F-0007', 'forgotten'],
	] as const)
		writeFactFile({
			folder: workspace.folder,
			fact: { ...readFactFile({ folder: workspace.folder, id }), state },
		})
	writeFactFile({
		folder: workspace.folder,
		fact: wholeFactOf({
			draft: factDraft({ question: 'Is DDD_1 required in DD_1?' }),
			changes: { id: 'F-0009', key: 'c'.repeat(64) },
		}),
	})
	writeFileSync(join(workspace.folder, 'F-0010.json'), 'this is not json')
	return workspace
}

describe('facts list: the current facts', () => {
	it('an empty ledger → a line saying there is none, exit 0', async () => {
		const workspace = createFactsWorkspace()

		const { output } = await runIn({ workspace, argv: ['list'], exitCode: 0 })

		expect(output).toMatch(/no facts|none/i)
	})

	it('without --state → one line per key, its current fact whatever its state, no superseded fact, orphan or unreadable file', async () => {
		const workspace = ledgerWithEveryState()

		const { output } = await runIn({ workspace, argv: ['list'], exitCode: 0 })

		expect(leadingIdsOf(outputLinesOf(output)).sort()).toEqual([
			'F-0001',
			'F-0003',
			'F-0004',
			'F-0005',
			'F-0006',
			'F-0007',
			'F-0008',
		])
	})

	it('a line holds the id, the state, the effort, the source and the question', async () => {
		const workspace = ledgerWithEveryState()

		const { output } = await runIn({ workspace, argv: ['list'], exitCode: 0 })

		const line = outputLinesOf(output).find((candidate) => candidate.includes('F-0001')) ?? ''
		expect([
			line.includes('valid'),
			line.includes('medium'),
			line.includes('standard'),
			line.includes('Is D required in A?'),
		]).toEqual([true, true, true, true])
	})

	it('the state of a line is the state now: stale, forgotten, unchecked, unverifiable', async () => {
		const workspace = ledgerWithEveryState()

		const { output } = await runIn({ workspace, argv: ['list'], exitCode: 0 })

		const lines = outputLinesOf(output)
		function stateOf(id: string, state: string): boolean {
			return (lines.find((line) => line.includes(id)) ?? '').includes(state)
		}
		expect([
			stateOf('F-0004', 'unchecked'),
			stateOf('F-0005', 'unchecked'),
			stateOf('F-0006', 'stale'),
			stateOf('F-0007', 'forgotten'),
			stateOf('F-0008', 'unverifiable'),
		]).toEqual([true, true, true, true, true])
	})

	it('a long question is cut on its line', async () => {
		const workspace = createFactsWorkspace()
		recordInto({
			workspace,
			draft: factDraft({ question: `Is D required in A? ${'padding '.repeat(60)}END-OF-QUESTION` }),
		})

		const { output } = await runIn({ workspace, argv: ['list'], exitCode: 0 })

		const line = outputLinesOf(output).find((candidate) => candidate.includes('F-0001')) ?? ''
		expect([line.includes('Is D required in A?'), line.includes('END-OF-QUESTION')]).toEqual([
			true,
			false,
		])
	})

	const stateRows: Record<string, { state: string; ids: string[] }> = {
		'--state valid → the valid current facts, a person fact with unchecked: true among them (D12b)':
			{
				state: 'valid',
				ids: ['F-0001', 'F-0003', 'F-0005'],
			},
		'--state stale → the stale ones': { state: 'stale', ids: ['F-0006'] },
		'--state unverifiable → the ones the check cannot verify': {
			state: 'unverifiable',
			ids: ['F-0008'],
		},
		'--state unchecked → the outside facts and the person facts with unchecked: true': {
			state: 'unchecked',
			ids: ['F-0004', 'F-0005'],
		},
		'--state forgotten → the forgotten ones': { state: 'forgotten', ids: ['F-0007'] },
		'--state orphan → the fact files no pointer names': { state: 'orphan', ids: ['F-0009'] },
	}

	for (const [name, row] of Object.entries(stateRows))
		it(name, async () => {
			const workspace = ledgerWithEveryState()

			const { output } = await runIn({
				workspace,
				argv: ['list', '--state', row.state],
				exitCode: 0,
			})

			expect(leadingIdsOf(outputLinesOf(output)).sort()).toEqual(row.ids)
		})

	it('--state all → every fact file: superseded, orphan and unreadable ones too', async () => {
		const workspace = ledgerWithEveryState()

		const { output } = await runIn({ workspace, argv: ['list', '--state', 'all'], exitCode: 0 })

		const lines = outputLinesOf(output)
		function lineOf(id: string): string {
			return (
				lines.find((line) => line.startsWith(id)) ?? lines.find((line) => line.includes(id)) ?? ''
			)
		}
		expect({
			ids: leadingIdsOf(lines).sort(),
			superseded: lineOf('F-0002').includes('superseded by F-0003'),
			orphan: lineOf('F-0009').includes('orphan'),
			unreadable: lineOf('F-0010').includes('unreadable'),
			unreadablePath: lineOf('F-0010').includes(join(workspace.folder, 'F-0010.json')),
		}).toEqual({
			ids: [
				'F-0001',
				'F-0002',
				'F-0003',
				'F-0004',
				'F-0005',
				'F-0006',
				'F-0007',
				'F-0008',
				'F-0009',
				'F-0010',
			],
			superseded: true,
			orphan: true,
			unreadable: true,
			unreadablePath: true,
		})
	})

	it('--about <Tag> → the facts whose subject holds that tag, never one that has it only as a parent (D12c)', async () => {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })
		recordInto({
			workspace,
			draft: factDraft({
				question: 'Is DD_1 required in D?',
				subject: {
					package: 'core-test',
					tags: [{ tag: 'DD_1', parent: 'D' }],
					attributes: [],
					codes: [],
					methods: [],
				},
			}),
		})

		const { output } = await runIn({ workspace, argv: ['list', '--about', 'D'], exitCode: 0 })

		expect(leadingIdsOf(outputLinesOf(output))).toEqual(['F-0001'])
	})

	it("--json → { facts: [view...] }: the views of every key's current fact", async () => {
		const workspace = ledgerWithEveryState()

		const { output } = await runIn({ workspace, argv: ['list', '--json'], exitCode: 0 })

		const parsed: { facts: FactView[] } = JSON.parse(output)
		expect(parsed.facts.map((view) => [view.id, view.state, view.current]).sort()).toEqual([
			['F-0001', 'valid', true],
			['F-0003', 'valid', true],
			['F-0004', 'unchecked', true],
			['F-0005', 'valid', true],
			['F-0006', 'stale', true],
			['F-0007', 'forgotten', true],
			['F-0008', 'unverifiable', true],
		])
	})

	it('--state all --json → every fact file, the unreadable one without a fact', async () => {
		const workspace = ledgerWithEveryState()

		const { output } = await runIn({
			workspace,
			argv: ['list', '--state', 'all', '--json'],
			exitCode: 0,
		})

		const parsed: { facts: FactView[] } = JSON.parse(output)
		function viewOf(id: string): FactView | undefined {
			return parsed.facts.find((view) => view.id === id)
		}
		expect({
			count: parsed.facts.length,
			superseded: viewOf('F-0002')?.current,
			orphan: viewOf('F-0009')?.state,
			unreadable: [viewOf('F-0010')?.state, viewOf('F-0010')?.fact ?? null, viewOf('F-0010')?.path],
		}).toEqual({
			count: 10,
			superseded: false,
			orphan: 'orphan',
			unreadable: ['unreadable', null, join(workspace.folder, 'F-0010.json')],
		})
	})

	it('an unknown state → usage, exit 2, naming the states', async () => {
		const workspace = ledgerWithEveryState()

		const { output } = await runIn({ workspace, argv: ['list', '--state', 'dusty'], exitCode: 2 })

		for (const state of [...STATES, 'all']) expect(output).toContain(state)
	})
})

describe('facts show <id>', () => {
	/** A fact with three evidence entries, recorded and then asked again (a `reused` line). */
	function workspaceWithHistory(): FactsWorkspace {
		const workspace = createFactsWorkspace()
		const draft = factDraft({
			evidence: [
				{ file: 'example-0000/one', from: 1, to: 2, quote: 'a quote' },
				{ file: 'example-0000/two', from: 3, to: 4, quote: 'another quote' },
				{ file: 'example-0000/two', from: 5, to: 6, quote: 'a third quote' },
			],
		})
		recordInto({ workspace, draft, lot: '0025', ask: 'q1' })
		recordInto({ workspace, draft, lot: '0025', ask: 'q2' })
		return workspace
	}

	it('→ the question, answer, source, effort, state now, sources, evidence count and the history in order', async () => {
		const workspace = workspaceWithHistory()

		const { output } = await runIn({ workspace, argv: ['show', 'F-0001'], exitCode: 0 })

		expect({
			question: output.includes('Is D required in A?'),
			answer: output.includes('D is required in A.'),
			source: output.includes('standard'),
			effort: output.includes('medium'),
			state: output.includes('valid'),
			sources: output.includes('example-0000'),
			evidence: /\b3\b/.test(output),
			historyInOrder: output.indexOf('created') < output.indexOf('reused'),
			created: output.includes('created'),
		}).toEqual({
			question: true,
			answer: true,
			source: true,
			effort: true,
			state: true,
			sources: true,
			evidence: true,
			historyInOrder: true,
			created: true,
		})
	})

	it('the state shown is the state now: stale when the check says so', async () => {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })

		const { output } = await answeredWith({
			run: runFacts({
				argv: ['show', 'F-0001'],
				cwd: workspace.cwd,
				environment: workspace.environment,
				check: () => ({ state: 'stale' }),
			}),
			exitCode: 0,
		})

		expect(output).toContain('stale')
	})

	it('--json → { fact, state, current, history }', async () => {
		const workspace = workspaceWithHistory()

		const { output } = await runIn({ workspace, argv: ['show', 'F-0001', '--json'], exitCode: 0 })

		expect(JSON.parse(output)).toEqual({
			fact: readFactFile({ folder: workspace.folder, id: 'F-0001' }),
			state: 'valid',
			current: true,
			history: readHistoryFile({ folder: workspace.folder, id: 'F-0001' }),
		})
	})

	it('a superseded fact → current false', async () => {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })
		recordInto({
			workspace,
			draft: factDraft({ effort: 'high', answer: { verdict: 'no', value: null, text: 'No.' } }),
		})

		const { output } = await runIn({ workspace, argv: ['show', 'F-0001', '--json'], exitCode: 0 })

		expect(JSON.parse(output)).toMatchObject({ current: false, fact: { supersededBy: 'F-0002' } })
	})

	it('an unknown id → exit 1 naming the closest ids', async () => {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })
		recordInto({ workspace, draft: factDraft({ question: 'Is DD_1 required in D?' }) })

		const { output } = await runIn({ workspace, argv: ['show', 'F-0003'], exitCode: 1 })

		expect([
			output.includes('F-0003'),
			output.includes('F-0001'),
			output.includes('F-0002'),
		]).toEqual([true, true, true])
	})
})

describe('facts forget <id> --reason <text>', () => {
	/** A ledger with one valid fact F-0001. */
	function workspaceWithOneFact(): FactsWorkspace {
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })
		return workspace
	}

	it('→ state forgotten, a forgotten line holding the reason, the file kept, exit 0', async () => {
		const workspace = workspaceWithOneFact()
		const before = readFactFile({ folder: workspace.folder, id: 'F-0001' })

		await runIn({
			workspace,
			argv: ['forget', 'F-0001', '--reason', 'no longer true'],
			exitCode: 0,
		})

		expect({
			fact: readFactFile({ folder: workspace.folder, id: 'F-0001' }),
			events: readHistoryFile({ folder: workspace.folder, id: 'F-0001' }).map((line) => line.event),
			forgotten: readHistoryFile({ folder: workspace.folder, id: 'F-0001' }).at(-1),
		}).toEqual({
			fact: { ...before, state: 'forgotten' },
			events: ['created', 'forgotten'],
			forgotten: expect.objectContaining({
				event: 'forgotten',
				fact: 'F-0001',
				reason: 'no longer true',
			}),
		})
	})

	it('a reason longer than 200 characters is cut at 200 before the history line', async () => {
		const workspace = workspaceWithOneFact()

		await runIn({ workspace, argv: ['forget', 'F-0001', '--reason', LONG_REASON], exitCode: 0 })

		expect(readHistoryFile({ folder: workspace.folder, id: 'F-0001' }).at(-1)?.reason).toBe(
			LONG_REASON.slice(0, REASON_LIMIT),
		)
	})

	it('again → exit 0 saying it was forgotten already, no second line', async () => {
		const workspace = workspaceWithOneFact()
		await runIn({ workspace, argv: ['forget', 'F-0001', '--reason', 'first'], exitCode: 0 })

		const { output } = await runIn({
			workspace,
			argv: ['forget', 'F-0001', '--reason', 'second'],
			exitCode: 0,
		})

		expect({
			said: /already/i.test(output),
			forgottenLines: readHistoryFile({ folder: workspace.folder, id: 'F-0001' }).filter(
				(line) => line.event === 'forgotten',
			).length,
		}).toEqual({ said: true, forgottenLines: 1 })
	})

	it('--json → { id, state: forgotten, already: false }, then already: true on a second forget (D12c)', async () => {
		const workspace = workspaceWithOneFact()

		const first = await runIn({
			workspace,
			argv: ['forget', 'F-0001', '--reason', 'first', '--json'],
			exitCode: 0,
		})
		const second = await runIn({
			workspace,
			argv: ['forget', 'F-0001', '--reason', 'second', '--json'],
			exitCode: 0,
		})

		expect([JSON.parse(first.output), JSON.parse(second.output)]).toEqual([
			{ id: 'F-0001', state: 'forgotten', already: false },
			{ id: 'F-0001', state: 'forgotten', already: true },
		])
	})

	const noReason: Record<string, string[]> = {
		'no --reason': ['forget', 'F-0001'],
		'an empty --reason': ['forget', 'F-0001', '--reason', ''],
		'a blank --reason': ['forget', 'F-0001', '--reason', '   '],
	}

	for (const [name, argv] of Object.entries(noReason))
		it(`${name} → usage, exit 2, nothing written`, async () => {
			const workspace = workspaceWithOneFact()
			const before = readFactFile({ folder: workspace.folder, id: 'F-0001' })

			await runIn({ workspace, argv, exitCode: 2 })

			expect({
				fact: readFactFile({ folder: workspace.folder, id: 'F-0001' }),
				events: readHistoryFile({ folder: workspace.folder, id: 'F-0001' }).map(
					(line) => line.event,
				),
			}).toEqual({ fact: before, events: ['created'] })
		})

	it('an unknown id → exit 1, nothing written', async () => {
		const workspace = workspaceWithOneFact()

		await runIn({ workspace, argv: ['forget', 'F-0042', '--reason', 'gone'], exitCode: 1 })

		expect({
			made: existsSync(join(workspace.folder, 'F-0042.json')),
			events: readHistoryFile({ folder: workspace.folder, id: 'F-0001' }).map((line) => line.event),
		}).toEqual({ made: false, events: ['created'] })
	})
})

describe('facts: the data folder inside a git work tree → every verb refused, exit 2, nothing created', () => {
	const verbs: Record<string, string[]> = {
		list: ['list'],
		show: ['show', 'F-0001'],
		forget: ['forget', 'F-0001', '--reason', 'gone'],
	}

	for (const [verb, argv] of Object.entries(verbs))
		it(
			`${verb} → exit 2 naming the facts folder, the work tree and the fix, the cwd being outside it`,
			async () => {
				const repository = createScratchRepository()
				const dataHome = join(repository, 'data')
				const facts = join(dataHome, 'dialecte', 'facts')

				const { output } = await answeredWith({
					run: runFacts({
						argv,
						cwd: temporaryFolder('facts-cwd-'),
						environment: { XDG_DATA_HOME: dataHome, HOME: temporaryFolder('facts-home-') },
						check: CHECK,
					}),
					exitCode: 2,
				})

				expect({
					names: [
						output.includes(facts),
						output.includes('XDG_DATA_HOME'),
						/work tree/i.test(output),
					],
					created: existsSync(join(dataHome, 'dialecte')),
				}).toEqual({ names: [true, true, true], created: false })
			},
			STORE_CASE_TIMEOUT,
		)

	it(
		'the cwd inside a work tree and the data folder outside it → list exits 0 (D12c: only the data folder counts)',
		async () => {
			const workspace = createFactsWorkspace()

			await answeredWith({
				run: runFacts({
					argv: ['list'],
					cwd: createScratchRepository(),
					environment: workspace.environment,
					check: CHECK,
				}),
				exitCode: 0,
			})
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('facts: the default check (no injected check) is the command check, factCheckOf', () => {
	it("a standard fact whose files key is not the folder's → list shows it stale", async () => {
		const standards = createStandardWorkspace({
			standards: { 'example-0000': { 'one.md': 'The first file.\n' } },
		})
		const workspace = createFactsWorkspace()
		recordInto({ workspace, draft: factDraft() })

		const { output } = await answeredWith({
			run: runFacts({
				argv: ['list'],
				cwd: standards.cwd,
				environment: { ...workspace.environment, DIALECTE_STANDARD: standards.root },
			}),
			exitCode: 0,
		})

		expect(outputLinesOf(output).find((line) => line.startsWith('F-0001'))).toContain('stale')
	})

	it('a schema fact with no dialecte installed → list shows it unverifiable', async () => {
		const workspace = createFactsWorkspace()
		recordInto({
			workspace,
			draft: factDraft({
				source: 'schema',
				sources: [
					{
						kind: 'schema',
						package: '@acme/widget',
						version: '1.0.0',
						definitionHash: 'sha256:aa',
					},
				],
			}),
		})

		const { output } = await answeredWith({
			run: runFacts({
				argv: ['list'],
				cwd: createStandardWorkspace().cwd,
				environment: workspace.environment,
			}),
			exitCode: 0,
		})

		expect(outputLinesOf(output).find((line) => line.startsWith('F-0001'))).toContain(
			'unverifiable',
		)
	})
})

describe('facts: usage', () => {
	const rows: Record<string, string[]> = {
		'no verb': [],
		'an unknown verb': ['frobnicate'],
		'list with an extra word': ['list', 'extra'],
		'list with an unknown option': ['list', '--nope'],
		'list --state without its value': ['list', '--state'],
		'show without an id': ['show'],
		'show with two ids': ['show', 'F-0001', 'F-0002'],
		'forget without an id': ['forget', '--reason', 'gone'],
		'forget with an extra word': ['forget', 'F-0001', 'extra', '--reason', 'gone'],
	}

	for (const [name, argv] of Object.entries(rows))
		it(`${name} → usage, exit 2, nothing created`, async () => {
			const workspace = createFactsWorkspace()

			const { output } = await runIn({ workspace, argv, exitCode: 2 })

			expect({
				usage: COMMAND_MAP.facts.usage.every((line) => output.includes(line)),
				created: existsSync(workspace.dataHome),
			}).toEqual({ usage: true, created: false })
		})

	it(
		'--help → the usage lines of the command map, exit 0',
		() => {
			const result = spawnSync(
				process.execPath,
				[join(import.meta.dirname, '..', 'cli.ts'), 'facts', '--help'],
				{
					encoding: 'utf8',
				},
			)

			expect({
				status: result.status,
				usage: ['dialecte facts list', 'dialecte facts show', 'dialecte facts forget'].every(
					(line) => result.stdout.includes(line),
				),
			}).toEqual({ status: 0, usage: true })
		},
		CLI_SURFACE_CASE_TIMEOUT,
	)
})
