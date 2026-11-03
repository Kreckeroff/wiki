You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or review a **Gateway** (also called Repository or Data Mapper) — the adapter that connects the application to the database or external services.

The argument after the command is the gateway name (e.g., `OrderRepository`, `PaymentGateway`, `EmailGateway`).

## What is a Gateway?

From the book (Chapter 22 — The Clean Architecture):
> "The database is a detail. The web is a detail. These things are on the outer layers, not the inner ones."

A Gateway:
- Lives in the **Interface Adapters** layer (`src/adapters/gateways/`).
- **Implements** a Repository/Gateway interface defined in the **Use Cases** layer (`src/usecases/ports/output/`).
- Translates between **Domain Entities** (inner layer) and **Database rows / external API responses** (outer layer).
- Hides all knowledge of the database schema, ORM, or external API format from the use cases.
- The use case **never knows** whether data comes from SQL, NoSQL, a REST API, or an in-memory store.

## The Database is a Detail

This is a central theme of the book. The architecture must not be coupled to:
- Which database engine is used (PostgreSQL, MongoDB, DynamoDB).
- Whether data is stored locally or remotely.
- The ORM framework (TypeORM, SQLAlchemy, Hibernate, Prisma).

The interface defined in `usecases/ports/output/` is the **contract**; the gateway is the **implementation detail**.

## Data Flow

```
Interactor
  → I<Domain>Repository (interface in usecases/ports/output/)
  ← <Domain>RepositoryImpl (gateway in adapters/gateways/)
       → ORM / DB driver (in frameworks/db/)
         → Database
```

## Your Task

### Step 1: Verify the Repository Interface
The interface should already exist (created during `/clean-architecture:usecase`). Check `src/usecases/ports/output/I<Domain>Repository.<ext>`.

If it does not exist, create it now in the USE CASE layer:
```typescript
// src/usecases/ports/output/I<Domain>Repository.ts
// This interface belongs to the USE CASE layer — NOT the adapter layer.
// The use case defines what it needs; the gateway satisfies it.

import { <Entity>, <EntityId> } from '../../entities/<Entity>';

export interface I<Domain>Repository {
  findById(id: <EntityId>): Promise<<Entity> | null>;
  findAll(): Promise<<Entity>[]>;
  save(entity: <Entity>): Promise<void>;
  delete(id: <EntityId>): Promise<void>;
  // Only add methods that at least one use case actually needs
}
```

### Step 2: Create the Data Mapper / Persistence Model
Keep the DB schema separate from the domain entity (they can evolve independently):

File: `src/adapters/gateways/persistence/<Domain>PersistenceModel.<ext>`
```typescript
// src/adapters/gateways/persistence/<Domain>PersistenceModel.ts
// This is the ORM/DB schema model — lives in the adapter layer only
// The entity layer never knows about this

export interface <Domain>Row {  // or: @Entity() class for ORM
  id: string;
  // ... db column names (may differ from domain field names)
  created_at: Date;  // snake_case for DB vs camelCase for domain
  updated_at: Date;
}

// Mapper functions — translate between layers
export function toDomain(row: <Domain>Row): <Entity> {
  return <Entity>.reconstitute({
    id: row.id,
    // ... map db fields → domain fields
  });
}

export function toPersistence(entity: <Entity>): <Domain>Row {
  return {
    id: entity.id,
    // ... map domain fields → db fields
    created_at: new Date(),
    updated_at: new Date(),
  };
}
```

### Step 3: Create the Gateway Implementation

File: `src/adapters/gateways/<Domain>RepositoryImpl.<ext>`

#### TypeScript (TypeORM example):
```typescript
// src/adapters/gateways/<Domain>RepositoryImpl.ts
// Layer: Interface Adapters
// Implements: I<Domain>Repository (from usecases layer)
// May import from: usecases/ports/output/ (for the interface), entities/ (for entity types)
// Framework-specific (TypeORM/Prisma/Knex) code is acceptable here

import { Repository } from 'typeorm'; // ORM import OK in adapters layer
import { I<Domain>Repository } from '../../usecases/ports/output/I<Domain>Repository';
import { <Entity>, <EntityId> } from '../../entities/<Entity>';
import { <Domain>OrmEntity } from '../persistence/<Domain>OrmEntity';
import { toDomain, toPersistence } from '../persistence/<Domain>PersistenceMapper';

export class <Domain>RepositoryImpl implements I<Domain>Repository {
  constructor(private readonly ormRepo: Repository<<Domain>OrmEntity>) {}

  async findById(id: <EntityId>): Promise<<Entity> | null> {
    const row = await this.ormRepo.findOne({ where: { id } });
    if (!row) return null;
    return toDomain(row);
  }

  async findAll(): Promise<<Entity>[]> {
    const rows = await this.ormRepo.find();
    return rows.map(toDomain);
  }

  async save(entity: <Entity>): Promise<void> {
    const row = toPersistence(entity);
    await this.ormRepo.save(row);
  }

  async delete(id: <EntityId>): Promise<void> {
    await this.ormRepo.delete(id);
  }
}
```

#### Python (SQLAlchemy example):
```python
# src/adapters/gateways/<domain>_repository_impl.py
from sqlalchemy.orm import Session
from ...usecases.ports.output.i_<domain>_repository import I<Domain>Repository
from ...entities.<entity> import <Entity>, <EntityId>
from .persistence.<domain>_persistence_model import <Domain>Row, to_domain, to_persistence

class <Domain>RepositoryImpl(I<Domain>Repository):
    def __init__(self, session: Session):
        self._session = session

    def find_by_id(self, id: <EntityId>) -> <Entity> | None:
        row = self._session.query(<Domain>Row).filter_by(id=id).first()
        return to_domain(row) if row else None

    def find_all(self) -> list[<Entity>]:
        rows = self._session.query(<Domain>Row).all()
        return [to_domain(r) for r in rows]

    def save(self, entity: <Entity>) -> None:
        row = to_persistence(entity)
        self._session.merge(row)
        self._session.commit()

    def delete(self, id: <EntityId>) -> None:
        self._session.query(<Domain>Row).filter_by(id=id).delete()
        self._session.commit()
```

### Step 4: Create an In-Memory Gateway for Testing
File: `src/adapters/gateways/in-memory/<Domain>InMemoryRepository.<ext>`

```typescript
// Used in unit tests — no DB needed
export class <Domain>InMemoryRepository implements I<Domain>Repository {
  private store = new Map<<EntityId>, <Entity>>();

  async findById(id: <EntityId>): Promise<<Entity> | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(): Promise<<Entity>[]> {
    return Array.from(this.store.values());
  }

  async save(entity: <Entity>): Promise<void> {
    this.store.set(entity.id, entity);
  }

  async delete(id: <EntityId>): Promise<void> {
    this.store.delete(id);
  }
}
```

### Step 5: Create Gateway Integration Tests
File: `tests/integration/gateways/<Domain>RepositoryImpl.test.<ext>`
- Use a real (test) database connection.
- Test round-trip: save → findById returns correct domain entity.
- Test the mapper: verify domain fields map correctly to/from DB columns.
- Test not-found: findById returns null for missing ID.

## Validation Checklist

- [ ] Repository interface lives in `src/usecases/ports/output/` (NOT in adapters).
- [ ] Gateway implementation lives in `src/adapters/gateways/`.
- [ ] ORM/DB-specific code (TypeORM decorators, SQLAlchemy models) is ONLY in the gateway/persistence files.
- [ ] The use case interactor imports only the interface — never the implementation.
- [ ] Data mapper correctly translates domain ↔ persistence (field names, types, nullability).
- [ ] An in-memory implementation exists for use case unit tests.
- [ ] The gateway does NOT enforce business rules — it just stores/retrieves data.

## SRP Check
- The gateway changes when the **persistence technology or schema** changes.
- It does NOT change when business rules change (that's the entity/interactor).

## Output
After creating files, show:
1. The interface definition and which use cases depend on it.
2. The field mapping between domain entity and persistence model.
3. Which tests use the in-memory gateway vs. the real implementation.
