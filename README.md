# Santiano Books — Phase 2A Admin

Adds a development admin dashboard for uploading and managing real eBooks.

## Setup

1. Copy/merge the `server` files into your existing Phase 2 backend.
2. In `santiano_books`, run `server/db_patch.sql`.
3. In `server`, run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set `ADMIN_EMAIL` to the email you will use for your Santiano Books admin account.
6. Start with `npm run dev`.
7. Register that email through the existing `/api/auth/register` endpoint.
8. Open `admin/index.html` with VS Code Live Server.

Uploaded PDFs are stored locally for development. Before public launch, move eBooks to private object storage and use short-lived authorized access links. Payment processing comes later and must be verified server-side.
"# santiano-books" 
