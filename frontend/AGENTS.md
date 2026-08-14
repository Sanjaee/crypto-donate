# Frontend Development Workflow

## Build & Typecheck Commands

Always run after making changes:

```bash
cd frontend
npm run typecheck
npm run lint
npm run build
```

## Agent Instructions

- **After any code change**: Run `npm run typecheck` and `npm run lint` automatically
- **Before commit**: Run `npm run build` to verify production build passes
- **On CI/CD**: Run all three commands in sequence
- **Docker rebuild**: After `npm run build` passes, run `docker compose up -d --build nextjs` from project root to rebuild the Next.js container

## TypeScript Config

- Strict mode enabled
- Path aliases: `@/*` → `./*`
- Next.js 15 with App Router

## Linting

- ESLint with Next.js config
- Run `npm run lint` before pushing