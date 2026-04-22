import { createId, scoreNameSimilarity } from "../lib/utils.js";
import { VisaApiClient } from "../lib/visa-api-client.js";

function normalizeCandidate(candidate, supplierName) {
  const aliases = Array.from(
    new Set(
      [
        supplierName,
        candidate?.merchantName,
        candidate?.merchantAliasName,
        ...(candidate?.aliases || [])
      ].filter(Boolean)
    )
  );

  return {
    source: "visa_merchant_search",
    candidateId: candidate.providerCandidateId || createId("visa_search"),
    canonicalName: candidate.canonicalName || candidate.merchantName || supplierName,
    domain: candidate.domain || candidate.merchantUrl || candidate.url || null,
    countryCode: candidate.countryCode || candidate.country || null,
    mcc: candidate.mcc || candidate.merchantCategoryCode || null,
    confidence: Number(candidate.confidence || 0.7),
    externalReferences: candidate.externalReferences || {
      visa: {
        merchantId: candidate.visaMerchantId || candidate.vmid || candidate.merchantId || null,
        storeId: candidate.visaStoreId || candidate.vsid || candidate.storeId || null,
        enterpriseId: candidate.visaEnterpriseId || candidate.veid || candidate.enterpriseId || null
      }
    },
    aliases
  };
}

function pickResultList(payload) {
  return payload?.searchResults
    || payload?.merchants
    || payload?.merchantSearchResults
    || payload?.results
    || [];
}

export class VisaMerchantSearchProvider {
  constructor(store) {
    this.store = store;
    this.liveCandidates = new Map();
    this.client = new VisaApiClient({
      baseUrl: process.env.VISA_MERCHANT_SEARCH_BASE_URL || "",
      certPath: process.env.VISA_TLS_CERT_PATH || "",
      keyPath: process.env.VISA_TLS_KEY_PATH || "",
      caPath: process.env.VISA_TLS_CA_PATH || "",
      passphrase: process.env.VISA_TLS_PASSPHRASE || "",
      username: process.env.VISA_USERNAME || "",
      password: process.env.VISA_PASSWORD || "",
      apiKey: process.env.VISA_API_KEY || "",
      sharedSecret: process.env.VISA_XPAY_SHARED_SECRET || ""
    });
    this.searchPath = process.env.VISA_MERCHANT_SEARCH_PATH || "/merchantsearch/v2/search";
  }

  searchFixturesByName(supplierName) {
    const candidates = [];

    for (const fixture of this.store.merchantSearchFixtures) {
      const aliasScores = [fixture.canonicalName, ...(fixture.aliases || [])].map((name) =>
        scoreNameSimilarity(supplierName, name)
      );
      const relevance = Math.max(...aliasScores);

      if (relevance >= 0.3) {
        candidates.push({
          source: "visa_merchant_search",
          candidateId: fixture.providerCandidateId,
          canonicalName: fixture.canonicalName,
          domain: fixture.domain,
          countryCode: fixture.countryCode,
          mcc: fixture.mcc,
          confidence: Number(((fixture.confidence * 0.7) + (relevance * 0.3)).toFixed(2)),
          externalReferences: fixture.externalReferences,
          aliases: fixture.aliases
        });
      }
    }

    return candidates.sort((left, right) => right.confidence - left.confidence);
  }

  async searchLiveByName(supplierName) {
    if (!this.client.isConfigured()) {
      return [];
    }

    const payload = {
      searchText: supplierName,
      pageNumber: 1,
      pageSize: 5
    };

    const response = await this.client.postJson(this.searchPath, payload);
    const results = pickResultList(response);

    return results
      .map((item) =>
        normalizeCandidate(
          {
            canonicalName: item.merchantName || item.name,
            merchantName: item.merchantName || item.name,
            merchantAliasName: item.merchantAliasName || item.brandName,
            domain: item.merchantUrl || item.url,
            merchantUrl: item.merchantUrl || item.url,
            countryCode: item.countryCode || item.country,
            mcc: item.mcc || item.merchantCategoryCode,
            confidence: item.confidenceScore || item.matchScore || 0.8,
            visaMerchantId: item.visaMerchantId || item.vmid || item.merchantId,
            visaStoreId: item.visaStoreId || item.vsid || item.storeId,
            visaEnterpriseId: item.visaEnterpriseId || item.veid || item.enterpriseId,
            aliases: [item.brandName, item.parentMerchantName].filter(Boolean)
          },
          supplierName
        )
      )
      .map((candidate) => {
        this.liveCandidates.set(candidate.candidateId, candidate);
        return candidate;
      });
  }

  async searchByName(supplierName) {
    try {
      const liveCandidates = await this.searchLiveByName(supplierName);
      if (liveCandidates.length > 0) {
        return liveCandidates.sort((left, right) => right.confidence - left.confidence);
      }
    } catch {
      // Fallback to deterministic fixtures until credentials and field mappings are confirmed.
    }

    return this.searchFixturesByName(supplierName);
  }

  getCandidate(candidateId) {
    return this.liveCandidates.get(candidateId)
      || this.store.merchantSearchFixtures.find((item) => item.providerCandidateId === candidateId)
      || null;
  }
}
