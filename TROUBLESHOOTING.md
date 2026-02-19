# Troubleshooting Guide

## Issue: Prisma Client Generation Failed

The automated setup encountered an issue generating the Prisma Client, likely due to environment variable configuration or platform-specific binary issues.

### Symptoms
- Error: `PrismaClientInitializationError` when running the app.
- Command `npx prisma generate` fails with exit code 1.

### Solution

1. **Verify .env file**
   Ensure the `.env` file exists in the root directory and contains:
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/ess_app?schema=public"
   ```
   *Replace with your actual PostgreSQL connection string.*

2. **Run Generation Manually**
   Open a terminal in the project root and run:
   ```

2. **Run Generation Manually** (IMPORTANT)
   Since the automated process failed, run this in your terminal:
   ```powershell
   npx prisma generate
   npx prisma db push
   ```
   *This creates the tables in your NeonDB.*

3. **Seeding Data**
   Populate the master tables:
   ```powershell
   npx prisma db seed
   ```

## Issue: UI Styling

If styles look broken or ShadCN components are missing styles:
1. Ensure `app/globals.css` contains `@tailwind base; ...`.
2. Verify `tailwind.config.ts` includes the `content` paths.
