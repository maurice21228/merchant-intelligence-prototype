import fs from "node:fs";
import path from "node:path";

const base = path.resolve("src", "data");

function loadJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(base, fileName), "utf8"));
}

export class InMemoryStore {
  constructor() {
    this.merchants = loadJson("graph-merchants.json");
    this.merchantSearchFixtures = loadJson("visa-merchant-search.json");
    this.supplierMatchingFixtures = loadJson("visa-supplier-matching.json");
    this.webDiscoveryFixtures = loadJson("web-discovery.json");
    this.poSnapshots = new Map();
    this.transactionResults = new Map();
    this.idempotencyKeys = new Map();
    this.auditEvents = [];
  }
}

export const store = new InMemoryStore();
