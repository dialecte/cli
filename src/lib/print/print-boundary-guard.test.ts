/**
 * The one writer (P1.5): no production file of `src/` prints with a console method or writes a stream itself,
 * outside the print module and the exceptions of the guard's table (each with its reason). The scanner is checked on
 * sample lines in the same case, so a scanner that flags nothing cannot pass for an empty report.
 */
import { join } from 'node:path'

import { guardReportOf } from '../../../test/print-boundary-scan.ts'

import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = join(import.meta.dirname, '..', '..', '..')

describe('the print boundary guard', () => {
	it('every production file of src -> none writes standard output or error outside the print module and the listed exceptions', () => {
		expect(guardReportOf(PACKAGE_ROOT)).toEqual({
			offenders: [],
			staleExceptions: [],
			scannerMisses: [],
		})
	})
})
