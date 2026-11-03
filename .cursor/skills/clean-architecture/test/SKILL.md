You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create tests that comply with the **Test Boundary** principle.

The argument after the command is the name of the class/use case/entity to test (e.g., `PlaceOrderInteractor`, `Order`, `OrderGateway`).

## The Test Boundary (Chapter 28)

From the book:
> "Tests are not outside the system; rather, they are parts of the system that must be well designed and well managed. Tests that are strongly coupled to the system are fragile — they break whenever any part of the system changes."

Key principles:
1. **Tests follow the Dependency Rule** — tests are in the outermost circle; nothing in the system depends on tests.
2. **Tests must be isolated** — use case tests must not touch the DB, HTTP, or any framework.
3. **Tests should be fragile-free** — don't test implementation details; test behavior through interfaces.
4. **Test API** — create a specific API for tests that lets the system be put into a testable state without going through the production UI.

## Test Pyramid in Clean Architecture

```
                  /\
                 /  \
                / E2E \        ← Few, slow, fragile
               /      \          (tests the whole system through the UI/HTTP)
              /────────\
             /Integration\    ← Moderate, tests gateway/adapter wiring
            /            \       (uses real DB, but in-memory or test schema)
           /──────────────\
          /   Unit Tests   \  ← Many, fast, pure
         /  (entities &     \    (no I/O, no framework, no mocks of inner layers)
        /   use cases)       \
       /─────────────────────\
```

## Your Task

Determine the type of target (entity, use case, gateway, controller, presenter) and generate the appropriate test file.

### Test Type 1: Entity Tests

File: `tests/unit/entities/<EntityName>.test.<ext>`

```typescript
// Entity tests need NO mocks — entities are pure
import { Order, OrderId } from '../../../src/entities/Order';

describe('Order Entity', () => {

  describe('creation', () => {
    it('should create a valid Order', () => {
      const order = Order.create({
        id: 'order-1' as OrderId,
        customerId: 'cust-1',
        items: [{ productId: 'p1', quantity: 2, unitPrice: 1000 }],
        status: 'PENDING',
      });
      expect(order.id).toBe('order-1');
      expect(order.status).toBe('PENDING');
    });

    it('should reject Order with no items', () => {
      expect(() => Order.create({
        id: 'order-1' as OrderId,
        customerId: 'cust-1',
        items: [],
        status: 'PENDING',
      })).toThrow('Order must have at least one item');
    });
  });

  describe('critical business rules', () => {
    it('should allow cancellation when PENDING', () => {
      const order = Order.create({ /* ... */ });
      expect(order.canBeCancelled()).toBe(true);
    });

    it('should not allow cancellation when SHIPPED', () => {
      const order = Order.reconstitute({ /* ..., status: 'SHIPPED' */ });
      expect(order.canBeCancelled()).toBe(false);
    });

    it('should calculate total correctly', () => {
      const order = Order.create({ /* items with prices */ });
      expect(order.total).toBe(2000); // 2 × 1000 cents
    });
  });

  describe('equality', () => {
    it('should equal another Order with the same id', () => {
      const a = Order.reconstitute({ id: 'order-1' as OrderId, /* ... */ });
      const b = Order.reconstitute({ id: 'order-1' as OrderId, /* ... */ });
      expect(a.equals(b)).toBe(true);
    });
  });
});
```

### Test Type 2: Use Case Interactor Tests

File: `tests/unit/usecases/<UseCaseName>Interactor.test.<ext>`

```typescript
// Use case tests use mocks for output port and repository
// They do NOT use a real DB or HTTP
import { PlaceOrderInteractor } from '../../../src/usecases/interactors/PlaceOrderInteractor';
import { IPlaceOrderOutputPort } from '../../../src/usecases/ports/output/IPlaceOrderOutputPort';
import { IOrderRepository } from '../../../src/usecases/ports/output/IOrderRepository';
import { OrderInMemoryRepository } from '../../../src/adapters/gateways/in-memory/OrderInMemoryRepository';

describe('PlaceOrderInteractor', () => {
  let interactor: PlaceOrderInteractor;
  let outputPort: jest.Mocked<IPlaceOrderOutputPort>;
  let repository: IOrderRepository;

  beforeEach(() => {
    outputPort = {
      present: jest.fn(),
      presentError: jest.fn(),
    };
    repository = new OrderInMemoryRepository(); // In-memory — no real DB
    interactor = new PlaceOrderInteractor(outputPort, repository);
  });

  describe('Happy Path', () => {
    it('should place a valid order and present the result', async () => {
      await interactor.execute({
        customerId: 'cust-1',
        items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }],
      });

      expect(outputPort.present).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: expect.any(String),
          status: 'PENDING',
        })
      );
      expect(outputPort.presentError).not.toHaveBeenCalled();
    });

    it('should persist the order to the repository', async () => {
      await interactor.execute({ customerId: 'cust-1', items: [/* ... */] });

      const allOrders = await repository.findAll();
      expect(allOrders).toHaveLength(1);
    });
  });

  describe('Error Cases', () => {
    it('should present error when items list is empty', async () => {
      await interactor.execute({ customerId: 'cust-1', items: [] });

      expect(outputPort.presentError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('item') })
      );
    });

    it('should present error when customer is not found', async () => {
      // Set up: customer repo returns null
      // ...
    });
  });
});
```

### Test Type 3: Presenter Tests

File: `tests/unit/adapters/presenters/<Name>Presenter.test.<ext>`

```typescript
// Presenter tests need NO HTTP stack
import { PlaceOrderPresenter } from '../../../src/adapters/presenters/PlaceOrderPresenter';

describe('PlaceOrderPresenter', () => {
  let presenter: PlaceOrderPresenter;

  beforeEach(() => {
    presenter = new PlaceOrderPresenter();
  });

  it('should format the response model into a view model', () => {
    presenter.present({
      orderId: 'order-123',
      totalCents: 4200,
      createdAt: new Date('2024-01-05T10:00:00Z'),
      status: 'PENDING',
    });

    expect(presenter.viewModel).toEqual({
      orderId: 'order-123',
      total: '$42.00',
      createdAt: 'January 5, 2024',
      statusLabel: 'Pending',
    });
    expect(presenter.hasError).toBe(false);
  });

  it('should format error into an error view model', () => {
    presenter.presentError(new Error('Order creation failed'));

    expect(presenter.hasError).toBe(true);
    expect(presenter.errorViewModel?.message).toBe('Order creation failed');
  });
});
```

### Test Type 4: Gateway Integration Tests

File: `tests/integration/gateways/<Name>RepositoryImpl.test.<ext>`

```typescript
// Integration tests use a REAL database (test schema)
// These are separate from unit tests and require DB setup
import { OrderRepositoryImpl } from '../../../src/adapters/gateways/OrderRepositoryImpl';
// import test DB setup helpers

describe('OrderRepositoryImpl', () => {
  let repository: OrderRepositoryImpl;

  beforeAll(async () => {
    // Connect to test database
  });

  afterEach(async () => {
    // Clear test data between tests
  });

  afterAll(async () => {
    // Disconnect
  });

  it('should save and retrieve an order by id', async () => {
    const order = Order.create({ /* ... */ });
    await repository.save(order);

    const found = await repository.findById(order.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(order.id);
    // Check domain fields are correctly mapped
  });

  it('should return null for non-existent id', async () => {
    const found = await repository.findById('does-not-exist' as OrderId);
    expect(found).toBeNull();
  });
});
```

### Test Type 5: Controller Tests

File: `tests/unit/adapters/controllers/<Name>Controller.test.<ext>`

```typescript
// Controller tests mock the use case input port
import { PlaceOrderController } from '../../../src/adapters/controllers/PlaceOrderController';
import { IPlaceOrderUseCase } from '../../../src/usecases/ports/input/IPlaceOrderUseCase';

describe('PlaceOrderController', () => {
  it('should map HTTP request to use case request model', async () => {
    const mockUseCase: jest.Mocked<IPlaceOrderUseCase> = {
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new PlaceOrderController(mockUseCase);

    const mockReq = { body: { customerId: 'cust-1', items: [{ productId: 'p1', qty: 2 }] } };
    const mockRes = { /* ... */ };

    await controller.handle(mockReq as any, mockRes as any);

    expect(mockUseCase.execute).toHaveBeenCalledWith({
      customerId: 'cust-1',
      items: [{ productId: 'p1', quantity: 2 }], // mapped from 'qty' to 'quantity'
    });
  });
});
```

## Test Configuration Files

### Jest config (TypeScript):
```json
{
  "jest": {
    "projects": [
      {
        "displayName": "unit",
        "testMatch": ["<rootDir>/tests/unit/**/*.test.ts"],
        "testEnvironment": "node",
        "setupFilesAfterFramework": []
      },
      {
        "displayName": "integration",
        "testMatch": ["<rootDir>/tests/integration/**/*.test.ts"],
        "testEnvironment": "node",
        "globalSetup": "<rootDir>/tests/integration/setup.ts"
      }
    ]
  }
}
```

### pytest config (Python):
```ini
[pytest]
markers =
    unit: Pure unit tests (no I/O)
    integration: Integration tests (requires DB)
    e2e: End-to-end tests (requires full stack)
```

## Validation Checklist

- [ ] Unit tests for entities: zero mocks, zero I/O, test all business rules.
- [ ] Unit tests for use cases: mock Output Port and Repository only (in-memory impl preferred).
- [ ] Use case tests do NOT connect to a real database.
- [ ] Integration tests are in a separate directory and test suite.
- [ ] Presenter tests run without starting an HTTP server.
- [ ] Controller tests mock the use case interface.
- [ ] No business logic is tested only in integration or e2e tests.
- [ ] Test files themselves follow the Dependency Rule (test code can only import from inner layers + test utilities).

## Output
After creating test files, provide:
1. Test coverage breakdown by layer.
2. Which tests need infrastructure (DB, network) and which don't.
3. How to run only the fast unit tests: `npm test -- --project=unit` or equivalent.
