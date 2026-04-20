import { scoreNameSimilarity } from "../lib/utils.js";

export class VisaMerchantSearchProvider {
  constructor(store) {
    this.store = store;
  }

  searchByName(supplierName) {
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

  getCandidate(candidateId) {
    return this.store.merchantSearchFixtures.find((item) => item.providerCandidateId === candidateId) || null;
  }
}
