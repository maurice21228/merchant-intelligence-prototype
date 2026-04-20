import { scoreNameSimilarity } from "../lib/utils.js";

export class GraphProvider {
  constructor(store) {
    this.store = store;
  }

  searchByName(supplierName) {
    const candidates = [];

    for (const merchant of this.store.merchants) {
      const aliasScores = [merchant.canonicalName, ...merchant.aliases].map((name) =>
        scoreNameSimilarity(supplierName, name)
      );
      const confidence = Math.max(...aliasScores);

      if (confidence >= 0.35) {
        candidates.push({
          source: "graph",
          candidateId: merchant.id,
          canonicalName: merchant.canonicalName,
          domain: merchant.domain,
          countryCode: merchant.countryCode,
          mcc: merchant.mcc,
          confidence
        });
      }
    }

    return candidates.sort((left, right) => right.confidence - left.confidence);
  }
}
