# Merchant Intelligence Prototype

This workspace contains:

- a revised architecture spec aligned to the latest decisions
- a working local prototype with mock Visa integrations
- fixture data for merchant discovery, card acceptance enrichment, and invoice-assisted validation

## Run

```powershell
node .\src\server.js
```

The server listens on `http://localhost:3000`.

## Render Deploy

This project is now prepared for `Render` as a normal Node web service.

Files added for deployment:

- [render.yaml](/C:/Users/mlwunze/Documents/Codex/2026-04-16-files-mentioned-by-the-user-merchant/merchant-intelligence-prototype/render.yaml)
- [.gitignore](/C:/Users/mlwunze/Documents/Codex/2026-04-16-files-mentioned-by-the-user-merchant/merchant-intelligence-prototype/.gitignore)

Expected Render settings if you create the service manually:

- Runtime: `Node`
- Build command: `npm install`
- Start command: `npm start`

Notes:

- The server now respects `PORT`, which Render injects automatically.
- OCR language data is stored in the repo under `tessdata/`, so image invoice OCR can work after deploy without a separate download step.
- The app uses regular npm dependencies on Render and falls back to the local bundled runtime only on this machine.

## Key prototype choices

- `Visa Merchant Search` is the Tier 2 merchant discovery source
- `Visa Supplier Matching` is used only after merchant confirmation to capture card acceptance data
- invoice and receipt data are part of the standard pre-validation pipeline
- merchant records stay provider-neutral and keep Visa identifiers inside `externalReferences.visa`
- descriptor patterns are learned from confirmed transaction history rather than seeded from Visa

## Main endpoints

- `GET /health`
- `POST /merchant/search`
- `POST /merchant/discover`
- `POST /merchant/confirm`
- `POST /transaction/verify`
- `GET /merchant/:id`
- `GET /transaction/:id/result`

## Example flow

1. Discover a merchant:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/merchant/discover -ContentType 'application/json' -Body '{"supplierName":"Adobe Creative Cloud","countryCode":"US"}'
```

2. Confirm the merchant:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/merchant/confirm -ContentType 'application/json' -Body '{"idempotencyKey":"demo-1","supplierName":"Adobe Creative Cloud","selectedCandidateId":"visa-search-adobe-us","countryCode":"US","requestType":"Online Purchase","poNumber":"PO-1001"}'
```

3. Verify a transaction:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/transaction/verify -ContentType 'application/json' -Body '{"poNumber":"PO-1001","requestType":"Online Purchase","descriptor":"ADOBE *CREATIVE CLD","mcc":"5734","amount":59.99,"currency":"USD","invoiceText":"Invoice From: Adobe Inc`nWebsite: adobe.com`nAmount Due: 59.99 USD`nInvoice Date: 2026-04-16"}'
```
