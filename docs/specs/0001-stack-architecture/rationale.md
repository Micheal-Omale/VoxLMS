# 0001. Stack and architecture: rationale

Decision record for [index.md](index.md). Not needed during a build.

## Context

We are building a results and report card system for Nigerian primary and secondary schools. The first customer is one pilot school with under 200 students, and the system must be ready for First Term 2026/2027 results (exams end around early December 2026), about seven weeks away. The team is very small and money is tight: no paid services until a school pays, and no business registration (CAC) yet.

The product is used in bursts. Teachers enter scores heavily for a few weeks at the end of each term, then nobody signs in during the holidays. Whatever stores the data must survive long idle gaps without manual restarts, and must let us recover from mistakes (a wrong upload, a bad bug), because lost results are the worst failure this product can have.

It must serve many schools from one system later, with each school's data kept apart, and it will later grow parent result links (Phase 2) and a learning platform for students. Users are teachers on phones and staffroom computers with uneven internet, so pages must stay light. Output is printed A4 report cards and Excel broadsheets, and input includes the school's Excel lists.

## Options considered

### Option 1: Next.js monolith on Vercel, Neon Postgres, Better Auth

One TypeScript Next.js app holds all pages and server logic; Neon stores data; Better Auth handles logins inside the app; PDFs and Excel files are made on the server.

**Pros**:
- Free while building; one codebase and one deploy.
- Neon wakes itself after idle time and offers a restore window of a few hours on the free plan.
- No outside login service; schools' data and logins live in one database we control.

**Cons**:
- Vercel's free plan forbids commercial use, so a paid move comes before launch.
- We maintain login settings ourselves; logins and file storage are separate pieces to wire up.

### Option 2: Next.js with Supabase (database, logins, and file storage in one)

Same app, but Supabase provides Postgres, built in logins, and file storage in one dashboard.

**Pros**:
- Logins and file storage come built in, so less setup.
- One dashboard for data, users, and files.

**Cons**:
- The free plan pauses a project after about a week of no use, which matches every school holiday; it needs a keep awake job.
- No restorable backups on the free plan, so a separate backup job is needed. Two jobs that can fail silently.

### Option 3: Laravel (PHP) on Nigerian shared hosting

A PHP app on a local host billed in naira, with MySQL and server side PDF generation.

**Pros**:
- Cheap hosting paid in naira, common among Nigerian developers.
- Mature, all in one framework (logins, queues, mail).

**Cons**:
- A second language and toolset next to the JavaScript tools already set up here.
- Shared hosting means manual deploys, uneven uptime, and backups we must run ourselves.

### Option 4: Google Sheets with Apps Script

Teachers enter scores in shared sheets; a script fills a report card template.

**Pros**:
- Almost no build time; teachers already know spreadsheets.

**Cons**:
- No real per teacher access control; one bad edit breaks a class.
- Cannot grow into a multi school product, parent links, or a learning platform.

## Rationale

The forces that decide this are cost, idle gaps, safety of results, and the seven week deadline. Option 1 is free until a school pays, and Neon specifically fits the burst usage: it sleeps when idle and wakes on the first request, so no keep awake job is needed. Its free restore window is only a few hours, though, so like Option 2 it still needs a nightly backup copy. Option 1 needs one scheduled job (the backup) where Option 2 needs two (backup plus keep awake), which matters for a tiny team that cannot watch dashboards.

Keeping logins inside the app (Better Auth) avoids a second paid service and keeps every school's data in one database we control, which suits the plan to onboard more schools without new code. Option 3 is a fair choice for naira billing, but it splits the team across two toolsets and pushes deploys and backups back onto us. Option 4 is fastest for one school but fails the multi school and access control needs outright.

The main cost we accept is the move off Vercel Hobby before the first paid term (owned by the Launch readiness feature), plus a small delay from hosting in Europe, since neither Vercel nor Neon offers a Nigerian region.
