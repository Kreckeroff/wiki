You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or review an **Entity** — the innermost layer of Clean Architecture, containing Enterprise Business Rules.

The argument after the command is the entity name (e.g., `Order`, `Customer`, `Invoice`).

## What is an Entity?

From the book (Chapter 20 — Business Rules):
> "Entities encapsulate Enterprise-wide Critical Business Rules. An entity can be an object with methods, or it can be a set of data structures and functions. It doesn't matter so long as the entities could be used by many different applications in the enterprise."

Entities are:
- The **most stable** code in the system — they change only when enterprise-wide business rules change.
- **Framework-independent** — no HTTP, no SQL, no ORM, no UI.
- **Application-independent** — no use case logic lives here.
- **Testable** without any infrastructure.

## Your Task

### Step 1: Understand the Domain
- Read the existing codebase to understand the domain context.
- Identify what business rules are **enterprise-wide** (apply across all use cases) vs. **application-specific** (belong in a use case).

### Step 2: Design the Entity

An entity should contain:
1. **Identity** — how the entity is uniquely identified (EntityId value object).
2. **State** — the core data fields representing the business concept.
3. **Business Rules** (Critical Business Rules) — methods that enforce invariants and policies that are true regardless of the application.
4. **No I/O** — no database calls, no HTTP calls, no logging frameworks.

### Step 3: Generate the Entity File

Place the file at: `src/entities/<EntityName>.<ext>`

#### TypeScript template:
```typescript
// src/entities/<EntityName>.ts
// Layer: Enterprise Business Rules
// Dependencies: NONE — this file must never import from usecases/, adapters/, frameworks/, or main/

export type <EntityName>Id = string; // Use a branded type for safety

export interface <EntityName>Props {
  id: <EntityName>Id;
  // ... core fields
}

export class <EntityName> {
  private readonly _id: <EntityName>Id;
  // ... private fields

  private constructor(props: <EntityName>Props) {
    this._id = props.id;
    // ... assign fields
    this.validate();
  }

  // Factory method — enforces invariants at creation time
  static create(props: <EntityName>Props): <EntityName> {
    return new <EntityName>(props);
  }

  // Reconstruct from persistence (no validation of existing data)
  static reconstitute(props: <EntityName>Props): <EntityName> {
    return new <EntityName>(props);
  }

  get id(): <EntityName>Id { return this._id; }

  // Critical Business Rule methods
  // Example: canBeCancelled(): boolean { ... }

  // Equality based on identity (not reference)
  equals(other: <EntityName>): boolean {
    return this._id === other._id;
  }

  private validate(): void {
    // Enforce entity-level invariants here
    // Throw domain errors if rules are violated
  }
}
```

#### Python template:
```python
# src/entities/<entity_name>.py
# Layer: Enterprise Business Rules
# Dependencies: NONE

from dataclasses import dataclass
from typing import NewType

<EntityName>Id = NewType('<EntityName>Id', str)

@dataclass(frozen=True)
class <EntityName>:
    id: <EntityName>Id
    # ... core fields

    def __post_init__(self):
        self._validate()

    def _validate(self) -> None:
        # Enforce invariants
        pass

    # Critical Business Rule methods here
```

### Step 4: Create Value Objects (if needed)
- If the entity has complex attributes (Money, Address, DateRange), create value objects in `src/entities/value-objects/`.
- Value objects are immutable, equality by value (not identity).

### Step 5: Create Domain Events (if needed)
- If the entity triggers important business events (OrderPlaced, PaymentReceived), define domain event types in `src/entities/events/`.

### Step 6: Create Entity Tests
Create `tests/unit/entities/<EntityName>.test.<ext>`:
- Test each critical business rule method.
- Test invariant enforcement (invalid state should throw/raise).
- Test equality.
- NO mocks needed — entities are pure.

## Validation Checklist

After creating the entity, verify:
- [ ] The entity file has **zero imports** from `usecases/`, `adapters/`, `frameworks/`, `main/`, or any third-party library.
- [ ] All business rules that are enterprise-wide are in the entity (not scattered in use cases).
- [ ] The entity uses a factory method or constructor that enforces invariants.
- [ ] State is private; access is through methods that enforce rules.
- [ ] The entity is fully testable without mocks or infrastructure.
- [ ] Value objects are immutable (use `readonly` / `frozen`).
- [ ] Entity identity is explicit (not reliant on database auto-increment exposed in the domain layer).

## SRP Check
- Ask: "What is the ONE reason this entity would change?"
- Answer should be: "When the enterprise business rules around `<EntityName>` change."
- If the entity changes for UI reasons, DB reasons, or use case reasons → violation.

## Output
After creating files, show:
1. The entity structure with a brief explanation of each field/method.
2. Which business rules are enforced at the entity level.
3. Suggested tests to write.
4. Any value objects identified for extraction.
