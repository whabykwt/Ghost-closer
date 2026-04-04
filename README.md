# 👻 Ghost Closer — Launch Guide

Dead lead revival engine for car dealerships.
Built with React + Supabase + Claude AI.

---

## 🚀 Launch in 5 Steps (Under 1 Hour)

### STEP 1 — Set Up Your Database (Supabase) — 10 min

1. Go to **supabase.com** and click "Start your project" (free)
2. Sign up and create a new project — name it "ghost-closer"
3. Choose a region close to you (Canada East works great)
4. Wait ~2 minutes for it to spin up
5. Go to **SQL Editor** → **New Query**
6. Open the file `schema.sql` from this folder
7. Copy everything and paste it into the SQL editor
8. Click **Run** — you'll see "Ghost Closer schema installed successfully! 👻"
9. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://abc123.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)

---

### STEP 2 — Add Your Keys — 2 min

1. In this folder, find the file called `.env.example`
2. Make a copy of it and rename the copy to `.env`
3. Open `.env` and replace the placeholder values:

```
REACT_APP_SUPABASE_URL=https://your-actual-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGc...your-actual-key
```

Save the file.

---

### STEP 3 — Deploy to Vercel — 10 min

**Option A — GitHub (recommended):**
1. Create a free account at **github.com**
2. Create a new repository called "ghost-closer"
3. Upload this entire folder to the repo
4. Go to **vercel.com** → "Add New Project"
5. Import your GitHub repo
6. Under **Environment Variables**, add:
   - `REACT_APP_SUPABASE_URL` → your Supabase URL
   - `REACT_APP_SUPABASE_ANON_KEY` → your Supabase anon key
7. Click **Deploy** — Vercel builds and hosts it automatically

**Option B — Vercel CLI:**
```bash
npm install -g vercel
cd ghost-closer
npm install
vercel
# Follow the prompts — add env vars when asked
```

---

### STEP 4 — Create Your Account — 2 min

1. Open your new Ghost Closer URL (e.g., `ghost-closer.vercel.app`)
2. Click "Create one free"
3. Enter your dealership name, email, and password
4. Check your email and confirm your account
5. Sign in — your dashboard is ready!

---

### STEP 5 — Import Your Dead Leads — 5 min

1. Open PBS Dealer Solutions → CRM → Lead Management
2. Filter by: Status = Lost / Dead / No Sale
3. Date range: Last 6–18 months
4. Click Export → Excel
5. In Ghost Closer, click **Import PBS**
6. Drop your file in — leads import instantly
7. Click any lead → **Generate Revival Message** → 🔥

---

## 🌐 Custom Domain (Optional — $15/year)

1. Buy a domain at **namecheap.com** or **godaddy.com**
   - Suggestions: `ghostcloser.ca`, `yourdealer-leads.ca`
2. In Vercel → your project → **Settings → Domains**
3. Add your domain and follow the DNS instructions (5 min setup)

---

## 👥 Adding Team Members (Your Sales Reps)

Currently the app is single-user per dealership. To add team members:
1. Share your Ghost Closer URL with your reps
2. They create accounts with their own email
3. **Note:** Multi-user team support (shared pipeline) is the next upgrade — 
   ask your developer to add a `team_members` table to Supabase linking 
   multiple users to one dealership

---

## 🔧 Tech Stack

| Layer | Tool | Cost |
|-------|------|------|
| Frontend | React | Free |
| Hosting | Vercel | Free |
| Database | Supabase | Free up to 500MB |
| AI (messages) | Claude AI via Anthropic | Pay per use |
| Domain | Namecheap/GoDaddy | ~$15/year |

**Total monthly cost to run: $0 to start**

---

## 📁 File Structure

```
ghost-closer/
├── public/
│   └── index.html          # App shell
├── src/
│   ├── lib/
│   │   └── supabase.js     # Database connection + helpers
│   ├── pages/
│   │   ├── LoginPage.js    # Sign in / Sign up
│   │   └── Dashboard.js    # Main app (leads, AI, import)
│   ├── App.js              # Routing + auth
│   ├── index.js            # React entry point
│   └── index.css           # Global styles
├── schema.sql              # Run this in Supabase SQL Editor
├── .env.example            # Copy → .env and fill in your keys
├── .env                    # Your actual keys (never commit this!)
├── package.json            # Dependencies
├── vercel.json             # Vercel deployment config
└── README.md               # This file
```

---

## 🆘 Need Help?

Common issues:

**"Invalid API key"** → Double-check your `.env` keys match exactly what's in Supabase Settings → API

**"Table doesn't exist"** → Make sure you ran `schema.sql` in the Supabase SQL Editor and clicked Run

**"Build failed on Vercel"** → Make sure your Environment Variables are set in Vercel project settings (not just in .env)

**Leads not saving** → Check Supabase → Authentication → Users — make sure your account appears there

---

Built with 👻 by Ghost Closer
