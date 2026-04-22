import { VisaApiClient } from "../lib/visa-api-client.js";

const supportedCountries = new Set(["US", "GB", "IE", "FR", "DE", "IT", "NL", "PL", "SE", "CH"]);

function pickBestMatch(payload) {
  if (payload?.matchStatus || payload?.matchConfidence || payload?.matchDetails) {
    return payload;
  }

  const candidates = payload?.matchResults
    || payload?.supplierMatchResults
    || payload?.results
    || [];

  return Array.isArray(candidates) && candidates.length > 0 ? candidates[0] : null;
}

export class VisaSupplierMatchingProvider {
  constructor(store) {
    this.store = store;
    this.client = new VisaApiClient({
      baseUrl: process.env.VISA_SUPPLIER_MATCHING_BASE_URL || "",
      certPath: process.env.VISA_TLS_CERT_PATH || "",
      keyPath: process.env.VISA_TLS_KEY_PATH || "",
      caPath: process.env.VISA_TLS_CA_PATH || "",
      passphrase: process.env.VISA_TLS_PASSPHRASE || "",
      username: process.env.VISA_USERNAME || "",
      password: process.env.VISA_PASSWORD || "",
      apiKey: process.env.VISA_API_KEY || "",
      sharedSecret: process.env.VISA_XPAY_SHARED_SECRET || ""
    });
    this.matchPath = process.env.VISA_SUPPLIER_MATCHING_PATH || "/visasuppliermatchingservice/v1/search";
  }

  getFixtureAcceptanceData(merchant) {
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

  async getLiveAcceptanceData(merchant) {
    if (!this.client.isConfigured()) {
      return null;
    }

    const response = await this.client.postWithoutBody(this.matchPath, {}, {
      supplierName: merchant.canonicalName,
      supplierCountryCode: merchant.countryCode
    });
    const match = pickBestMatch(response);

    if (!match) {
      return {
        status: "no_match",
        countryCode: merchant.countryCode,
        supportsCommercialCards: null
      };
    }

    const rawMatchStatus = String(match.matchStatus || "").toLowerCase();
    const isMatched = rawMatchStatus === "yes" || rawMatchStatus === "matched" || rawMatchStatus === "true";
    const rawConfidence = match.matchConfidence || match.confidenceScore || null;
    const matchDetails = match.matchDetails || {};

    return {
      status: isMatched ? "matched" : "no_match",
      countryCode: merchant.countryCode,
      supportsCommercialCards: isMatched,
      matchConfidence: rawConfidence,
      acceptedCardProducts: [],
      mcc: matchDetails.mcc || match.mcc || match.merchantCategoryCode || null,
      fleetInd: matchDetails.fleetInd || null,
      l2Ind: matchDetails.l2Ind || matchDetails.l2 || null,
      l3Ind: matchDetails.l3Ind || matchDetails.l3 || null,
      statusCode: match.status?.statusCode || null,
      statusDescription: match.status?.statusDescription || null
    };
  }

  async getAcceptanceData(merchant) {
    if (!supportedCountries.has(merchant.countryCode)) {
      return {
        status: "unsupported_country",
        countryCode: merchant.countryCode,
        supportsCommercialCards: null
      };
    }

    try {
      const live = await this.getLiveAcceptanceData(merchant);
      if (live) {
        return live;
      }
    } catch (error) {
      console.error("[visa-supplier-matching] live lookup failed", {
        merchantName: merchant.canonicalName,
        countryCode: merchant.countryCode,
        baseUrl: this.client.baseUrl,
        path: this.matchPath,
        message: error.message
      });
      // Keep the mock fallback available until live credentials are confirmed.
    }

    return this.getFixtureAcceptanceData(merchant);
  }
}
