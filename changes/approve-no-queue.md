### Changed

- **Breaking:** `dialecte lot approve` of a lot queued alone asks the host once which queue it offers the change request, before anything is recorded: a host that allows no auto-merge and has no queue on the base branch is refused (exit 1) naming what to turn on, with no approval recorded and no text sent. It used to record the approval and then fail at the host; running it again answered "already approved", and now refuses again until auto-merge or a queue is turned on. A read the host refuses refuses nothing: the queue goes ahead as before. A stacked lot reads no queue kind (it merges through the host's stack tool).
- `dialecte lot review`'s approve line names the same refusal for a lot queued alone.
- The queued line of `lot approve` names the queue from that one read; the host is no longer asked again after the queue.
