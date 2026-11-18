/** Why a rehearsal marker cannot tell whether its owner runs. */
export const REHEARSAL_RUN_UNKNOWN = {
	noMarker: 'no rehearsal marker',
	unparsable: 'the rehearsal marker does not parse: being written, or broken',
	noPid: 'the rehearsal marker names no pid',
	noStartTime: 'the rehearsal marker holds no start time to compare: pid {pid}',
	unreadableStartTime: 'the start time of pid {pid} cannot be read',
} as const
