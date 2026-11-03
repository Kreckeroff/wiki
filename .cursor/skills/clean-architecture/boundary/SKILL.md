You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to define, review, or enforce an **Architectural Boundary**.

The argument after the command describes the boundary context (e.g., "between use cases and database", "between the payment subsystem and the core domain", "partial boundary for the notification module").

## What is an Architectural Boundary?

From the book (Chapter 17 — Boundaries: Drawing Lines):
> "Software architecture is the art of drawing lines that I call boundaries. Those boundaries separate software elements from one another, and restrict those on one side from knowing about those on the other."

Boundaries exist to:
- **Separate things that change at different rates** (policy from detail, business rules from UI).
- **Protect inner layers** from volatile outer layers.
- **Enable independent deployability** and independent developability.
- **Defer decisions** about frameworks, DBs, and UIs until they must be made.

## Types of Boundaries Covered in the Book

### 1. Full Boundary (Chapter 24 — Partial Boundaries)
A complete architectural boundary with:
- A boundary interface (Input Port) in the inner layer.
- A boundary interface (Output Port) in the inner layer.
- Concrete implementations in the outer layer.
- Dependency inversion across the boundary.

Use when: Systems are expected to be deployed as separate services or need strict enforcement.

### 2. Partial Boundary — One-Dimensional (Strategy Pattern)
Implement the interfaces but package them together in the same deployable unit.
Use when: Full separation may be needed in the future but isn't yet required.

### 3. Partial Boundary — Façade Pattern
Use a Façade to define a simplified boundary without full DIP.
Use when: The boundary is stable enough that direction of dependency is acceptable.

### 4. The Main Boundary
The Main component is on the other side of all boundaries — it creates and wires everything.

## Your Task

### Step 1: Identify What is Being Separated
Determine:
- What is the **stable, high-level policy** (inner side)?
- What is the **volatile, low-level detail** (outer side)?
- What **interfaces** need to exist at the boundary?

### Step 2: Define Boundary Interfaces

For each boundary crossing, create interface files in the **inner** layer:

```
src/
├── usecases/
│   └── ports/
│       ├── input/          ← Boundary interfaces the outer layer calls IN
│       └── output/         ← Boundary interfaces the outer layer must implement
```

### Step 3: Implement the Full Boundary (if applicable)

**Input Side** (outer layer calls inner layer):
```typescript
// Inner layer defines the interface
// src/usecases/ports/input/I<BoundaryName>InputPort.ts
export interface I<BoundaryName>InputPort {
  execute(request: <BoundaryName>Request): Promise<void>;
}
```

**Output Side** (inner layer calls outer layer — DIP required):
```typescript
// Inner layer defines what it needs
// src/usecases/ports/output/I<BoundaryName>OutputPort.ts
export interface I<BoundaryName>OutputPort {
  send(data: <BoundaryName>Response): void;
}
```

The outer layer (adapters) implements these interfaces:
```typescript
// Outer layer satisfies the contract
// src/adapters/<type>/<BoundaryName>Adapter.ts
import { I<BoundaryName>OutputPort } from '../../usecases/ports/output/I<BoundaryName>OutputPort';

export class <BoundaryName>Adapter implements I<BoundaryName>OutputPort {
  send(data: <BoundaryName>Response): void {
    // Translate to framework-specific format
  }
}
```

### Step 4: Subsystem Boundary (Between High-Level Components)

When drawing a boundary between two major subsystems (e.g., `Billing` and `Inventory`):

```
src/
├── billing/
│   ├── entities/
│   ├── usecases/
│   │   └── ports/
│   │       └── output/
│   │           └── IInventoryQueryPort.ts  ← Billing defines what it needs
│   └── adapters/
└── inventory/
    ├── entities/
    ├── usecases/
    └── adapters/
        └── InventoryQueryAdapter.ts        ← Inventory satisfies billing's interface
```

The `Billing` subsystem does NOT import from `Inventory` directly. It imports only from the interface it defines, and the adapter in `Inventory` implements it.

### Step 5: Partial Boundary (Strategy)

When a full boundary is overkill but you want to preserve the option:

```typescript
// Keep the interface in place but co-locate impl in the same package
// Mark it clearly so future teams can split it

// src/usecases/ports/output/I<Name>Service.ts
/** @partial-boundary — may be extracted to a separate deployable in future */
export interface I<Name>Service {
  process(data: <Name>Data): Promise<<Name>Result>;
}
```

### Step 6: Document the Boundary Decision

Create or update `src/ARCHITECTURE.md`:
```markdown
## Boundary: <Name>

**Separates**: <Inner> (stable policy) from <Outer> (volatile detail)

**Type**: Full | Partial (Strategy) | Partial (Façade)

**Interfaces defined in inner layer**:
- `usecases/ports/input/I<Name>InputPort` — called by outer → inner
- `usecases/ports/output/I<Name>OutputPort` — implemented by outer, called by inner

**Reason for this boundary**:
- <Outer> changes frequently (e.g., DB schema, HTTP API, third-party)
- <Inner> changes rarely (business rules)
- Allows swapping <Outer> without touching <Inner>

**When to upgrade to full boundary**: [condition, e.g., "if we need to deploy billing as a microservice"]
```

### Step 7: Verify Boundary Integrity

Check that:
1. No import crosses the boundary in the wrong direction.
2. All cross-boundary data is passed as **simple data structures** (no domain objects leaking out, no framework objects leaking in).
3. The boundary interface lives in the **inner** layer.
4. The implementation lives in the **outer** layer.

## Policy and Level

From Chapter 19:
- **Level** = the distance from inputs and outputs. The farther from I/O, the higher the level.
- High-level policies (business rules) should depend on lower-level details **only through interfaces** (boundaries).
- Low-level details (DB, HTTP) change frequently; high-level policies change rarely.

## Stable vs. Volatile Components (SDP/SAP)
- Components on the **inner side** of a boundary should be **more stable** (fewer incoming changes).
- Components on the **outer side** should be **more volatile** (change often).
- If a stable component depends on a volatile component — **add an interface at the boundary**.

## Validation Checklist

- [ ] Boundary interfaces are defined in the **inner** layer.
- [ ] Outer layer code depends on boundary interfaces, not on inner implementations.
- [ ] Cross-boundary data uses **plain data structures** (no entity objects, no framework objects).
- [ ] The boundary type is documented (full vs. partial + reason).
- [ ] Import rules are enforced (lint rules, module boundaries, ArchUnit, etc.).
- [ ] Main component wires together across boundaries.

## Output
After creating/reviewing boundary files, provide:
1. A boundary diagram showing what's on each side.
2. The interfaces created and where they live.
3. The dependency direction enforced.
4. Recommended boundary type with justification.
