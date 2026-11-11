import type { RelayedSample } from './relayed-samples.types.ts'

/**
 * The conceal parameter written with leading zeros is still conceal (a terminal reads `08` and `008` as 8): dropped.
 * The same digits inside an extended colour stay a colour value.
 */
export const CONCEAL_NUMBER_SAMPLES: readonly RelayedSample[] = [
	{ title: 'the conceal sequence 08 alone', line: 'a\u001b[08mhidden', printed: 'ahidden' },
	{ title: 'the conceal sequence 008 alone', line: 'a\u001b[008mhidden', printed: 'ahidden' },
	{
		title: 'conceal 08 between two parameters',
		line: 'a\u001b[1;08;32mb',
		printed: 'a\u001b[1;32mb',
	},
	{
		title: 'conceal 008 between two parameters',
		line: 'a\u001b[1;008;32mb',
		printed: 'a\u001b[1;32mb',
	},
	{
		title: 'the colour value 08 of a 256 colour',
		line: 'a\u001b[38;5;08mb',
		printed: 'a\u001b[38;5;08mb',
	},
]
