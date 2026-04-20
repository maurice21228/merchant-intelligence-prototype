import { createId, nowIso, normalizeText, scoreNameSimilarity } from "../lib/utils.js";

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

export class TransactionIntelligenceService {
  constructor({ store, documentIntelligenceService, merchantDiscoveryService }) {
    this.store = store;
    this.documentIntelligenceService = documentIntelligenceService;
    this.merchantDiscoveryService = merchantDiscoveryService;
  }

  verify({ poNumber, requestType, descriptor, mcc, amount, currency, invoiceText }) {
    const poSnapshot = this.store.poSnapshots.get(poNumber);

    if (!poSnapshot) {
      throw new Error("Unknown PO number");
    }

    const merchant = this.merchantDiscoveryService.getMerchant(poSnapshot.merchantId);
    const invoiceEvidence = this.documentIntelligenceService.extract(invoiceText);
    const invoiceComparison = this.documentIntelligenceService.compareToMerchant(
      invoiceEvidence,
      poSnapshot.merchantSnapshot
    );

    const descriptorScores = [
      scoreNameSimilarity(descriptor, poSnapshot.merchantSnapshot.canonicalName),
      ...merchant.aliases.map((alias) => scoreNameSimilarity(descriptor, alias)),
      ...merchant.descriptors.map((known) => scoreNameSimilarity(descriptor, known))
    ];
    const descriptorSimilarity = Math.max(...descriptorScores);
    const mccAlignment = Number(String(mcc || "") === String(poSnapshot.merchantSnapshot.mcc || ""));
    const amountMatch = invoiceEvidence.amount ? Number(Math.abs(invoiceEvidence.amount - amount) < 0.01) : 0.5;
    const acceptanceSupport = poSnapshot.merchantSnapshot.acceptance?.supportsCommercialCards === true ? 1 : 0.4;

    const requestProfiles = {
      "Online Purchase": { descriptor: 0.3, mcc: 0.15, amount: 0.1, invoiceMerchant: 0.2, invoiceDomain: 0.15, acceptance: 0.1 },
      "Membership Fee": { descriptor: 0.2, mcc: 0.1, amount: 0.15, invoiceMerchant: 0.2, invoiceDomain: 0.15, acceptance: 0.2 },
      "Travel": { descriptor: 0.2, mcc: 0.2, amount: 0.05, invoiceMerchant: 0.2, invoiceDomain: 0.1, acceptance: 0.25 }
    };

    const profile = requestProfiles[requestType] || { descriptor: 0.25, mcc: 0.15, amount: 0.1, invoiceMerchant: 0.2, invoiceDomain: 0.15, acceptance: 0.15 };

    const score =
      descriptorSimilarity * profile.descriptor +
      mccAlignment * profile.mcc +
      amountMatch * profile.amount +
      invoiceComparison.merchantNameSimilarity * profile.invoiceMerchant +
      invoiceComparison.domainMatch * profile.invoiceDomain +
      acceptanceSupport * profile.acceptance;

    const confidence = Math.round(clamp(score) * 100);

    let outcome = "EXCEPTION";
    if (confidence >= 85) {
      outcome = "AUTO_RECONCILE";
    } else if (confidence >= 50) {
      outcome = "REVIEW_QUEUE";
    }

    if (outcome !== "EXCEPTION") {
      const normalizedDescriptor = normalizeText(descriptor);
      const hasDescriptor = merchant.descriptors.some((item) => normalizeText(item) === normalizedDescriptor);
      if (!hasDescriptor && descriptor) {
        merchant.descriptors.push(descriptor);
      }
    }

    const result = {
      id: createId("txn"),
      poNumber,
      requestType,
      merchantId: merchant.id,
      confidence,
      outcome,
      breakdown: {
        descriptorSimilarity: Number(descriptorSimilarity.toFixed(2)),
        mccAlignment,
        amountMatch,
        invoiceMerchantNameSimilarity: Number(invoiceComparison.merchantNameSimilarity.toFixed(2)),
        invoiceDomainMatch: invoiceComparison.domainMatch,
        acceptanceSupport
      },
      invoiceEvidence,
      input: {
        descriptor,
        mcc,
        amount,
        currency
      },
      createdAt: nowIso()
    };

    this.store.transactionResults.set(result.id, result);
    this.store.auditEvents.push({
      type: "transaction.verified",
      at: nowIso(),
      transactionId: result.id,
      poNumber,
      confidence,
      outcome
    });

    return result;
  }

  getResult(transactionId) {
    return this.store.transactionResults.get(transactionId) || null;
  }
}
