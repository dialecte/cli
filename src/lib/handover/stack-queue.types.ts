/** How `lot approve` queues a lot: its change request alone, or a native stack up to it. */
export type StackQueueRoute = { route: 'single' } | { route: 'stack' }
