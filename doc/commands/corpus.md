# dialecte corpus

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

The open-licence corpora fetched into a cache, and the licensed ones of config.yml

```text
corpus - The open-licence corpora fetched into a cache, and the licensed ones of config.yml

  dialecte corpus fetch [<id>...] [--json]
  dialecte corpus list [--json]
  dialecte corpus check [--json]
  dialecte corpus add <name> --xsd <path> [--instances <folder>]

  fetch - the sources of the shipped manifest (every one, or the ids named): each refused without
          its licence, terms and a known verdict, with an id that names an entry of the cache
          itself, or with a download not pinned by a sha256; each download (no redirect followed, at
          most 512 MiB, aborted after 120 s without data) checked against its pin (a kept one in
          _downloads/ first, so a run without network rebuilds), its archive members kept and
          stripped (at most 1 GiB inflated), a member outside its folder refusing the source, then
          exclude, marker, substitute and wrappers; written to <cache>/<id>/ and named in
          manifest.lock.json once in place; a refused source changes nothing of what it had; one
          fetch writes a cache at a time (fetch.lock: another running fetch refuses the run); the
          cache: $DIALECTE_CORPORA_DIR, else corpora/ in the cli cache folder
          ($XDG_CACHE_HOME/dialecte, else ~/.cache/dialecte); never committed
  list - every open source (fetched; stale: from another manifest entry, without a lock entry the
         cli reads, or a locked file gone; or missing) and every licensed entry of config.yml
         corpora: (present or missing), with its verdict, entry schemas, instances (a folder and its
         globs) and instance count; exit 0 whatever is missing; --json (version 1) is the reader for
         a validation tier
  check - a fetched source whose files no longer match its fetch (edited, missing, added) or its
          manifest entry, and a licensed entry whose files are missing, one line each
  add - writes corpora.<name> of the personal config.yml with absolute paths, its comments kept;
        refused for a name holding a dot or a path that does not exist

exit codes:
  0  list: whatever is missing
  1  fetch: a source refused; check: a problem named
  2  fetch: an unknown source id; add: no --xsd, a name holding a dot, a path that does not exist; a refused config.yml
e.g. dialecte corpus list --json
```

Verbs: `fetch`, `list`, `check`, `add`

Flags: `--json`, `--xsd`, `--instances`
<!-- /dialecte-reference -->
