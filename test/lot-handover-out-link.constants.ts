import { join } from 'node:path'

import type { OutRow } from './lot-handover-out-link.types.ts'

/** The name of the dangling link, one no temporary folder's name holds. */
export const DANGLING_LINK_NAME = 'dangling-out'

/** The name of what the link points at, which must stay absent. */
export const MISSING_TARGET_NAME = 'missing-target'

export const OUT_ROWS: OutRow[] = [
	{ title: 'the link itself', word: (link) => link },
	{ title: 'a path below the link', word: (link) => join(link, 'handover') },
]
