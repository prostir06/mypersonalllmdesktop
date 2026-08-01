# Backend Architecture Refactoring (Phase 5+)

## Overview
A comprehensive "Big Bang" refactoring of the backend application to migrate from CommonJS JavaScript and raw SQL queries (via `pg` pool) to a strictly typed TypeScript architecture utilizing Prisma ORM.

## Objectives
- **Type Safety**: Eliminate runtime errors by strictly typing all API inputs, outputs, middlewares, and business logic.
- **ORM Integration**: Replace raw SQL with Prisma Client to streamline database interactions and migration management.
- **Maintainability**: Transition to modern ES Modules and decouple business logic into properly typed services.
- **RAG Optimization**: Modernize `pgvector` usage through Prisma's native vector extension capabilities.

## Architecture & Structure

### File Structure Transformation
All `.js` files in the `backend/` directory will be renamed to `.ts` and refactored.
- `prisma/schema.prisma`: New single source of truth for the database schema.
- `src/types/`: Centralized TypeScript interfaces (e.g., custom Express Request extending `req.userId`).
- `src/server.ts`: Entry point.
- `src/controllers/`, `src/services/`, `src/routes/`: Converted to ES Modules and fully typed.

### Database Schema (Prisma)
The database structure will be modeled in `schema.prisma`. 
Key models:
- `User`: ID, username, password hash, created_at.
- `UserSettings`: 1-to-1 with User, stores API keys and preferred settings.
- `Conversation`: 1-to-many with User.
- `Message`: 1-to-many with Conversation.
- `Document`: 1-to-many with User, stores uploaded files.
- `DocumentChunk`: 1-to-many with Document, stores text chunks and their embeddings.

**Vector Search (pgvector):**
The `postgresqlExtensions` preview feature in Prisma will be enabled.
The `DocumentChunk` model will define an `embedding` field as `Unsupported("vector(1536)")`.
Similarity search will be executed using typed `prisma.$queryRaw` queries combining Prisma models and the `<->` (L2 distance) or `<#>` (cosine similarity) vector operators.

## Data Flow & API Handling
1. **Routing**: `express.Router()` defining endpoints.
2. **Middleware**: Auth middleware (`authenticateToken.ts`) will securely extract JWT and append `userId` to the Express Request object.
3. **Controller**: Validates HTTP requests (via `express-validator`), extracts payloads, and delegates processing to Services. Returns strict JSON responses.
4. **Service**: Contains core business logic (e.g., OpenAI API calls, chunking logic) and interacts with the database solely via `PrismaClient`.

## Error Handling
- A centralized `errorHandler.ts` will catch unhandled promise rejections and Prisma-specific errors (e.g., unique constraint violations, record not found) and map them to appropriate HTTP status codes.

## Implementation Strategy ("Big Bang")
1. Initialize `tsconfig.json` with strict mode enabled.
2. Install Prisma, initialize `schema.prisma`, and configure the PostgreSQL connection.
3. Define the entire Prisma schema matching the existing database tables.
4. Rename all backend files from `.js` to `.ts`.
5. Rewrite imports/exports to ES Module syntax.
6. Refactor all database queries to use `PrismaClient`.
7. Resolve all TypeScript compilation errors across controllers, services, and middlewares.
8. Validate the transition by running the existing (or updated) test suite using `ts-jest`.

## Trade-offs and Constraints
- **Downtime in Development**: The "Big Bang" approach means the backend will temporarily be in an uncompilable state until the entire migration is complete.
- **Complex Vector Queries**: While Prisma handles standard CRUD elegantly, highly dynamic SQL queries involving vector thresholds may still require `prisma.$queryRaw`, which slightly reduces the benefit of full auto-completion for those specific queries.
