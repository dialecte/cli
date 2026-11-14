import { DECLARED_KEY, FULL_WIDTH_NAME } from '../../../../test/standard-selection.constants.ts'
import { standardKeyOf } from './standard-key-of.ts'

import { describe, expect, it } from 'vitest'

describe('standardKeyOf: NFKC, lowercase, only [a-z0-9] kept (D13)', () => {
	const rows: Record<string, { name: string; key: string }> = {
		'a name with a space': { name: 'Example 0000', key: DECLARED_KEY },
		'a folder id with a dash': { name: 'example-0000', key: DECLARED_KEY },
		'capitals, an underscore and a dot': { name: 'EXAMPLE_0000.', key: DECLARED_KEY },
		'full-width characters folded by NFKC': { name: FULL_WIDTH_NAME, key: DECLARED_KEY },
		'letters outside a-z dropped': { name: 'café 1', key: 'caf1' },
		'nothing left': { name: ' -_. ', key: '' },
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(standardKeyOf(row.name)).toBe(row.key)
		})
})
