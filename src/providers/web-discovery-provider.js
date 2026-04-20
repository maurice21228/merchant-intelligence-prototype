import { scoreNameSimilarity } from "../lib/utils.js";

export class WebDiscoveryProvider {
  constructor(store) {
    this.store = store;
  }

  searchByName(supplierName) {
    const candidates = [];

    for (const fixture of this.store.webDiscoveryFixtures) {
      const relevance = Math.max(
        scoreNameSimilarity(supplierName, fixture.canonicalName),
        ...fixture.aliases.map((alias) => scoreNameSimilarity(supplierName, alias))
      );

      if (relevance >= 0.25) {
        candidates.push({
          source: "web_discovery",
          candidateId: fixture.providerCandidateId,
          canonicalName: fixture.canonicalName,
          domain: fixture.domain,
          countryCode: fixture.countryCode,
          mcc: fixture.mcc,
          confidence: Number(((fixture.confidence * 0.6) + (relevance * 0.4)).toFixed(2)),
          externalReferences: fixture.externalReferences,
          aliases: fixture.aliases
        });
      }
    }

    return candidates.sort((left, right) => right.confidence - left.confidence);
  }

  getCandidate(candidateId) {
    return this.store.webDiscoveryFixtures.find((item) => item.providerCandidateId === candidateId) || null;
  }
}
