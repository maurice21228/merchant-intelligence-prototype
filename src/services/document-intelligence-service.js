import { normalizeText, scoreNameSimilarity } from "../lib/utils.js";

function matchRegex(text, regex) {
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

export class DocumentIntelligenceService {
  extract(invoiceText) {
    const raw = String(invoiceText || "");
    const normalized = normalizeText(raw);

    const merchantName =
      matchRegex(raw, /(?:Invoice From|Merchant|Supplier)\s*:\s*(.+)/i) ||
      matchRegex(raw, /(?:Bill From)\s*:\s*(.+)/i);
    const domain = matchRegex(raw, /(?:Website|Domain)\s*:\s*([A-Za-z0-9.-]+\.[A-Za-z]{2,})/i);
    const amount = matchRegex(raw, /(?:Amount Due|Total|Invoice Total)\s*:\s*([0-9.,]+)/i);
    const currency = matchRegex(raw, /(?:Amount Due|Total|Invoice Total)\s*:\s*[0-9.,]+\s*([A-Z]{3})/i);
    const invoiceDate = matchRegex(raw, /(?:Invoice Date|Date)\s*:\s*([0-9-]{8,10})/i);
    const countryCode = matchRegex(raw, /(?:Country|Country Code)\s*:\s*([A-Z]{2})/i);

    return {
      merchantName,
      domain: domain ? domain.toLowerCase() : null,
      amount: amount ? Number(amount.replace(/,/g, "")) : null,
      currency,
      invoiceDate,
      countryCode,
      confidence: normalized.length > 0 ? 0.7 : 0
    };
  }

  compareToMerchant(invoiceEvidence, merchantSnapshot) {
    return {
      merchantNameSimilarity: invoiceEvidence.merchantName
        ? scoreNameSimilarity(invoiceEvidence.merchantName, merchantSnapshot.canonicalName)
        : 0,
      domainMatch: invoiceEvidence.domain && merchantSnapshot.domain
        ? Number(invoiceEvidence.domain === merchantSnapshot.domain)
        : 0,
      countryMatch: invoiceEvidence.countryCode && merchantSnapshot.countryCode
        ? Number(invoiceEvidence.countryCode === merchantSnapshot.countryCode)
        : 0,
      amountMatch: invoiceEvidence.amount ? invoiceEvidence.amount : null
    };
  }

  buildScanSummary(invoiceEvidence) {
    return {
      stage: "mock_llm_scan",
      summary: invoiceEvidence.merchantName
        ? `Invoice scan found merchant evidence for ${invoiceEvidence.merchantName}.`
        : "Invoice scan found limited merchant evidence.",
      extractedFields: {
        merchantName: invoiceEvidence.merchantName,
        domain: invoiceEvidence.domain,
        amount: invoiceEvidence.amount,
        currency: invoiceEvidence.currency,
        invoiceDate: invoiceEvidence.invoiceDate,
        countryCode: invoiceEvidence.countryCode
      }
    };
  }
}
