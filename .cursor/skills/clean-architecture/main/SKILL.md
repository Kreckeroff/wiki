You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or update the **Main Component** — the composition root of the application.

## What is the Main Component?

From the book (Chapter 26 — The Main Component):
> "Think of Main as the dirtiest of all the dirty components. Main is the ultimate detail — the lowest-level policy. It is the initial entry point of the system. Nothing, other than the operating system, depends on it. Its job is to create all the Factories, Strategies, and other global facilities, and then hand control over to the high-level abstract portions of the system."

Main is:
- The **composition root** — the single place where the entire object graph is assembled.
- The **most volatile** component — it changes whenever a new use case, adapter, or framework is added.
- The **only** place where concrete implementations are instantiated.
- The **only** place where dependency injection is wired (if not using a DI framework).
- A **plugin** to the rest of the system — the system doesn't know about Main.

## The Plugin Architecture

```
         Main (dirty, knows everything)
           │
           ├── creates → PostgresOrderRepository (adapters/gateways)
           │                 implements IOrderRepository (usecases/ports)
           │
           ├── creates → PlaceOrderPresenter (adapters/presenters)
           │                 implements IPlaceOrderOutputPort (usecases/ports)
           │
           ├── creates → PlaceOrderInteractor (usecases/interactors)
           │                 ← injects presenter + repository
           │
           ├── creates → PlaceOrderController (adapters/controllers)
           │                 ← injects interactor (as IPlaceOrderUseCase)
           │
           └── registers routes → Express/FastAPI/Spring router
```

## Your Task

### Step 1: Audit the Current State
- Scan the codebase for any `new ConcreteClass()` calls outside of `main/` or `tests/`.
- Identify all dependencies that need wiring.
- List all use cases, their interactors, presenters, and gateways.

### Step 2: Create the Main File

File: `src/main/index.<ext>` (or `src/main/app.<ext>`, `src/main/bootstrap.<ext>`)

#### TypeScript (Express, manual DI):
```typescript
// src/main/index.ts
// THE MAIN COMPONENT — The Composition Root
//
// This file knows about ALL layers. That is by design.
// It is the ONLY file allowed to import concrete implementations from all layers.
// Nothing imports from main/ except the OS entry point (e.g., server.ts).
//
// Layer: Main (outermost)
// Imports from: ALL layers (entities, usecases, adapters, frameworks)

import express from 'express';

// Framework setup (frameworks layer)
import { createDbConnection } from '../frameworks/db/connection';

// Concrete gateway implementations (adapters layer)
import { OrderRepositoryImpl } from '../adapters/gateways/OrderRepositoryImpl';
import { CustomerRepositoryImpl } from '../adapters/gateways/CustomerRepositoryImpl';

// Concrete presenters (adapters layer)
import { PlaceOrderPresenter } from '../adapters/presenters/PlaceOrderPresenter';
import { GetOrderPresenter } from '../adapters/presenters/GetOrderPresenter';

// Concrete interactors (usecases layer)
import { PlaceOrderInteractor } from '../usecases/interactors/PlaceOrderInteractor';
import { GetOrderInteractor } from '../usecases/interactors/GetOrderInteractor';

// Concrete controllers (adapters layer)
import { PlaceOrderController } from '../adapters/controllers/PlaceOrderController';
import { GetOrderController } from '../adapters/controllers/GetOrderController';

// Route registration (frameworks layer)
import { registerOrderRoutes } from '../frameworks/web/orderRoutes';

export async function bootstrap(): Promise<void> {
  // 1. Initialize infrastructure
  const dbConnection = await createDbConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'app_db',
  });

  // 2. Create repositories (gateways)
  const orderRepository = new OrderRepositoryImpl(dbConnection);
  const customerRepository = new CustomerRepositoryImpl(dbConnection);

  // 3. Wire use cases (inject repositories and presenters as ports)
  const placeOrderPresenter = new PlaceOrderPresenter();
  const placeOrderInteractor = new PlaceOrderInteractor(
    placeOrderPresenter,    // output port
    orderRepository,         // repository port
    customerRepository,      // repository port
  );

  const getOrderPresenter = new GetOrderPresenter();
  const getOrderInteractor = new GetOrderInteractor(
    getOrderPresenter,
    orderRepository,
  );

  // 4. Create controllers (inject use cases as input port interfaces)
  const placeOrderController = new PlaceOrderController(placeOrderInteractor);
  const getOrderController = new GetOrderController(getOrderInteractor);

  // 5. Set up the web framework
  const app = express();
  app.use(express.json());

  // 6. Register routes (frameworks layer handles HTTP, controllers handle adaptation)
  registerOrderRoutes(app, {
    placeOrder: placeOrderController,
    getOrder: getOrderController,
  });

  // 7. Start the server
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

bootstrap().catch(console.error);
```

#### Python (FastAPI, manual DI):
```python
# src/main/app.py
# THE MAIN COMPONENT — Composition Root

from fastapi import FastAPI
from ..frameworks.db.connection import create_db_session
from ..adapters.gateways.order_repository_impl import OrderRepositoryImpl
from ..adapters.presenters.place_order_presenter import PlaceOrderPresenter
from ..usecases.interactors.place_order_interactor import PlaceOrderInteractor
from ..adapters.controllers.place_order_controller import PlaceOrderController
from ..frameworks.web.order_routes import register_order_routes

def create_app() -> FastAPI:
    app = FastAPI()

    # Infrastructure
    db_session = create_db_session()

    # Gateways
    order_repo = OrderRepositoryImpl(db_session)

    # Use cases with injected dependencies
    place_order_presenter = PlaceOrderPresenter()
    place_order_interactor = PlaceOrderInteractor(
        output_port=place_order_presenter,
        order_repository=order_repo,
    )

    # Controllers
    place_order_controller = PlaceOrderController(place_order_interactor)

    # Routes
    register_order_routes(app, place_order_controller)

    return app

app = create_app()
```

#### With a DI Framework (TypeScript + tsyringe / NestJS / InversifyJS):
```typescript
// src/main/container.ts
import 'reflect-metadata';
import { container } from 'tsyringe';

// Register interfaces → concrete implementations
container.register<IOrderRepository>('IOrderRepository', {
  useClass: OrderRepositoryImpl,
});
container.register<IPlaceOrderOutputPort>('IPlaceOrderOutputPort', {
  useClass: PlaceOrderPresenter,
});
container.register<IPlaceOrderUseCase>('IPlaceOrderUseCase', {
  useClass: PlaceOrderInteractor,
});

// The container IS the Main component — wiring lives here, not scattered throughout the app.
```

### Step 3: Extract Factory Methods (if wiring is complex)

For complex wiring, extract factory methods:

```typescript
// src/main/factories/makePlaceOrderUseCase.ts
export function makePlaceOrderUseCase(dbConnection: DbConnection): IPlaceOrderUseCase {
  const repository = new OrderRepositoryImpl(dbConnection);
  const presenter = new PlaceOrderPresenter();
  return new PlaceOrderInteractor(presenter, repository);
}
```

### Step 4: Environment-Specific Main Files

Different environments can have different main files:

```
src/main/
├── index.ts              ← Production composition root
├── index.test.ts         ← Test composition root (uses in-memory implementations)
├── factories/
│   ├── makeOrderUseCases.ts
│   └── makeUserUseCases.ts
└── config/
    └── environment.ts    ← Environment variable parsing (detail)
```

Test composition root:
```typescript
// src/main/index.test.ts — used by integration/e2e tests
export function bootstrapTestApp(): App {
  // Use in-memory repositories instead of real DB
  const orderRepository = new OrderInMemoryRepository();
  const placeOrderPresenter = new PlaceOrderPresenter();
  const placeOrderInteractor = new PlaceOrderInteractor(placeOrderPresenter, orderRepository);
  const placeOrderController = new PlaceOrderController(placeOrderInteractor);
  // ... return wired app
}
```

## Validation Checklist

- [ ] `src/main/` is the ONLY location with `new ConcreteGateway()` or `new ConcreteInteractor()`.
- [ ] No other production code file (outside `main/`) uses `new` on a cross-layer dependency.
- [ ] No layer inside `src/` imports from `main/`.
- [ ] Environment variables are read ONLY in main (or in a config module loaded by main).
- [ ] The DI wiring is in one place — not scattered across the app.
- [ ] A test composition root exists that swaps infrastructure for in-memory alternatives.
- [ ] Main is not tested by unit tests — its correctness is validated by integration/e2e tests.

## SRP of Main
Main changes when:
- A new use case is added (new wiring needed).
- An implementation is swapped (e.g., switch DB engine).
- A new environment is added.
It does NOT change because of business rule changes — those are in entities/use cases.

## Output
After creating/updating Main:
1. The complete wiring diagram.
2. All dependencies wired and where their interfaces are defined.
3. How to add a new use case (step-by-step).
4. How to swap an implementation (e.g., switch from PostgreSQL to DynamoDB).
