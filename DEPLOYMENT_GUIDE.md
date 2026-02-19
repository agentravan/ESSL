# ☁️ Cloud Deployment & Database Setup Guide

To run this application properly on the internet (via Vercel), you need a **real cloud database**.

## 1. Get a Database API URL (Free)
You need a PostgreSQL database. Recommended free providers:
- **Neon Tech** (Easiest): [https://neon.tech](https://neon.tech)
- **Supabase**: [https://supabase.com](https://supabase.com)
- **Railway**: [https://railway.app](https://railway.app)

**Steps:**
1.  Create an account on one of the above.
2.  Create a new Project (e.g., "ESS-App").
3.  Copy the **Connection String** (It looks like: `postgres://user:pass@host.com/dbname`).
    *   *This is your API Key / Database configuration.*

## 2. Configure Vercel
1.  Go to your project settings in Vercel.
2.  Navigate to **Environment Variables**.
3.  Add a new variable:
    -   **Key**: `DATABASE_URL`
    -   **Value**: (Paste your connection string from Step 1)
4.  Save and **Redeploy**.

## 3. Login Credentials (Demo)
Once deployed, use these details to log in:

| Role | Email | Password |
| :--- | :--- | :--- |
| **HR Admin** | `hr@company.com` | `admin123` |
| **Manager** | `manager@company.com` | `admin123` |
| **Employee** | `employee@company.com` | `user123` |

## 4. How to Update Code
Whenever you want to update the live site:
1.  Run `setup_github.bat` on your PC.
2.  Vercel will automatically detect the changes and update the website.
