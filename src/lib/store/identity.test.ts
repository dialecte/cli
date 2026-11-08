import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { identityOf, writeRecordFile } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readIdentity } from './identity.ts'

import { describe, expect, it } from 'vitest'

describe('readIdentity', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a valid identity.json → the identity', () => {
		const lotFolder = temporaryFolder('dialecte-identity-')
		writeRecordFile({
			folder: lotFolder,
			name: 'identity.json',
			text: JSON.stringify(identityOf()),
		})

		expect(readIdentity({ lotFolder })).toEqual(identityOf())
	})

	it('no identity.json → undefined', () => {
		const lotFolder = temporaryFolder('dialecte-identity-')

		expect(readIdentity({ lotFolder })).toBeUndefined()
	})

	it('an identity.json that does not parse → undefined', () => {
		const lotFolder = temporaryFolder('dialecte-identity-')
		writeRecordFile({ folder: lotFolder, name: 'identity.json', text: '{"name": ' })

		expect(readIdentity({ lotFolder })).toBeUndefined()
	})
})
