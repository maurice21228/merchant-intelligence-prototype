import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { store } from "./lib/store.js";
import { createId, notFound, respondJson, safeJsonParse } from "./lib/utils.js";
import { GraphProvider } from "./providers/graph-provider.js";
import { VisaMerchantSearchProvider } from "./providers/visa-merchant-search-provider.js";
import { VisaSupplierMatchingProvider } from "./providers/visa-supplier-matching-provider.js";
import { WebDiscoveryProvider } from "./providers/web-discovery-provider.js";
import { DocumentIntelligenceService } from "./services/document-intelligence-service.js";
import { MerchantDiscoveryService } from "./services/merchant-discovery-service.js";
import { TransactionIntelligenceService } from "./services/transaction-intelligence-service.js";

const graphProvider = new GraphProvider(store);
const visaMerchantSearchProvider = new VisaMerchantSearchProvider(store);
const visaSupplierMatchingProvider = new VisaSupplierMatchingProvider(store);
const webDiscoveryProvider = new WebDiscoveryProvider(store);
const documentIntelligenceService = new DocumentIntelligenceService();

const merchantDiscoveryService = new MerchantDiscoveryService({
  store,
  graphProvider,
  visaMerchantSearchProvider,
  webDiscoveryProvider,
  supplierMatchingProvider: visaSupplierMatchingProvider
});

const transactionIntelligenceService = new TransactionIntelligenceService({
  store,
  documentIntelligenceService,
  merchantDiscoveryService
});

const publicDir = path.resolve("public");
const uploadsDir = path.resolve(".runtime-uploads");
const requireFromRuntime = createRequire(import.meta.url);
const tessdataDir = path.resolve("tessdata");
const PORT = Number(process.env.PORT || 3000);

function loadDependency(moduleName, fallbackRelativePath = null) {
  try {
    return requireFromRuntime(moduleName);
  } catch (error) {
    if (!fallbackRelativePath) {
      throw error;
    }

    const fallbackBase = "C:\\Users\\mlwunze\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
    return requireFromRuntime(path.join(fallbackBase, fallbackRelativePath));
  }
}

const JSZip = loadDependency("jszip", "jszip");
const Tesseract = loadDependency("tesseract.js", "tesseract.js");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

function serveStaticFile(response, filePath) {
  if (!fs.existsSync(filePath)) {
    return respondJson(response, 404, {
      error: {
        code: "STATIC_NOT_FOUND",
        message: `Static file not found: ${path.basename(filePath)}`
      }
    });
  }

  const data = fs.readFileSync(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Cache-Control": "no-store"
  });
  response.end(data);
}

function readRequestBody(request) {
  return new Promise((resolve) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      resolve(body ? safeJsonParse(body, {}) : {});
    });
  });
}

function decodeXmlText(xml) {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractPdfText(buffer) {
  let pdfjs;

  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    const fallbackBase = "C:\\Users\\mlwunze\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
    const pdfModulePath = path.join(fallbackBase, "pdfjs-dist", "legacy", "build", "pdf.mjs");
    pdfjs = await import(pathToFileURL(pdfModulePath).href);
  }

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || "").join(" ");
    if (text.trim()) {
      pages.push(text.trim());
    }
  }

  return pages.join("\n");
}

async function extractDocxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file("word/document.xml")?.async("string");

  if (!docXml) {
    throw new Error("DOCX document.xml not found");
  }

  return decodeXmlText(docXml);
}

async function extractImageText(buffer) {
  const worker = await Tesseract.createWorker("eng", 1, {
    langPath: tessdataDir
  });

  try {
    const result = await worker.recognize(buffer);
    return result?.data?.text || "";
  } finally {
    await worker.terminate();
  }
}

async function extractUploadedDocument({ fileName, base64Data }) {
  if (!fileName || !base64Data) {
    throw new Error("fileName and base64Data are required");
  }

  const buffer = Buffer.from(base64Data, "base64");
  const suffix = path.extname(fileName).toLowerCase();
  let text = "";

  if (suffix === ".txt" || suffix === ".md") {
    text = buffer.toString("utf8");
  } else if (suffix === ".docx") {
    text = await extractDocxText(buffer);
  } else if (suffix === ".pdf") {
    text = await extractPdfText(buffer);
  } else if ([".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp"].includes(suffix)) {
    text = await extractImageText(buffer);
  } else {
    throw new Error(`Unsupported file type for prototype upload: ${suffix}`);
  }

  return {
    text,
    fileName
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);

  try {
    if (request.method === "GET" && url.pathname === "/") {
      return serveStaticFile(response, path.join(publicDir, "index.html"));
    }

    if (request.method === "GET" && ["/styles.css", "/app.js"].includes(url.pathname)) {
      return serveStaticFile(response, path.join(publicDir, url.pathname.slice(1)));
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return respondJson(response, 200, { status: "ok" });
    }

    if (request.method === "GET" && url.pathname === "/ready") {
      return respondJson(response, 200, { status: "ready", dependencies: ["graph", "mock-visa", "document-intelligence"] });
    }

    if (request.method === "POST" && url.pathname === "/merchant/search") {
      const body = await readRequestBody(request);
      const candidates = merchantDiscoveryService.search(body.supplierName || "");
      return respondJson(response, 200, { candidates });
    }

    if (request.method === "POST" && url.pathname === "/merchant/discover") {
      const body = await readRequestBody(request);
      const result = merchantDiscoveryService.discover(body.supplierName || "");
      return respondJson(response, 200, result);
    }

    if (request.method === "POST" && url.pathname === "/merchant/confirm") {
      const body = await readRequestBody(request);
      const result = merchantDiscoveryService.confirm({
        idempotencyKey: body.idempotencyKey,
        supplierName: body.supplierName,
        selectedCandidateId: body.selectedCandidateId,
        countryCode: body.countryCode,
        requestType: body.requestType,
        poNumber: body.poNumber
      });
      return respondJson(response, 200, result);
    }

    if (request.method === "POST" && url.pathname === "/document/extract") {
      const body = await readRequestBody(request);
      const document = await extractUploadedDocument(body);
      const invoiceEvidence = documentIntelligenceService.extract(document.text);
      const scanSummary = documentIntelligenceService.buildScanSummary(invoiceEvidence);
      return respondJson(response, 200, {
        document,
        invoiceEvidence,
        scanSummary
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/merchant/")) {
      const merchantId = url.pathname.split("/")[2];
      const merchant = merchantDiscoveryService.getMerchant(merchantId);
      if (!merchant) {
        return notFound(response);
      }
      return respondJson(response, 200, merchant);
    }

    if (request.method === "POST" && url.pathname === "/transaction/verify") {
      const body = await readRequestBody(request);
      const result = transactionIntelligenceService.verify(body);
      return respondJson(response, 200, result);
    }

    if (request.method === "GET" && url.pathname.startsWith("/transaction/") && url.pathname.endsWith("/result")) {
      const parts = url.pathname.split("/");
      const transactionId = parts[2];
      const result = transactionIntelligenceService.getResult(transactionId);
      if (!result) {
        return notFound(response);
      }
      return respondJson(response, 200, result);
    }

    return notFound(response);
  } catch (error) {
    console.error(`[${request.method}] ${url.pathname}`, error);
    return respondJson(response, 400, {
      error: {
        code: "BAD_REQUEST",
        message: error.message
      }
    });
  }
});

server.listen(PORT, () => {
  console.log(`Merchant Intelligence prototype listening on http://localhost:${PORT}`);
});
