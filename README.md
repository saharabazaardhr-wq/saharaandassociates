# Sahara & Associates

B2B accounting web app: sales, purchases, receipts, payments, expenses, contra, party ledger,
sundry debtors/creditors, balance sheet, profit & loss, company/party profile and GST/TDS details.

Static site (no build step). Open `index.html` or deploy the folder as-is.

## Server database (live data)
The website logs in with e-mail + password (Supabase Auth) and keeps the books in `public.sa_docs` (JSON documents:
`meta/books`, `parties/*`, `vch_<fy>/*`). Only e-mails listed in `public.sa_allowed` can read or write (row level security).
`supabase/sa_schema.sql` has the schema. To give someone access: `insert into public.sa_allowed(email) values ('x@y.com');`
and that person needs a Supabase Auth user with the same e-mail. "Bina login" keeps the old browser-only mode.
