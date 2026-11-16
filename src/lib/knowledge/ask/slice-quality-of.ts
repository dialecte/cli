import { SLICE_QUALITY_ORDER } from './ask.constants.ts'

import type { SliceQuality, SliceQualityOfParams } from './ask.types.ts'

/** The worst verdict of the blocks of the file the slice's lines touch: `good`, `poor` or `unreadable`. */
export function sliceQualityOf(params: SliceQualityOfParams): SliceQuality {
	const { slice, file } = params
	let worst: SliceQuality = 'good'
	for (const block of file.quality.blocks) {
		if (block.to < slice.from || slice.to < block.from) continue
		if (SLICE_QUALITY_ORDER.indexOf(block.verdict) > SLICE_QUALITY_ORDER.indexOf(worst))
			worst = block.verdict
	}
	return worst
}
