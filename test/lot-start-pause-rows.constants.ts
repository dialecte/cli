/** The cases of the overlap check's one re-read of a lot whose only evidence of `canceled` is `abandoned.json`. */
import {
	markerBesideLiveRunLot,
	markerOnlyLot,
	plainOpenLot,
	registryAbandonedLot,
	transitionCanceledLot,
} from './lot-start-pause-lots.ts'
import { REREAD_PAUSE_MS } from './simulated-lot.constants.ts'

import type { PauseRow } from './lot-start-simulate-cases.types.ts'

export const PAUSE_ROWS: PauseRow[] = [
	{
		title:
			'abandoned.json alone, taken back during the pause -> the lot is open again: refused as an overlap',
		lot: markerOnlyLot,
		removeMarker: true,
		exitCode: 2,
		pauses: [REREAD_PAUSE_MS],
	},
	{
		title:
			'abandoned.json alone, still there after the pause -> the lot is canceled: the check passes',
		lot: markerOnlyLot,
		removeMarker: false,
		exitCode: 0,
		pauses: [REREAD_PAUSE_MS],
	},
	{
		title:
			'a lot canceled by a transition beside a marker-only lot -> one re-read, for the marker-only lot alone',
		lot: (start) => {
			transitionCanceledLot(start)
			return markerOnlyLot(start)
		},
		removeMarker: false,
		exitCode: 0,
		pauses: [REREAD_PAUSE_MS],
	},
	{
		title:
			'a lot whose registry entry is abandoned beside a marker-only lot -> one re-read, for the marker-only lot alone',
		lot: (start) => {
			registryAbandonedLot(start)
			return markerOnlyLot(start)
		},
		removeMarker: false,
		exitCode: 0,
		pauses: [REREAD_PAUSE_MS],
	},
	{
		title: 'an open lot with no marker -> refused as an overlap with no re-read',
		lot: plainOpenLot,
		removeMarker: false,
		exitCode: 2,
		pauses: [],
	},
	{
		title: 'a lot canceled by a transition alone -> canceled with no re-read: the check passes',
		lot: transitionCanceledLot,
		removeMarker: false,
		exitCode: 0,
		pauses: [],
	},
	{
		title:
			'abandoned.json beside a live run marker -> the lot is open: no re-read, refused as an overlap',
		lot: markerBesideLiveRunLot,
		removeMarker: false,
		exitCode: 2,
		pauses: [],
	},
	{
		title:
			'a simulated start, an open lot with no marker -> no re-read, the overlap is a finding and the start goes on',
		lot: plainOpenLot,
		removeMarker: false,
		run: 'simulate',
		exitCode: 0,
		pauses: [],
		findings: ['overlap'],
	},
	{
		title: 'a simulated start, a lot canceled by a transition alone -> no re-read, no finding',
		lot: transitionCanceledLot,
		removeMarker: false,
		run: 'simulate',
		exitCode: 0,
		pauses: [],
		findings: [],
	},
	{
		title:
			'a simulated start, abandoned.json beside a live run marker -> no re-read, the open lot is an overlap finding',
		lot: markerBesideLiveRunLot,
		removeMarker: false,
		run: 'simulate',
		exitCode: 0,
		pauses: [],
		findings: ['overlap'],
	},
	{
		title:
			'a simulated start, abandoned.json alone still there after the pause -> one re-read, the lot is canceled: no finding',
		lot: markerOnlyLot,
		removeMarker: false,
		run: 'simulate',
		exitCode: 0,
		pauses: [REREAD_PAUSE_MS],
		findings: [],
	},
	{
		title:
			'a simulated start, abandoned.json alone taken back during the pause -> one re-read, the open lot is an overlap finding, the start goes on',
		lot: markerOnlyLot,
		removeMarker: true,
		run: 'simulate',
		exitCode: 0,
		pauses: [REREAD_PAUSE_MS],
		findings: ['overlap'],
	},
]
