<p align="center">
  <img src="public/assets/banner.png" alt="Nasab Al-Baraja Banner" width="100%"/>
</p>

<h1 align="center">Nasab Al-Baraja</h1>
<h3 align="center">شَجَرَةُ آلِ بَارَجَاء</h3>
<p align="center"><em>An interactive Arabic family tree built with React, Vite, and Supabase.</em></p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white" alt="React"/>
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/Platform-Web%20%26%20Android-34A853?logo=android&logoColor=white" alt="Platform"/>
  <img src="https://img.shields.io/badge/Language-AR%20%7C%20EN%20%7C%20ID-blueviolet" alt="Languages"/>
</p>

---

## About

Nasab Al-Baraja is a multilingual family tree application for visualizing and maintaining the Al-Baraja lineage. It supports large trees, animated navigation, public suggestions, admin verification, and realtime synchronization through Supabase.

The project runs as a Vite web app and can also be packaged for Android through Capacitor.

---

## Features

- Interactive family graph with auto layout via React Flow and Dagre
- Full lineage search in Arabic, English, and Indonesian
- Public suggestion workflow for add-child and name-change proposals
- Admin approval flow with pending-node focus and verification queue
- Realtime notices and updates via Supabase subscriptions
- Theme switching, saved viewport, and mobile-friendly UI

---

## Tech Stack

```text
Frontend       React 18 + Vite 5
Graph          @xyflow/react + Dagre
Backend        Supabase (Postgres, Realtime, Auth)
Mobile         Capacitor Android
Styling        Vanilla CSS
Icons          Lucide React
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A Supabase project

### Installation

```bash
git clone https://github.com/dillahbaraja/nasab-al-baraja.git
cd nasab-al-baraja
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your project values:

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your_public_anon_key"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_for_server_side_scripts_only"
```

Notes:
- The frontend only needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` is only for local/server-side scripts and must never be exposed to the browser.

### Run Locally

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

---

## Supabase Setup

Before using the public suggestion workflow, make sure your Supabase project is configured:

1. Enable `Anonymous sign-ins` in Supabase Auth.
2. Run [supabase_guest_policies.sql](./supabase_guest_policies.sql) in the Supabase SQL Editor.
3. Confirm the initial admin exists in `public.admin_users`.

To add another admin later:

```sql
insert into public.admin_users (email)
values ('adminbaru@example.com')
on conflict (email) do nothing;
```

To remove an admin:

```sql
delete from public.admin_users
where email = 'adminbaru@example.com';
```

---

## Deploy to Vercel

This project is ready for Vercel as a standard Vite app.

Set these Environment Variables in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Recommended build settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

After deploy, make sure your Supabase project already has:
- the `nodes` and `notices` tables
- the `admin_users` table
- the policies from `supabase_guest_policies.sql`

---

## Project Structure

```text
nasab-al-baraja/
├── src/
│   ├── FamilyGraph.jsx
│   ├── FamilyNode.jsx
│   ├── NodeEditModal.jsx
│   ├── layout.js
│   ├── i18n.js
│   ├── supabase.js
│   └── index.css
├── public/
│   └── assets/
├── android/
├── .env.example
├── supabase_guest_policies.sql
└── task.md
```

---

## Android

```bash
npm run build
npx cap sync
npx cap open android
```

---

## Notes

- The app expects the `nodes` table to contain numeric `id` values.
- Public suggestions are stored as pending data and remain visible until verified by an admin.
- Admin access is determined from `public.admin_users`, not simply from “logged in” status.

---

## Author

**Abdillah Baradja**  
Email: [dillahbaraja@gmail.com](mailto:dillahbaraja@gmail.com)

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
