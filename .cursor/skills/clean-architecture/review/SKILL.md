You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants a **complete Clean Architecture audit** of the entire codebase.

This is the most comprehensive skill. It covers every major concept from the book and provides a full scorecard with prioritized recommendations.

## Your Task: Full Architecture Review

Run all of the following checks in sequence and compile a master report.

---

## Section 1: Project Structure (Screaming Architecture)

From Chapter 21:
> "The architecture of a software system is the shape given to that system by those who build it. The purpose of that shape is to facilitate the development, deployment, operation, and maintenance of the software system contained within it."

Check:
- Does the top-level folder structure reveal the **business domain** (e.g., `OrderManagement/`, `Billing/`, `Inventory/`) or does it reveal the **framework** (e.g., `controllers/`, `models/`, `routes/`)?
- Is there a clear separation into at least the four Clean Architecture layers?
- Is the `main/` or composition root clearly identifiable and separate?

Score: 0-10 points

---

## Section 2: Dependency Rule Compliance

Perform a full dependency scan (same as `/clean-architecture:check`):
- Entities importing from outer layers.
- Use cases importing from adapters or frameworks.
- Adapters importing from frameworks for business reasons (vs. purely for wiring).
- Concrete class references in inner layers.
- Framework-specific types (annotations, decorators) in entities/use cases.

Score: 0-25 points (most critical section)

---

## Section 3: Entity Quality

For each entity in `src/entities/`:
- Does it contain **only** enterprise business rules?
- Is it **framework-independent**?
- Does it enforce its own invariants (validation in constructor/factory)?
- Does it use proper **value objects** for complex attributes?
- Is it **testable without any mocks**?
- Does it use the **EntityId** pattern (typed identity)?

Score: 0-10 points

---

## Section 4: Use Case Design

For each use case:
- Is the **Input Port** (interface) defined in `usecases/ports/input/`?
- Is the **Output Port** (interface) defined in `usecases/ports/output/`?
- Is the **Repository interface** defined in `usecases/ports/output/` (not in adapters)?
- Does the interactor implement the Input Port?
- Does the interactor call the Output Port (not return data directly to the controller)?
- Is the interactor **fully testable with mocks** (no DB, no HTTP)?
- Are there unit tests that cover the happy path and error paths?

Score: 0-15 points

---

## Section 5: Interface Adapters

For each controller:
- Does it only **translate** framework input → use case input model?
- Does it call the **Input Port interface** (not the concrete interactor)?
- Is there **no business logic** in the controller?

For each presenter:
- Does it implement the **Output Port interface**?
- Does it apply the **Humble Object Pattern** (logic in presenter, rendering in view)?
- Is the **View Model** a plain data structure?
- Is the presenter **testable without an HTTP stack**?

For each gateway:
- Does it implement a repository interface **defined in the use case layer**?
- Does it have a **data mapper** (domain entity ↔ persistence model)?
- Does it have an **in-memory implementation** for tests?

Score: 0-15 points

---

## Section 6: SOLID Principles

Check all source files for SOLID violations (same analysis as `/clean-architecture:solid`):
- SRP: Classes with multiple axes of change.
- OCP: Switch/if-else chains requiring modification to extend.
- LSP: Subtypes that violate the contracts of their base types.
- ISP: Large interfaces where clients don't use all methods.
- DIP: Concrete dependencies in inner layers.

Score: 0-10 points

---

## Section 7: Component Principles

Perform component analysis (same as `/clean-architecture:components`):
- ADP: Cycles in the component dependency graph.
- SDP: Stable components depending on volatile ones.
- SAP: Stable concrete components (Zone of Pain) or useless abstractions.
- CCP: Components that change for multiple unrelated reasons.
- CRP: Clients forced to depend on unused classes.

Score: 0-10 points

---

## Section 8: Test Architecture

Check the test structure:
- Are **unit tests** for entities and use cases framework-free?
- Do use case tests use **mocks** for the output port and repository?
- Are **integration tests** in a separate suite from unit tests?
- Do integration tests for gateways use a **real (test) database**?
- Are there **no business logic assertions** in e2e tests (those belong in unit tests)?
- Is the **in-memory repository** pattern used in use case tests?
- Is the **test suite runnable without infrastructure** (DB, network)?

Score: 0-5 points

---

## Section 9: Main Component / Composition Root

Check `src/main/`:
- Is this the **only** place where concrete classes are instantiated?
- Is this the **only** place where dependencies are wired (DI without a framework, or DI framework wiring only here)?
- Does it follow the **plugin pattern** (main wires plugins into the stable core)?
- Is `main/` the most **volatile** component (changes when adding new features, but doesn't break tests of inner layers)?

Score: 0-5 points

---

## Section 10: Boundaries

For each identified architectural boundary:
- Are **boundary interfaces** defined in the inner layer?
- Is data crossing the boundary as **plain data structures** (no entity objects, no framework objects leaking across)?
- Is the boundary documented?
- Is the boundary type appropriate (full vs. partial) given the context?

Score: 0-5 points

---

## Master Scorecard

```
CLEAN ARCHITECTURE AUDIT REPORT
================================
Project: <name>
Date: <date>
Reviewed by: Claude Code Clean Architecture Plugin

SCORECARD:
┌─────────────────────────────────────┬───────┬───────┐
│ Section                             │ Score │  Max  │
├─────────────────────────────────────┼───────┼───────┤
│ 1. Screaming Architecture           │  __   │  10   │
│ 2. Dependency Rule                  │  __   │  25   │
│ 3. Entity Quality                   │  __   │  10   │
│ 4. Use Case Design                  │  __   │  15   │
│ 5. Interface Adapters               │  __   │  15   │
│ 6. SOLID Principles                 │  __   │  10   │
│ 7. Component Principles             │  __   │  10   │
│ 8. Test Architecture                │  __   │   5   │
│ 9. Main / Composition Root          │  __   │   5   │
│ 10. Boundaries                      │  __   │   5   │
├─────────────────────────────────────┼───────┼───────┤
│ TOTAL                               │  __   │ 100   │
└─────────────────────────────────────┴───────┴───────┘

GRADE:
  90-100: Excellent — Clean Architecture properly implemented
  75-89:  Good — Minor violations to address
  50-74:  Fair — Significant issues requiring attention
  25-49:  Poor — Major architectural problems
  0-24:   Critical — Architecture is not Clean, major refactoring needed
```

---

## Prioritized Recommendations

### P1 — Critical (fix before any new feature development)
[List all dependency rule violations, security risks from tight coupling]

### P2 — High (fix in current or next sprint)
[List entity quality issues, missing ports/boundaries]

### P3 — Medium (plan for refactoring)
[List SOLID violations, component issues]

### P4 — Low (improve when convenient)
[List test coverage gaps, documentation, naming conventions]

---

## Quick Win Actions

List 3-5 changes that can be made immediately for maximum architectural improvement.

---

## Long-term Roadmap

If significant restructuring is needed, provide a phased migration plan:
- Phase 1: Add interfaces at violation points (non-breaking)
- Phase 2: Move concrete implementations to outer layers
- Phase 3: Reorganize folder structure (may require refactoring)
- Phase 4: Add linting rules to prevent regressions

## Output
The full scorecard, all violations with file:line references, prioritized recommendations, and the quick win list.
