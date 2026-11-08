import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import { reachFrom } from '../../../test/import-reach.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { writeRecordFile } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readAbandonedMarker, readRunMarker } from './handover-marker-read.ts'

import { describe, expect, it } from 'vitest'

const READ_MODULE = join(import.meta.dirname, 'handover-marker-read.ts')
const RUN_MARKER_MODULE = join(import.meta.dirname, 'handover-run-marker.ts')
const ABANDONED_MARKER_MODULE = join(import.meta.dirname, 'handover-abandoned-marker.ts')

describe('readRunMarker', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('running.json naming a live pid → the marker', () => {
		const folder = temporaryFolder('dialecte-markers-')
		writeRecordFile({
			folder,
			name: 'running.json',
			text: JSON.stringify({ pid: process.pid, startedAt: '2026-11-08T10:00:00.000Z' }),
		})

		expect(readRunMarker(folder)).toEqual({
			pid: process.pid,
			startedAt: '2026-11-08T10:00:00.000Z',
		})
	})

	it('running.json naming a dead pid → undefined', () => {
		const folder = temporaryFolder('dialecte-markers-')
		writeRecordFile({
			folder,
			name: 'running.json',
			text: JSON.stringify({ pid: deadPid(), startedAt: '2026-11-08T10:00:00.000Z' }),
		})

		expect(readRunMarker(folder)).toBeUndefined()
	})

	it('running.json that does not parse → undefined', () => {
		const folder = temporaryFolder('dialecte-markers-')
		writeRecordFile({ folder, name: 'running.json', text: '{"pid": ' })

		expect(readRunMarker(folder)).toBeUndefined()
	})

	it('no running.json → undefined', () => {
		const folder = temporaryFolder('dialecte-markers-')

		expect(readRunMarker(folder)).toBeUndefined()
	})
})

describe('readAbandonedMarker', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('abandoned.json with a time → that time', () => {
		const folder = temporaryFolder('dialecte-markers-')
		writeRecordFile({
			folder,
			name: 'abandoned.json',
			text: JSON.stringify({ at: '2026-11-08T10:00:00.000Z' }),
		})

		expect(readAbandonedMarker(folder)).toEqual({ at: '2026-11-08T10:00:00.000Z' })
	})

	it('abandoned.json that does not parse → still marks the folder, with no time', () => {
		const folder = temporaryFolder('dialecte-markers-')
		writeRecordFile({ folder, name: 'abandoned.json', text: 'not json' })

		expect(readAbandonedMarker(folder)).toEqual({ at: '' })
	})

	it('no abandoned.json → undefined', () => {
		const folder = temporaryFolder('dialecte-markers-')

		expect(readAbandonedMarker(folder)).toBeUndefined()
	})
})

describe('the marker readers reach no child process', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the read module and the abandoned-marker module → no node:child_process import, directly or through what they import', () => {
		const folder = temporaryFolder('dialecte-markers-')

		expect({
			reading: readRunMarker(folder),
			childProcessImporters: [
				...reachFrom(READ_MODULE).childProcessImporters,
				...reachFrom(ABANDONED_MARKER_MODULE).childProcessImporters,
			],
		}).toEqual({ reading: undefined, childProcessImporters: [] })
	})

	it('handover-run-marker.ts → takes readRunMarker from the process-free module instead of defining it', () => {
		expect({
			reachesReadModule: reachFrom(RUN_MARKER_MODULE).files.includes(READ_MODULE),
			readsRunMarkerAlone: readRunMarker(temporaryFolder('dialecte-markers-')),
		}).toEqual({ reachesReadModule: true, readsRunMarkerAlone: undefined })
	})
})
