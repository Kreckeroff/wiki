You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to **migrate existing code** toward Clean Architecture.

The argument after the command is the path to the code to migrate (e.g., `src/`, `src/orders/`, a specific file).

## Migration Philosophy

From the book (Chapter 34 — The Missing Chapter):
> "The devil is in the implementation details."

Migration should be:
- **Incremental** — never a big-bang rewrite. Move one layer at a time.
- **Non-breaking** — existing tests should still pass after each step.
- **Inside-out** — start with the innermost layer (entities) and work outward.
- **Test-driven** — add tests before moving code, so the tests validate the migration.

## Common Starting Points (Anti-Pattern Recognition)

Before migrating, identify the current architecture anti-pattern:

### 1. Transaction Script (Procedural)
```
// Everything in one function/handler
router.post('/orders', async (req, res) => {
  const { customerId, items } = req.body;
  // validate inputs
  // query database directly
  // apply business logic
  // format and send response
  // Everything mixed together
});
```

### 2. Active Record
```
// Models that know how to save themselves (Rails, Django ORM)
class Order extends ActiveRecord {
  async placeOrder() {
    this.status = 'placed';
    await this.save(); // domain object knows about DB
  }
}
```

### 3. Anemic Domain Model
```
// Data objects with no behavior
class Order { id: string; items: Item[]; status: string; }
// All logic in "service" classes that directly import Order
class OrderService {
  async placeOrder(dto: PlaceOrderDto, orderRepo: any) { ... }
}
```

### 4. Big Ball of Mud
```
// Imports everywhere, no clear layers
// controllers import from models import from utils import from controllers
```

## Migration Roadmap

### Phase 1: Extract Entities (Safest — No Behavior Change)

**Goal**: Pull pure business logic out of service classes, controllers, or models.

Steps:
1. Identify classes/functions that contain enterprise business rules.
2. Create `src/entities/` directory.
3. Create entity classes that:
   - Are framework-independent.
   - Contain only business methods and validation.
   - Have NO database operations, NO HTTP concerns.
4. Have the existing service/model DELEGATE to the entity.
5. Write entity unit tests.

```typescript
// BEFORE (business rule inside the service/ORM model):
class OrderService {
  canCancel(order: OrderDto): boolean {
    return order.status === 'PENDING' && order.items.length > 0;
  }
}

// AFTER — Phase 1: Extract to Entity
// src/entities/Order.ts
export class Order {
  canBeCancelled(): boolean {
    return this.status === 'PENDING' && this.items.length > 0;
  }
}

// src/services/OrderService.ts (unchanged interface, delegates to entity)
class OrderService {
  canCancel(orderData: OrderDto): boolean {
    const order = Order.reconstitute(orderData);
    return order.canBeCancelled(); // delegates to entity
  }
}
```

### Phase 2: Define Use Case Ports (Non-Breaking Interface Extraction)

**Goal**: Define the boundaries between business logic and infrastructure.

Steps:
1. For each "service" method that represents a user action, define an Input Port interface.
2. For each database access pattern used by a service, define a Repository interface.
3. Place all interfaces in `src/usecases/ports/`.
4. Have existing services implement the Input Port interfaces.
5. Have existing repository/ORM classes implement the Repository interfaces.

```typescript
// Step 2a: Define the input port
// src/usecases/ports/input/IPlaceOrderUseCase.ts
export interface IPlaceOrderUseCase {
  execute(request: PlaceOrderRequestModel): Promise<void>;
}

// Step 2b: Define the repository interface
// src/usecases/ports/output/IOrderRepository.ts
export interface IOrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

// Step 2c: Existing service now declares it implements the port
// (behavior unchanged — just adding the interface declaration)
export class OrderService implements IPlaceOrderUseCase { /* ... */ }
```

### Phase 3: Extract Interactors (Decouple Business Logic from Infrastructure)

**Goal**: Move application business logic into framework-independent interactors.

Steps:
1. Create `src/usecases/interactors/` directory.
2. Create an Interactor class that:
   - Implements the Input Port.
   - Accepts Repository interface via constructor injection.
   - Has no ORM imports, no HTTP imports.
3. Move the actual business logic from the service into the interactor.
4. Update the existing service to delegate to the interactor.

```typescript
// src/usecases/interactors/PlaceOrderInteractor.ts
// Pure business logic, no framework dependencies
export class PlaceOrderInteractor implements IPlaceOrderUseCase {
  constructor(
    private readonly outputPort: IPlaceOrderOutputPort,
    private readonly repository: IOrderRepository,
  ) {}

  async execute(request: PlaceOrderRequestModel): Promise<void> {
    // Business logic extracted from service/controller
    const customer = await this.repository.findCustomerById(request.customerId);
    const order = Order.create({ ... });
    await this.repository.save(order);
    this.outputPort.present({ orderId: order.id });
  }
}
```

### Phase 4: Extract Gateways (Decouple Infrastructure from Business Logic)

**Goal**: Move all database/external code into adapter implementations.

Steps:
1. Create `src/adapters/gateways/` directory.
2. Create Gateway/Repository implementation classes that implement the interfaces from Phase 2.
3. These classes contain all ORM/SQL code.
4. Create a data mapper to translate between domain entities and ORM models.
5. Add an in-memory implementation for testing.

```typescript
// src/adapters/gateways/OrderRepositoryImpl.ts
export class OrderRepositoryImpl implements IOrderRepository {
  constructor(private readonly ormRepo: TypeOrmOrderRepository) {}

  async findById(id: string): Promise<Order | null> {
    const row = await this.ormRepo.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(order: Order): Promise<void> {
    await this.ormRepo.save(toPersistence(order));
  }
}
```

### Phase 5: Extract Controllers and Presenters (Adapter Layer Cleanup)

**Goal**: Thin out controllers and introduce the Humble Object pattern.

Steps:
1. Create `src/adapters/controllers/` directory.
2. Extract HTTP request parsing from fat controllers into thin adapter controllers.
3. Create Presenter classes that implement Output Ports.
4. Make HTTP route handlers (Humble Objects) delegate to controllers and read from presenters.

### Phase 6: Create the Composition Root (Main)

**Goal**: Centralize all wiring in Main.

Steps:
1. Create `src/main/` directory.
2. Move all `new ConcreteClass()` calls to main.
3. Wire: Gateway → Presenter → Interactor → Controller → Router.
4. Test that the application still starts and works end-to-end.

### Phase 7: Enforce the Dependency Rule

**Goal**: Add tooling to prevent regressions.

Add lint rules or architecture tests:

#### TypeScript — eslint-plugin-boundaries:
```json
{
  "rules": {
    "boundaries/element-types": [2, {
      "default": "disallow",
      "rules": [
        { "from": "entities",   "allow": [] },
        { "from": "usecases",   "allow": ["entities"] },
        { "from": "adapters",   "allow": ["usecases", "entities"] },
        { "from": "frameworks", "allow": ["adapters", "usecases", "entities"] },
        { "from": "main",       "allow": ["frameworks", "adapters", "usecases", "entities"] }
      ]
    }]
  }
}
```

#### Java — ArchUnit test:
```java
@Test
void entitiesShouldNotDependOnUseCases() {
    noClasses().that().resideInAPackage("..entities..")
        .should().dependOnClassesThat().resideInAPackage("..usecases..")
        .check(importedClasses);
}
```

#### Python — import-linter:
```ini
[importlinter:contract:entities]
name = Entities should not import from other layers
type = forbidden
source_modules = myapp.entities
forbidden_modules = myapp.usecases, myapp.adapters, myapp.frameworks
```

## Migration Execution Plan

For the specific path provided, generate a step-by-step migration plan:

```
MIGRATION PLAN FOR: <path>
===========================

Current Architecture Pattern: [identified pattern]
Estimated Effort: [S/M/L/XL]

PHASE 1 — Entity Extraction (0 risk — pure extraction)
  [ ] Create src/entities/<Name>.ts
  [ ] Move business methods from <source file>
  [ ] Add entity unit tests
  [ ] Have source file delegate to entity
  [ ] Verify all existing tests still pass

PHASE 2 — Port Definition (0 risk — adding interfaces)
  [ ] Create src/usecases/ports/input/I<Name>UseCase.ts
  [ ] Create src/usecases/ports/output/I<Name>Repository.ts
  [ ] Have existing classes implement the interfaces

PHASE 3 — Interactor Extraction (low risk — new class, old delegates)
  [ ] Create src/usecases/interactors/<Name>Interactor.ts
  [ ] Write interactor unit tests (with mocks)
  [ ] Have old service delegate to interactor

PHASE 4 — Gateway Extraction (medium risk — DB layer refactor)
  [ ] Create src/adapters/gateways/<Name>RepositoryImpl.ts
  [ ] Create in-memory implementation for tests
  [ ] Write integration tests
  [ ] Update Main wiring

PHASE 5 — Controller/Presenter Split (medium risk — HTTP layer refactor)
  [ ] Extract controllers and presenters
  [ ] Verify HTTP responses unchanged

PHASE 6 — Main/Composition Root (low risk — wiring consolidation)
  [ ] Consolidate all wiring in main/
  [ ] Remove direct instantiation from other layers

PHASE 7 — Enforce the Rule (0 risk — tooling only)
  [ ] Add eslint-plugin-boundaries or ArchUnit tests
  [ ] Run lint in CI
```

## Output
1. Identified anti-patterns in the provided code.
2. A phased migration plan with specific file changes.
3. Files created/modified in the current phase.
4. Tests to write before and after migration.
5. A before/after comparison of the architecture.
