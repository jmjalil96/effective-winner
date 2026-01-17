# CRM Monorepo

pnpm workspace with Express API (`apps/api`) and React frontend (`apps/web`). Shared code in `packages/shared`, config in `packages/config`.

# Commands

pnpm dev          # Start API (:3001) + Web (:5174)
pnpm build        # Build all packages
pnpm typecheck    # Type check all packages
pnpm lint         # Lint all packages
pnpm format       # Format with Prettier
docker compose up # Start Postgres + Redis

# Single package

pnpm --filter @crm/api dev       # Run dev for API only
pnpm --filter @crm/web build     # Build web only
pnpm --filter @crm/shared lint   # Lint shared only

# API Structure

## DRY Lookup Order

Before creating ANY function, util, constant, or type - check in order:

1. `packages/shared/` - Needed by API + Web?
2. `apps/api/src/lib/` - Used by 2+ features?
3. `apps/api/src/modules/<feature>/` - Feature-specific?

## Shared Package (`packages/shared/src/`)

| Folder | Purpose |
|--------|---------|
| `schemas/` | Zod validation (API request + Web form validation) |
| `types/` | DTOs, interfaces - public API contract |
| `constants/` | Permissions, roles, statuses, enums |

### Shared vs API-Internal Types

**MUST be in `packages/shared/src/types/`:**
- All HTTP response body shapes - if returned via `res.json()`, the type lives in shared
- All HTTP request body shapes - covered by schemas with inferred types

**Stays API-internal (in services/repositories):**
- Context types (`LoginContext`, `RbacContext`) - internal concerns (IP, userAgent, requestId)
- Repository row types - DB types (Date) and internal fields (organizationId)
- Intermediate results - when service adds HTTP-specific data (sessionId, cookie maxAge)

```typescript
// WRONG - redefining response types in services
export interface RoleResponse { id: string; name: string; ... }

// RIGHT - import from shared
import type { Role } from '@crm/shared';
```

## API Lib (`apps/api/src/lib/`)

Cross-cutting utilities. Flat files for simple utils, subdirs for complex services:

```
lib/
├── middleware.ts   # requireAuth, requirePermission, validate
├── utils.ts        # extractRequestMeta, getValidated
├── crypto.ts       # Password hashing, session tokens, timing-safe
├── session.ts      # Session lookup, deletion
└── services/       # Cross-cutting services
    ├── audit.ts    # Audit logging (AUDIT_ACTIONS, logWithContext, toAuditContext)
    ├── email/      # Email service (templates, transport, jobs)
    └── queue/      # Job queue (BullMQ connection, workers)
```

## API Modules (`apps/api/src/modules/<feature>/`)

Feature-specific code. Flat files preferred, subdirs allowed for complex features (e.g., `auth/services/`, `auth/repositories/`):

| File | Purpose | Calls |
|------|---------|-------|
| `routes.ts` | Router definitions, middleware wiring | controller |
| `controller.ts` | HTTP handling (req/res/session) | service |
| `service.ts` | Business logic | repository |
| `repository.ts` | Database queries | db |
| `utils.ts` | Mappers, feature helpers | - |
| `constants.ts` | Feature-specific constants (rare) | - |

## Routes & Middleware

Middleware order matters - always: auth → permission → validate → handler

```typescript
router.post(
  '/invite',
  requireAuth,                              // 1. Check session
  requirePermission('invitations:create'),  // 2. Check permission
  validate({ body: createInvitationSchema }),// 3. Validate input
  createInvitationHandler                   // 4. Handle request
);
```

## Endpoint Structure

**IMPORTANT**: All endpoint implementation requests must be verified against these patterns.

### REST Conventions

| Operation | Method | Pattern | Example |
|-----------|--------|---------|---------|
| Create | `POST` | `/<resource>` | `POST /accounts` |
| List | `GET` | `/<resource>` | `GET /accounts` |
| Read | `GET` | `/<resource>/:id` | `GET /accounts/:id` |
| Update | `PATCH` | `/<resource>/:id` | `PATCH /accounts/:id` |
| Delete | `DELETE` | `/<resource>/:id` | `DELETE /accounts/:id` |
| Set nested | `PUT` | `/<resource>/:id/<sub>` | `PUT /roles/:id/permissions` |

### HTTP Methods

- `GET` - Read only, no side effects
- `POST` - Create resource OR action (login, logout, invite, password reset)
- `PATCH` - Partial update (never PUT for resource updates)
- `PUT` - Replace nested collection only
- `DELETE` - Remove or revoke

### Schema Naming

| Purpose | Pattern | Example |
|---------|---------|---------|
| Create body | `create<Resource>Schema` | `createAccountSchema` |
| Update body | `update<Resource>Schema` | `updateAccountSchema` |
| Path params | `<resource>IdParamSchema` | `accountIdParamSchema` |
| List query | `list<Resources>QuerySchema` | `listAccountsQuerySchema` |

### List Query Pattern

All list endpoints support pagination, filtering, sorting:

```typescript
export const listAccountsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['name', 'status', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

## Controller Pattern

All handlers use helper functions for DRY context building:

```typescript
import { extractRequestMeta, getValidated } from '../../lib/utils.js';

const buildContext = (req: Request): ServiceContext => {
  if (!req.ctx) throw new UnauthorizedError('Authentication required');
  return {
    organizationId: req.ctx.organization.id,
    actorId: req.ctx.user.id,
    ...extractRequestMeta(req),
  };
};

export const createHandler: RequestHandler = async (req, res, next) => {
  try {
    const ctx = buildContext(req);
    const input = getValidated(req).body as CreateInput;
    const result = await createService(input, ctx);
    res.status(201).json({ result });
  } catch (err) {
    next(err);
  }
};
```

### Service Context

Each service exports a standard context interface:

```typescript
export interface AccountContext {
  organizationId: string;
  actorId: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}
```

## Response Conventions

**Wrapper objects** - always wrap in named key:
- Single: `{ role: {...} }`, `{ user: {...} }`
- List: `{ roles: [...] }`, `{ sessions: [...] }`
- Paginated: `{ accounts: [...], pagination: { page, limit, total } }`
- Auth: `{ user: {...}, permissions: [...] }`
- Message: `{ message: 'Success' }`

**Status codes**:
- `200` - Success with body
- `201` - Created (POST that creates resource)
- `204` - No content (DELETE, logout)
- `400` - Validation error
- `401` - Unauthorized (no/invalid session)
- `403` - Forbidden (no permission, account inactive)
- `404` - Not found
- `409` - Conflict (duplicate email, name exists)

## Other API Folders

- `config/` - Environment, logger, redis, session
- `db/` - Drizzle schema, client, migrations
- `errors/` - Error classes, handler
- `types/` - Module augmentation (.d.ts files)

## Repository Patterns

### Soft Deletes

All queries filter soft-deleted records:

```typescript
.where(and(
  eq(table.id, id),
  eq(table.organizationId, organizationId),
  isNull(table.deletedAt)  // Always include
))
```

### Sequential IDs

Human-readable IDs use atomic counters:

```typescript
// Format: ACC-0001, AGT-0001, CLI-0001
const accountId = await getNextAccountId(ctx.organizationId);
```

### Mappers (in module utils.ts)

Convert DB rows to DTOs:

```typescript
export const mapAccount = (row: AccountRow): Account => ({
  id: row.id,
  name: row.name,
  status: row.status as Account['status'],
  createdAt: row.createdAt.toISOString(),  // Date → ISO string
  updatedAt: row.updatedAt.toISOString(),
});
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | lowercase | `middleware.ts`, `password.ts` |
| Classes | PascalCase | `AppError`, `ValidationError` |
| Functions/variables | camelCase | `hashPassword`, `requireAuth` |
| Types/interfaces | PascalCase | `SessionData`, `LoginInput` |
| Constants | SCREAMING_SNAKE_CASE | `SHUTDOWN_TIMEOUT` |
| Zod schemas | camelCase + Schema suffix | `loginSchema`, `createContactSchema` |
| DB tables | snake_case, plural | `users`, `role_permissions` |
| DB columns | snake_case | `created_at`, `organization_id` |
| Permissions | colon-separated | `contacts:read`, `contacts:write` |

## Error Handling

Throw error classes - handler formats response automatically:

```typescript
throw new ValidationError('Invalid input', details);  // 400
throw new UnauthorizedError();                        // 401
throw new ForbiddenError();                           // 403
throw new NotFoundError('User not found');            // 404
throw new ConflictError('Email already registered'); // 409
throw new AppError('Custom', 500, 'CUSTOM_CODE');     // Custom
```

- ZodError auto-converted to ValidationError
- Stack traces included in development only
- All errors logged with requestId

## Logging

```typescript
import { logger, createChildLogger } from './config/logger.js';

logger.info({ userId, action }, 'User logged in');
logger.error({ err, requestId }, 'Operation failed');

// Child logger for module context
const log = createChildLogger({ module: 'auth' });
log.info('Auth module initialized');
```

- Levels: `debug` (dev), `info`, `warn`, `error`, `fatal`
- Auto-redacted: `password`, `passwordHash`, `token`, `authorization`
- Always pass error as `{ err }` - pino serializes it properly

## Audit Logging

Fire-and-forget audit trail for compliance:

```typescript
import { logWithContext, AUDIT_ACTIONS, toAuditContext } from '../../lib/services/index.js';

// Convert service context to audit context
const auditCtx = toAuditContext(ctx);

// Log create/delete
logWithContext(auditCtx, {
  action: AUDIT_ACTIONS.ACCOUNT_CREATE,
  entityType: 'account',
  entityId: created.id,
  metadata: { accountId: created.accountId, name: created.name },
});

// Log updates with before/after
logWithContext(auditCtx, {
  action: AUDIT_ACTIONS.ACCOUNT_UPDATE,
  entityType: 'account',
  entityId: accountId,
  changes: { before: { name: 'Old' }, after: { name: 'New' } },
});
```

- Actions: `entity:action` format (`auth:login`, `account:create`, `role:permission_grant`)
- Never throws - errors logged internally
- Sensitive fields auto-redacted (password, token, etc.)
