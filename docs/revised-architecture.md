# Merchant Intelligence for PO Payments

## Revised Architecture for Visa-Backed Prototype

Version `0.2`  
Date `2026-04-17`

## 1. Problem Context

JAGGAER Pay PO Payments needs to:

- resolve a free-text supplier name entered during the request workflow into a merchant the employee can confirm
- validate after settlement that the merchant who charged the card matches the intended merchant captured on the PO

The card remains a general-purpose virtual card. Merchant Intelligence does not apply network controls at issuance. JAGGAER owns purchase intent and post-settlement validation.

## 2. Confirmed Design Decisions

### 2.1 Merchant resolution at request time remains mandatory

The employee must still see a suggested merchant to confirm during the request workflow. Invoice analysis does not replace request-time discovery.

### 2.2 Visa integrations are split by responsibility

- `Visa Merchant Search` is the Tier 2 source for merchant identity resolution and enrichment
- `Visa Supplier Matching` is used only after the merchant has been confirmed, to retrieve card acceptance data

### 2.3 Request-time input is minimal

The prototype assumes the request workflow provides `supplierName` only. This means:

- the internal Merchant Graph remains the fastest and most reliable source over time
- Visa Merchant Search and web discovery must tolerate sparse inputs
- Supplier Matching is deferred until after confirmation, when the system has a cleaner merchant identity

### 2.4 Invoice and receipt analysis are first-class validation inputs

Invoices or receipts are uploaded after the transaction posts to JAGGAER but before validation starts. This makes document extraction part of the standard verification pipeline.

### 2.5 Merchant records stay provider-neutral

The Merchant Graph owns the internal merchant identity. External provider identifiers are stored as integration metadata:

```json
{
  "externalReferences": {
    "visa": {
      "merchantId": "optional",
      "storeId": "optional",
      "enterpriseId": "optional"
    }
  }
}
```

### 2.6 Descriptor patterns are learned internally

The prototype does not assume Visa provides statement descriptor patterns. Descriptor allow-lists are learned from confirmed transaction history and review queue resolutions.

## 3. End-to-End Flow

### 3.1 Merchant discovery flow

1. Employee enters a supplier name in JAGGAER.
2. Merchant Graph lookup runs first using fuzzy match on canonical names and aliases.
3. If no high-confidence graph match exists, the system calls `Visa Merchant Search`.
4. If Visa Merchant Search does not return a usable suggestion, the system falls back to web discovery plus LLM normalization.
5. The employee confirms one suggested merchant.
6. The confirmed merchant identity is stored on the PO and in the Merchant Graph.
7. After confirmation, the system optionally calls `Visa Supplier Matching` to capture card acceptance data for supported countries.

### 3.2 Settlement validation flow

1. Transaction data is posted to JAGGAER.
2. The invoice or receipt is already attached before validation begins.
3. Document Intelligence extracts merchant and payment evidence from the invoice or receipt.
4. The scoring engine compares:
   - the confirmed merchant stored on the PO
   - settlement descriptor, MCC, amount, and currency
   - Supplier Matching acceptance data when available
   - invoice-extracted merchant evidence
5. The outcome is:
   - `AUTO_RECONCILE`
   - `REVIEW_QUEUE`
   - `EXCEPTION`
6. Confirmed outcomes feed descriptor learning and merchant alias updates.

## 4. System Components

| Component | Responsibility |
| --- | --- |
| Merchant Graph Service | Canonical merchant store with aliases, domains, MCCs, descriptors, history, and external references |
| Merchant Discovery Service | Runs graph lookup, Visa Merchant Search, and web fallback |
| Visa Merchant Search Adapter | Merchant identity search using provider adapter contract |
| Visa Supplier Matching Adapter | Post-confirmation acceptance enrichment using provider adapter contract |
| Document Intelligence Service | Extracts merchant evidence from uploaded invoices and receipts |
| Transaction Intelligence Service | Computes score, breakdown, and outcome tier |
| Review Queue Service | Stores ambiguous validations and accepts manual resolutions |
| Audit Log Service | Immutable record of discovery, confirmation, and validation decisions |

## 5. Data Model

### 5.1 Merchant

```json
{
  "id": "m_123",
  "canonicalName": "Adobe Inc.",
  "aliases": ["Adobe", "Adobe Creative Cloud"],
  "domain": "adobe.com",
  "countryCode": "US",
  "mcc": "5734",
  "descriptors": ["ADOBE *CREATIVE CLD"],
  "acceptance": {
    "supportsCommercialCards": true,
    "source": "visa-supplier-matching",
    "lastCheckedAt": "2026-04-17T05:00:00.000Z"
  },
  "externalReferences": {
    "visa": {
      "merchantId": "vm_001",
      "storeId": "vs_001",
      "enterpriseId": "ve_001"
    }
  },
  "confidenceHistory": [],
  "source": "graph|visa_merchant_search|web_discovery|manual"
}
```

### 5.2 PO merchant snapshot

Each PO stores a merchant snapshot at confirmation time so later scoring uses the exact intent that the employee confirmed, not a mutable future merchant record.

### 5.3 Invoice evidence

Structured invoice evidence contains:

- extracted merchant name
- domain or website
- address and country when present
- invoice date
- total amount and currency
- tax or VAT identifiers when present

## 6. Discovery and Validation Signals

### 6.1 Request-time resolution signals

- graph alias similarity
- Visa Merchant Search confidence
- domain quality
- country alignment when available
- web/LLM confidence

### 6.2 Settlement validation signals

- descriptor similarity
- MCC alignment
- amount match
- invoice merchant name match
- invoice domain match
- invoice country match
- acceptance support from Supplier Matching
- request type weighting

## 7. API Shape

### 7.1 Merchant discovery

- `POST /merchant/search`
- `POST /merchant/discover`
- `POST /merchant/confirm`
- `GET /merchant/:id`

### 7.2 Transaction validation

- `POST /transaction/verify`
- `GET /transaction/:id/result`
- `POST /transaction/:id/resolve`

### 7.3 Infrastructure

- `GET /health`
- `GET /ready`

## 8. Country Support

The prototype targets:

- `US`
- `UK`
- supported `EU` countries

Supplier Matching must gracefully skip unsupported countries. Merchant discovery still proceeds even if acceptance enrichment is unavailable.

## 9. Prototype Constraints

- Visa credentials are not available yet
- Visa integrations are mocked behind stable provider interfaces
- the prototype focuses on end-to-end behavior, not production calibration
- invoice extraction is regex-based and intentionally lightweight for local development

## 10. Implementation Guidance

The production implementation can continue to use the existing service-oriented API shape from the original document. The prototype should preserve those boundaries so the mock adapters can be replaced with real Visa adapters when credentials arrive.
