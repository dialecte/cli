import { transitionOf } from './store-records.ts'

import type { Transition } from '../src/lib/store/store.types.ts'

/** The canceled source lot the carry cases start from (index 0005), its branch, and the branch the rebuilt lot takes. */
export const CARRY_SOURCE_NAME = '0005-repo-source'
export const CARRY_SOURCE_BRANCH = 'feat/source'
export const CARRY_REBUILT_BRANCH = 'feat/rebuilt'
export const CARRY_REBUILT_FEATURE = 'rebuilt'

/** The time the cases start the rebuilt lot at. */
export const CARRY_NOW = new Date('2026-11-24T09:00:00.000Z')

/** The time the tdd runs of the rebuilt lot are made at (the source's are `SOURCE_TDD_START` and after). */
export const TDD_NOW = new Date('2026-11-24T10:00:00.000Z')

/** The time of the source lot's first tdd run, and the gap between its runs: never the time of the rebuilt lot's. */
export const SOURCE_TDD_START = new Date('2026-11-20T09:00:00.000Z')
export const SOURCE_TDD_STEP_MS = 60_000

/** The test file and the cases of the source's ledger, and the production state its receipts name. */
export const CARRY_TEST_FILE = 'src/dataflow/subscribe.test.ts'
export const CARRY_CASES: readonly string[] = [
	'subscribes one data set',
	'keeps an existing ExtRef',
]
export const CARRY_PRODUCTION_HASH = 'a'.repeat(64)
export const CARRY_PRODUCTION_FILE = 'src/dataflow/subscribe.ts'
export const CARRY_PRODUCTION_CONTENT_HASH = 'b'.repeat(64)

/** A commit id no repository holds. */
export const UNREADABLE_BASE = 'f'.repeat(40)

/** The source's lot file (`.dialecte/lot.json`) as the cases write it, and a text that is no JSON. */
export const CARRY_DECLARATION_TEXT = '{ "accept": [] }\n'
export const UNREADABLE_DECLARATION_TEXT = '{ "accept": ['

/** The ledger texts that are no ledger of this cli. */
export const UNREADABLE_LEDGER_TEXT = '{ "version": 3, "entries": ['

/** The folder of the source's lot file, and the ledger's file name, in the worktree. */
export const DECLARATION_PATH = '.dialecte/lot.json'
export const LEDGER_FILE_NAME = 'dialecte-tdd.json'

/** The transitions after a lot's start that cancel it: the stop that closed it. */
export const CARRY_CANCELED: Transition[] = [
	{ ...transitionOf({ seq: 2, state: 'canceled', kind: 'stop' }), lot: CARRY_SOURCE_NAME },
]
