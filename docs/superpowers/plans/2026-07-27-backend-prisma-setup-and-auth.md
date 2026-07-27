> **OBSOLETE.** Replaced by `docs/superpowers/plans/2026-07-27-backend-prisma-auth-foundation.md`. Do not implement this file.

# Backend Prisma Setup & Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize Prisma, set up TypeScript for the backend, define the full database schema, and migrate the Authentication module to the new architecture.

**Architecture:** We will set up `tsconfig.json` with `allowJs` so we can incrementally migrate. We will generate the Prisma client from `schema.prisma`, which includes `pgvector` support. We will then extract the authentication logic from `routes/auth.js` into a strictly typed `controllers/authController.ts` and `routes/auth.ts`.

**Tech Stack:** Node.js, TypeScript, Express, Prisma ORM, pgvector.

## Global Constraints

- Use ES Modules syntax (`import`/`export`) in all new `.ts` files.
- The `PrismaClient` singleton should be exported from a central configuration file.
- Do not modify frontend code.

---

### Task 1: TypeScript and Prisma Initialization

**Files:**
- Create: `backend/tsconfig.json`
- Modify: `backend/package.json`
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/config/prisma.ts`

**Interfaces:**
- Produces: `backend/src/config/prisma.ts` exporting a `prisma` instance of `PrismaClient`.

- [ ] **Step 1: Install Dependencies**

```bash
cd backend
npm install -D typescript ts-node @types/node @types/express @types/cors @types/jsonwebtoken @types/bcryptjs prisma
npm install @prisma/client
```

- [ ] **Step 2: Initialize TypeScript Configuration**

Create `backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "commonjs",
    "lib": ["es2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "allowJs": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "prisma/**/*"],
  "exclude": ["node_modules", "dist"]
}
```
*(Note: we keep module as commonjs temporarily because existing files use `require()`, `ts-node` will handle it).*

- [ ] **Step 3: Define Prisma Schema**

Create `backend/prisma/schema.prisma`:
```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

model User {
  id           Int           @id @default(autoincrement())
  name         String        @db.VarChar(255)
  email        String        @unique @db.VarChar(255)
  password     String        @db.VarChar(255)
  created_at   DateTime      @default(now())
  
  settings     UserSettings?
  conversations Conversation[]
  documents    Document[]
  
  @@map("users")
}

model UserSettings {
  user_id           Int      @id
  system_prompt     String?  @db.Text
  default_model     String   @default("gpt-3.5-turbo")
  default_provider  String   @default("openai")
  openai_api_key    String?  @db.VarChar(255)
  ollama_url        String?  @db.VarChar(255)
  updated_at        DateTime @default(now())
  
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  
  @@map("user_settings")
}

model Conversation {
  id         Int       @id @default(autoincrement())
  user_id    Int
  title      String    @db.VarChar(255)
  created_at DateTime  @default(now())
  updated_at DateTime  @default(now())
  
  user       User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  messages   Message[]
  
  @@map("conversations")
}

model Message {
  id              Int          @id @default(autoincrement())
  conversation_id Int
  role            String       @db.VarChar(50)
  content         String       @db.Text
  created_at      DateTime     @default(now())
  
  conversation    Conversation @relation(fields: [conversation_id], references: [id], onDelete: Cascade)
  
  @@map("messages")
}

model Document {
  id            Int             @id @default(autoincrement())
  user_id       Int
  filename      String          @db.VarChar(255)
  mimetype      String          @db.VarChar(100)
  size          Int
  uploaded_at   DateTime        @default(now())
  
  user          User            @relation(fields: [user_id], references: [id], onDelete: Cascade)
  chunks        DocumentChunk[]
  
  @@map("documents")
}

model DocumentChunk {
  id          Int      @id @default(autoincrement())
  document_id Int
  content     String   @db.Text
  embedding   Unsupported("vector(1536)")?
  
  document    Document @relation(fields: [document_id], references: [id], onDelete: Cascade)
  
  @@map("document_chunks")
}
```

- [ ] **Step 4: Generate Client and Create Config File**

Run: `npx prisma generate` in the `backend` folder.

Create `backend/src/config/prisma.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
```

### Task 2: Migrate Authentication Module to TypeScript

**Files:**
- Create: `backend/src/controllers/authController.ts`
- Modify: `backend/src/routes/auth.js` (Rename to `.ts` and rewrite)

**Interfaces:**
- Consumes: `prisma` from `src/config/prisma.ts`

- [ ] **Step 1: Write Auth Controller**

Create `backend/src/controllers/authController.ts`:
```typescript
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import prisma from '../config/prisma';
import logger from '../logger'; // Assuming logger is still CommonJS but we can import it

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

export const register = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email, password, name } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'Користувач з таким email вже існує' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
      select: { id: true }
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
    logger.info(`New user registered: ${email} (id=${user.id})`);
    res.status(201).json({ token, userId: user.id });
  } catch (error: any) {
    logger.error(`POST /auth/register error: ${error.message}`);
    res.status(500).json({ error: 'Помилка сервера при реєстрації' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(400).json({ error: 'Невірний email або пароль' });
      return;
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
    logger.info(`User logged in: ${email} (id=${user.id})`);
    res.json({ token, userId: user.id });
  } catch (error: any) {
    logger.error(`POST /auth/login error: ${error.message}`);
    res.status(500).json({ error: 'Помилка сервера при вході' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'Токен відсутній' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as { userId: number };
    
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      res.status(401).json({ error: 'Користувача не знайдено' });
      return;
    }

    const newToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
    res.json({ token: newToken });
  } catch (error: any) {
    logger.error(`POST /auth/refresh error: ${error.message}`);
    res.status(401).json({ error: 'Невалідний токен' });
  }
};
```

- [ ] **Step 2: Rewrite Auth Routes in TypeScript**

Rename `backend/src/routes/auth.js` to `backend/src/routes/auth.ts` and rewrite:
```typescript
import express from 'express';
import { body } from 'express-validator';
import { register, login, refresh } from '../controllers/authController';

const router = express.Router();

router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Невалідна email адреса'),
  body('name').trim().notEmpty().isLength({ min: 2, max: 255 }).withMessage("Ім'я має бути від 2 до 255 символів"),
  body('password').isLength({ min: 8 }).matches(/[A-Z]/).matches(/[0-9]/).withMessage('Пароль: мін. 8 символів, одна велика літера та одна цифра')
], register);

router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Невалідна email адреса'),
  body('password').notEmpty().withMessage('Пароль є обов\'язковим')
], login);

router.post('/refresh', refresh);

export default router;
module.exports = router; // Temporary fallback for CommonJS index/server imports
```

- [ ] **Step 3: Test Authentication Endpoints**

Run the backend server via `npx ts-node src/server.js` or standard node if tests pass via Jest.
Verify existing tests still pass:
```bash
npm test tests/routes/auth.test.js # if exists, or just verify server starts
```

### Task 3: Fix Production Readiness & Test Issues

**Files:**
- Modify: ackend/package.json
- Modify: ackend/jest.config.js
- Modify: ackend/src/controllers/authController.ts
- Modify: ackend/src/__tests__/auth.test.js
- Modify: ackend/src/config/prisma.ts

- [ ] **Step 1: Fix App Startup and Build Scripts**
Update ackend/package.json to include:
- "start": "node -r ts-node/register src/server.js"
- "dev": "nodemon --exec ts-node src/server.js"
- "build": "tsc"
Install 	s-node as a dependency if needed.

- [ ] **Step 2: Fix Test Runner**
Update ackend/jest.config.js to use 	s-jest for seamless TypeScript test execution.
Update ackend/package.json to "test": "jest".

- [ ] **Step 3: Enhance Test Coverage & Fix Issues**
Add unit/integration tests in ackend/src/__tests__/auth.test.js for successful registration, login with valid/invalid passwords, and token refresh.
Fix insecure fallback JWT Secret in ackend/src/controllers/authController.ts (throw error if missing).
Fix timing side-channel risk on login (perform dummy compare if user is null).
Attach Prisma to globalThis in development mode in ackend/src/config/prisma.ts.
