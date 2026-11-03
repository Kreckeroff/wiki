# Performance bug patterns

High-yield performance defect classes and what to inspect or grep for each. A performance bug is
still a bug: confirm it with the same failing-test discipline — assert a *bound* (query count,
call count, memory ceiling, complexity via input-doubling) rather than wall-clock time, so the
repro is deterministic and doesn't flake on a slow machine. Only report what a user or the
infrastructure bill would actually feel; micro-inefficiencies nobody can measure are noise, not
findings.

## N+1 and chatty data access

- A query/fetch **inside a loop** over a collection that came from another query — ORM lazy
  relations walked per item (`for order in orders: order.customer.name`), per-item `await fetch`,
  per-row RPC. Grep: loop bodies containing `select|find|fetch|query|get_.*_by`.
- Missing eager-load/batch API where the ORM offers one (`select_related`/`joinedload`/
  `includes`/dataloader).
- **Confirm by counting, not timing:** wrap the repro in the ORM's query counter
  (`assertNumQueries`, `sqlalchemy` event listener, a fetch-mock call count) and assert it stays
  flat as the collection grows.

## Unbounded result sets and missing pagination

- List endpoints or queries with no `LIMIT`/page size, loading a whole table into memory, or
  pagination params accepted but never applied (grep the handler for `limit`/`offset`/`cursor`
  actually reaching the query).
- Client-side "fetch everything, filter in memory" where the store grows with production data.
- OFFSET-based pagination on large tables (each page scans all prior rows) where a cursor/keyset
  is available.

## Accidental quadratic (or worse) complexity

- A linear scan inside a loop: `list.includes`/`in list`/`.index()`/`.find()` per iteration where
  a set/map lookup was intended; nested loops joining two collections by key.
- Repeated string/array concatenation building an accumulator (`s += chunk` in a loop, spread-
  concat `[...acc, item]` per element).
- Sorting or deduping inside a loop instead of once outside.
- **Confirm by doubling:** run the operation at n and 2n synthetic input; assert the work counter
  (comparisons, iterations — instrument or monkey-patch) grows ~2×, and fail when it grows ~4×.

## Unbounded growth and leaks

- Caches/memos with no eviction (`dict`/`Map` used as a cache, `lru_cache` without `maxsize`),
  listeners/subscriptions registered per call or per render and never removed, intervals/timers
  never cleared, per-request state stored on a module-level singleton.
- Reading a whole file/response into memory (`read()`, `json()` on huge payloads) where streaming
  is available and the input is user-sized.
- **Confirm** with a call-count assertion on the registration (e.g. listener count after N
  mount/unmount cycles) or a memory-ceiling check over repeated iterations.

## Missing memoization / repeated recomputation on hot paths

- The same expensive pure computation (parse, compile, regex build, crypto, schema validation)
  re-done per call/per render — grep for `re.compile`/`new RegExp`/schema construction inside
  functions called in loops or render paths.
- Frontend: derived data rebuilt every render creating new identities that defeat downstream
  memoization; effects with over-broad dependencies re-firing on every state change.

## Blocking and serialization where concurrency was intended

- Synchronous/blocking I/O on an async runtime's event loop (`requests`/`fs.readFileSync`/CPU
  loops in async handlers).
- `await` inside a loop for independent operations that could batch (`Promise.all`/`gather`) —
  latency = n × RTT instead of 1 × RTT.
- A coarse lock held across I/O, serializing all callers.

## Confirmation notes

- Prefer **counting assertions** (queries, calls, allocations, iterations) — deterministic and
  CI-safe. Use input-doubling ratios for complexity. Use wall-clock only as a last resort, with a
  generous bound and a note that it's environment-sensitive.
- Severity follows reach × growth: an O(n²) on a path capped at n=10 is Low; an N+1 on every
  page load of a core screen is High even though each query is fast.
- If the fix trades memory for speed (or vice versa), say so in the suggested-fix note — the
  team owns that trade-off, not the hunt.
