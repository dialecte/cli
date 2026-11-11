/** The real lots `lot wait` returns on at once. */
import { questionWith } from './lot-questions.ts'
import { transitionOf } from './store-records.ts'

import type { AtOnceRow } from './lot-wait-real-cases.types.ts'

export const AT_ONCE_ROWS: AtOnceRow[] = [
	{
		title: 'ready by its last transition',
		lot: { later: [transitionOf({ seq: 2, state: 'ready', kind: 'ready' })] },
		exitCode: 0,
		state: 'ready',
	},
	{
		title: 'ready by a pending registry entry',
		lot: { registry: 'pending' },
		exitCode: 0,
		state: 'ready',
	},
	{
		title: 'committed by its registry entry',
		lot: { registry: 'committed' },
		exitCode: 0,
		state: 'committed',
	},
	{
		title: 'failed',
		lot: { later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })] },
		exitCode: 1,
		state: 'failed',
	},
	{
		title: 'canceled by its last transition',
		lot: { later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })] },
		exitCode: 1,
		state: 'canceled',
	},
	{
		title: 'a simulated lot with a hand-written canceled transition',
		lot: { simulated: true, later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop' })] },
		exitCode: 1,
		state: 'canceled',
	},
	{
		title: 'canceled by an abandoned registry entry',
		lot: { registry: 'abandoned' },
		exitCode: 1,
		state: 'canceled',
	},
	{
		title: 'input-required, a question open',
		lot: { question: questionWith() },
		exitCode: 3,
		state: 'input-required',
	},
	{
		title: 'working with a limit as its last transition',
		lot: { later: [transitionOf({ seq: 2, kind: 'limit' })] },
		exitCode: 4,
		state: 'working',
	},
]
