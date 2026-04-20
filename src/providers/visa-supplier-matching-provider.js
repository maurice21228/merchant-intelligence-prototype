const supportedCountries = new Set(["US", "GB", "IE", "FR", "DE", "IT", "NL", "PL", "SE", "CH"]);

export class VisaSupplierMatchingProvider {
  constructor(store) {
    this.store = store;
  }

  getAcceptanceData(merchant) {
    if (!supportedCountries.has(merchant.countryCode)) {
      return {
        status: "unsupported_country",
        countryCode: merchant.countryCode,
        supportsCommercialCards: null
      };
    }

    const visaMerchantId = merchant.externalReferences?.visa?.merchantId;
    const match = this.store.supplierMatchingFixtures.find(
      (item) => item.merchantId === visaMerchantId && item.countryCode === merchant.countryCode
    );

    if (!match) {
      return {
        status: "no_match",
        countryCode: merchant.countryCode,
        supportsCommercialCards: null
      };
    }

    return {
      status: "matched",
      countryCode: merchant.countryCode,
      supportsCommercialCards: match.supportsCommercialCards,
      matchConfidence: match.matchConfidence,
      acceptedCardProducts: match.acceptedCardProducts
    };
  }
}
