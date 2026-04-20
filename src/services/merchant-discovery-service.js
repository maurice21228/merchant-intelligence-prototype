import { createId, nowIso } from "../lib/utils.js";

export class MerchantDiscoveryService {
  constructor({ store, graphProvider, visaMerchantSearchProvider, webDiscoveryProvider, supplierMatchingProvider }) {
    this.store = store;
    this.graphProvider = graphProvider;
    this.visaMerchantSearchProvider = visaMerchantSearchProvider;
    this.webDiscoveryProvider = webDiscoveryProvider;
    this.supplierMatchingProvider = supplierMatchingProvider;
  }

  search(supplierName) {
    return this.graphProvider.searchByName(supplierName);
  }

  discover(supplierName) {
    const graphCandidates = this.graphProvider.searchByName(supplierName);

    if (graphCandidates.length > 0 && graphCandidates[0].confidence >= 0.75) {
      return {
        strategy: "graph_first",
        candidates: graphCandidates.slice(0, 5),
        suggestedMerchant: graphCandidates[0]
      };
    }

    const visaCandidates = this.visaMerchantSearchProvider.searchByName(supplierName);

    if (visaCandidates.length > 0) {
      return {
        strategy: "visa_merchant_search",
        candidates: [...graphCandidates.slice(0, 2), ...visaCandidates.slice(0, 3)].slice(0, 5),
        suggestedMerchant: visaCandidates[0]
      };
    }

    const webCandidates = this.webDiscoveryProvider.searchByName(supplierName);

    return {
      strategy: "web_discovery",
      candidates: [...graphCandidates.slice(0, 2), ...webCandidates.slice(0, 3)].slice(0, 5),
      suggestedMerchant: webCandidates[0] || null
    };
  }

  confirm({ idempotencyKey, supplierName, selectedCandidateId, countryCode, requestType, poNumber }) {
    if (this.store.idempotencyKeys.has(idempotencyKey)) {
      return this.store.idempotencyKeys.get(idempotencyKey);
    }

    const existingGraphMerchant = this.store.merchants.find((merchant) => merchant.id === selectedCandidateId) || null;
    let merchant = existingGraphMerchant;

    if (!merchant) {
      const providerCandidate =
        this.visaMerchantSearchProvider.getCandidate(selectedCandidateId) ||
        this.webDiscoveryProvider.getCandidate(selectedCandidateId);

      if (!providerCandidate) {
        throw new Error("Unknown merchant candidate");
      }

      merchant = {
        id: createId("m"),
        canonicalName: providerCandidate.canonicalName,
        aliases: Array.from(new Set([supplierName, ...(providerCandidate.aliases || [])])),
        domain: providerCandidate.domain,
        countryCode: providerCandidate.countryCode || countryCode || null,
        mcc: providerCandidate.mcc || null,
        descriptors: [],
        acceptance: null,
        externalReferences: providerCandidate.externalReferences || {},
        confidenceHistory: [],
        source: providerCandidate.externalReferences?.visa ? "visa_merchant_search" : "web_discovery"
      };

      this.store.merchants.push(merchant);
    } else if (!merchant.aliases.includes(supplierName)) {
      merchant.aliases.push(supplierName);
    }

    const acceptance = this.supplierMatchingProvider.getAcceptanceData(merchant);
    merchant.acceptance = {
      ...acceptance,
      source: "visa_supplier_matching",
      lastCheckedAt: nowIso()
    };

    const snapshot = {
      poNumber,
      requestType,
      supplierName,
      merchantId: merchant.id,
      merchantSnapshot: {
        canonicalName: merchant.canonicalName,
        domain: merchant.domain,
        countryCode: merchant.countryCode,
        mcc: merchant.mcc,
        acceptance: merchant.acceptance,
        externalReferences: merchant.externalReferences
      },
      confirmedAt: nowIso()
    };

    this.store.poSnapshots.set(poNumber, snapshot);

    const response = {
      merchant,
      poSnapshot: snapshot
    };

    this.store.idempotencyKeys.set(idempotencyKey, response);
    this.store.auditEvents.push({
      type: "merchant.confirmed",
      at: nowIso(),
      poNumber,
      merchantId: merchant.id,
      supplierName
    });

    return response;
  }

  getMerchant(merchantId) {
    return this.store.merchants.find((merchant) => merchant.id === merchantId) || null;
  }
}
