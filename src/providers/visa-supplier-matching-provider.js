import { VisaApiClient } from "../lib/visa-api-client.js";

const supportedCountries = new Set(["US", "GB", "IE", "FR", "DE", "IT", "NL", "PL", "SE", "CH"]);

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["true", "yes", "y", "matched"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "n", "not_matched"].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function pickBestMatch(payload) {
  const candidates = payload?.matchResults
    || payload?.supplierMatchResults
    || payload?.results
    || [];

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  return candidates[0];
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
    this.matchPath = process.env.VISA_SUPPLIER_MATCHING_PATH || "/suppliermatching/v1/match";
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

    const payload = {
      suppliers: [
        {
          supplierName: merchant.canonicalName,
          countryCode: merchant.countryCode
        }
      ]
    };

    const response = await this.client.postJson(this.matchPath, payload);
    const match = pickBestMatch(response);

    if (!match) {
      return {
        status: "no_match",
        countryCode: merchant.countryCode,
        supportsCommercialCards: null
      };
    }

    const supportsCommercialCards =
      normalizeBoolean(match.acceptsVisaCommercialCards)
      ?? normalizeBoolean(match.visaCommercialAccepted)
      ?? normalizeBoolean(match.commercialCardAccepted)
      ?? true;

    return {
      status: supportsCommercialCards ? "matched" : "no_match",
      countryCode: merchant.countryCode,
      supportsCommercialCards,
      matchConfidence: match.matchConfidence || match.confidenceScore || null,
      acceptedCardProducts: match.acceptedCardProducts || match.cardProducts || [],
      mcc: match.mcc || match.merchantCategoryCode || null
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
    } catch {
      // Keep the mock fallback available until live credentials are confirmed.
    }

    return this.getFixtureAcceptanceData(merchant);
  }
}
