import fs from "node:fs";
import https from "node:https";
import crypto from "node:crypto";
import { URL } from "node:url";

function readOptionalFile(filePath) {
  if (!filePath) {
    return undefined;
  }

  return fs.readFileSync(filePath);
}

function normalizeBaseUrl(value) {
  return value ? value.replace(/\/+$/, "") : "";
}

export class VisaApiClient {
  constructor({
    baseUrl,
    certPath,
    keyPath,
    caPath,
    passphrase,
    username,
    password,
    apiKey,
    sharedSecret
  }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.username = username || "";
    this.password = password || "";
    this.apiKey = apiKey || "";
    this.sharedSecret = sharedSecret || "";
    this.agent = new https.Agent({
      cert: readOptionalFile(certPath),
      key: readOptionalFile(keyPath),
      ca: readOptionalFile(caPath),
      passphrase: passphrase || undefined,
      rejectUnauthorized: true
    });
  }

  isConfigured() {
    return Boolean(this.baseUrl);
  }

  hasXPayCredentials() {
    return Boolean(this.apiKey && this.sharedSecret);
  }

  buildHeaders(extraHeaders = {}) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...extraHeaders
    };

    if (this.apiKey && !this.hasXPayCredentials()) {
      headers.apikey = this.apiKey;
      headers["x-api-key"] = this.apiKey;
    }

    if (this.username && this.password) {
      headers.Authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`;
    }

    return headers;
  }

  buildSortedQueryString(queryParams = {}) {
    return Object.entries(queryParams)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
  }

  computeXPayResourcePath(pathname) {
    const normalized = pathname.replace(/^\/+/, "");
    const parts = normalized.split("/");

    if (parts.length <= 1) {
      return normalized;
    }

    return parts.slice(1).join("/");
  }

  buildXPayToken(resourcePath, queryString, requestBody) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `${timestamp}${resourcePath}${queryString}${requestBody}`;
    const hash = crypto
      .createHmac("sha256", this.sharedSecret)
      .update(message, "utf8")
      .digest("hex");

    return `xv2:${timestamp}:${hash}`;
  }

  async postJson(pathname, payload, extraHeaders = {}, queryParams = {}) {
    if (!this.isConfigured()) {
      throw new Error("Visa API client is not configured");
    }

    const finalQueryParams = this.hasXPayCredentials()
      ? { ...queryParams, apikey: this.apiKey }
      : queryParams;
    const queryString = this.buildSortedQueryString(finalQueryParams);
    const target = new URL(`${this.baseUrl}${pathname}${queryString ? `?${queryString}` : ""}`);
    const bodyText = JSON.stringify(payload);
    const headers = this.buildHeaders(extraHeaders);

    if (this.hasXPayCredentials()) {
      headers.Accept = headers.Accept || "application/json";
      headers["X-PAY-TOKEN"] = this.buildXPayToken(
        this.computeXPayResourcePath(target.pathname),
        queryString,
        bodyText
      );
    }

    return new Promise((resolve, reject) => {
      const request = https.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || 443,
          path: `${target.pathname}${target.search}`,
          method: "POST",
          agent: this.agent,
          headers: {
            ...headers,
            "Content-Length": Buffer.byteLength(bodyText)
          }
        },
        (response) => {
          let rawText = "";

          response.on("data", (chunk) => {
            rawText += chunk;
          });

          response.on("end", () => {
            let parsed = null;

            try {
              parsed = rawText ? JSON.parse(rawText) : null;
            } catch {
              parsed = { raw: rawText };
            }

            if ((response.statusCode || 500) >= 400) {
              reject(new Error(parsed?.message || parsed?.error || rawText || `Visa API request failed with ${response.statusCode}`));
              return;
            }

            resolve(parsed);
          });
        }
      );

      request.on("error", reject);
      request.write(bodyText);
      request.end();
    });
  }
}
