const state = {
  discovered: null,
  confirmed: null,
  validation: null,
  uploadedInvoice: null
};

const discoveryForm = document.querySelector("#discovery-form");
const validationForm = document.querySelector("#validation-form");
const candidateList = document.querySelector("#candidate-list");
const discoverySummary = document.querySelector("#discovery-summary");
const confirmationCard = document.querySelector("#confirmation-card");
const confirmationEmpty = document.querySelector("#confirmation-empty");
const technicalConfirmationCard = document.querySelector("#technical-confirmation-card");
const technicalConfirmationEmpty = document.querySelector("#technical-confirmation-empty");
const validationResult = document.querySelector("#validation-result");
const validationEmpty = document.querySelector("#validation-empty");
const clearTraceButton = document.querySelector("#clear-trace");
const apiTrace = document.querySelector("#api-trace");
const workflowStatus = document.querySelector("#workflow-status");
const decisionSummary = document.querySelector("#decision-summary");
const invoiceFileInput = document.querySelector("#invoiceFile");
const scanInvoiceButton = document.querySelector("#scan-invoice");
const scanSummary = document.querySelector("#scan-summary");
const dropZone = document.querySelector("#drop-zone");
const dropFileName = document.querySelector("#drop-file-name");

function setMessage(text, variant = "error") {
  discoverySummary.textContent = text;
  discoverySummary.className = `message ${variant === "info" ? "info" : ""}`;
  discoverySummary.classList.remove("hidden");
}

function clearMessage() {
  discoverySummary.textContent = "";
  discoverySummary.className = "message hidden";
}

function setWorkflowStatus(label) {
  workflowStatus.textContent = label;
}

function scoreBadge(confidence) {
  if (confidence >= 85 || confidence >= 0.85) {
    return ["good", "High confidence"];
  }
  if (confidence >= 50 || confidence >= 0.5) {
    return ["warn", "Review needed"];
  }
  return ["bad", "Low confidence"];
}

function acceptanceBadge(status) {
  if (status === "matched") {
    return ["good", "Acceptance matched"];
  }
  if (status === "unsupported_country") {
    return ["warn", "Unsupported country"];
  }
  return ["bad", "No acceptance match"];
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function addTimelineStep({ title, body, requestPayload, responsePayload, status = "info" }) {
  const item = document.createElement("article");
  item.className = "trace-item";
  const badgeClass = status === "error" ? "bad" : status === "success" ? "good" : "warn";
  const badgeText = status === "error" ? "Error" : status === "success" ? "Completed" : "In progress";

  item.innerHTML = `
    <div class="trace-top">
      <div>
        <div class="section-kicker">${new Date().toLocaleTimeString()}</div>
        <div class="timeline-title">${title}</div>
        <div class="timeline-body">${body}</div>
      </div>
      <span class="badge ${badgeClass}">${badgeText}</span>
    </div>
    ${requestPayload ? `
      <div class="trace-meta">Request context</div>
      <pre class="trace-code">${safeStringify(requestPayload)}</pre>
    ` : ""}
    ${responsePayload ? `
      <div class="trace-meta">Result</div>
      <pre class="trace-code">${safeStringify(responsePayload)}</pre>
    ` : ""}
  `;

  apiTrace.prepend(item);
}

function updateDecisionSummary() {
  const merchantDiscovery = state.discovered?.strategy?.replaceAll("_", " ") || "Pending";
  const acceptance = state.confirmed?.merchant?.acceptance?.status || "Pending";
  const validation = state.validation ? `${state.validation.outcome} (${state.validation.confidence}%)` : "Pending";

  decisionSummary.innerHTML = `
    <div class="summary-item">
      <div class="summary-label">Merchant Discovery</div>
      <div class="summary-value">${merchantDiscovery}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Acceptance Data</div>
      <div class="summary-value">${acceptance}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Validation Outcome</div>
      <div class="summary-value">${validation}</div>
    </div>
  `;
}

async function requestJson(url, payload) {
  let response;
  let responsePayload = {};

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    if (text) {
      try {
        responsePayload = JSON.parse(text);
      } catch {
        responsePayload = { raw: text };
      }
    }

    if (!response.ok) {
      throw new Error(responsePayload?.error?.message || responsePayload?.raw || `Request failed with ${response.status}`);
    }

    return responsePayload;
  } catch (error) {
    if (!response) {
      addTimelineStep({
        title: "Network request failed",
        body: `${url}: ${error.message || "Network error."}`,
        requestPayload: payload,
        responsePayload: { error: error.message },
        status: "error"
      });
    }
    throw error;
  }
}

function renderCandidates(result) {
  candidateList.innerHTML = "";
  state.discovered = result;
  updateDecisionSummary();
  setWorkflowStatus("Candidates ready");

  if (!result?.candidates?.length) {
    candidateList.innerHTML = `<div class="empty-state">No candidates found.</div>`;
    return;
  }

  for (const candidate of result.candidates) {
    const card = document.createElement("article");
    card.className = "candidate-card";
    card.innerHTML = `
      <div class="candidate-top">
        <div>
          <h3>${candidate.canonicalName}</h3>
          <div class="trace-meta">Suggested merchant</div>
        </div>
      </div>
      <div class="button-row">
        <button type="button" class="action-btn primary" data-confirm="${candidate.candidateId}">Confirm</button>
      </div>
    `;
    candidateList.appendChild(card);
  }
}

function renderConfirmation(result) {
  state.confirmed = result;
  updateDecisionSummary();
  setWorkflowStatus("Merchant confirmed");
  confirmationEmpty.classList.add("hidden");
  confirmationCard.classList.remove("hidden");
  technicalConfirmationEmpty.classList.add("hidden");
  technicalConfirmationCard.classList.remove("hidden");
  validationEmpty.classList.add("hidden");

  const acceptance = result.merchant.acceptance || {};
  const visaRefs = result.merchant.externalReferences?.visa || {};
  const acceptsCard = acceptance.status === "matched" ? "Accepts card" : "Card acceptance unavailable";

  confirmationCard.innerHTML = `
    <article class="detail-card">
      <div class="detail-top">
        <div>
          <h3>${result.merchant.canonicalName}</h3>
          <div class="trace-meta">${acceptsCard}</div>
        </div>
      </div>
    </article>
  `;

  technicalConfirmationCard.innerHTML = `
    <article class="detail-card">
      <div class="detail-top">
        <div>
          <h3>${result.merchant.canonicalName}</h3>
          <div class="trace-meta">Stored on PO ${result.poSnapshot.poNumber}</div>
        </div>
        <span class="badge ${acceptance.status === "matched" ? "good" : "warn"}">${acceptance.status || "unknown"}</span>
      </div>
      <div class="detail-grid">
        <div class="stat">
          <div class="stat-label">Merchant ID</div>
          <div class="stat-value">${result.merchant.id}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Domain</div>
          <div class="stat-value">${result.merchant.domain || "Unknown"}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Country</div>
          <div class="stat-value">${result.merchant.countryCode || "Unknown"}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Acceptance status</div>
          <div class="stat-value">${acceptance.status || "Not checked"}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Visa merchant ID</div>
          <div class="stat-value">${visaRefs.merchantId || "N/A"}</div>
        </div>
      </div>
    </article>
  `;
}

function renderValidation(result) {
  state.validation = result;
  updateDecisionSummary();
  setWorkflowStatus("Validation completed");
  validationResult.classList.remove("hidden");

  const [badgeClass, badgeText] = scoreBadge(result.confidence);
  const breakdown = Object.entries(result.breakdown)
    .map(([key, value]) => `
      <div class="stat">
        <div class="stat-label">${key.replace(/([A-Z])/g, " $1")}</div>
        <div class="stat-value">${value}</div>
      </div>
    `)
    .join("");

  const invoiceEvidence = Object.entries(result.invoiceEvidence)
    .map(([key, value]) => `
      <div class="stat">
        <div class="stat-label">${key.replace(/([A-Z])/g, " $1")}</div>
        <div class="stat-value">${value ?? "N/A"}</div>
      </div>
    `)
    .join("");

  validationResult.innerHTML = `
    <article class="score-card">
      <div class="detail-top">
        <div>
          <h3>${result.outcome}</h3>
          <div class="trace-meta">Transaction ${result.id} for PO ${result.poNumber}</div>
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="detail-grid">
        <div class="stat">
          <div class="stat-label">Confidence</div>
          <div class="stat-value">${result.confidence}%</div>
        </div>
        <div class="stat">
          <div class="stat-label">Merchant ID</div>
          <div class="stat-value">${result.merchantId}</div>
        </div>
      </div>
      <h3>Signal Breakdown</h3>
      <div class="breakdown-grid">${breakdown}</div>
      <h3>Invoice Evidence</h3>
      <div class="invoice-grid">${invoiceEvidence}</div>
    </article>
  `;
}

function renderScanSummary(scanResult) {
  scanSummary.className = "empty-state";
  scanSummary.innerHTML = `
    <div class="section-kicker">Invoice scan</div>
    <h3>${scanResult.document.fileName}</h3>
    <p>${scanResult.scanSummary.summary}</p>
    <div class="detail-grid">
      <div class="stat">
        <div class="stat-label">Merchant</div>
        <div class="stat-value">${scanResult.invoiceEvidence.merchantName || "Not found"}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Domain</div>
        <div class="stat-value">${scanResult.invoiceEvidence.domain || "Not found"}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Amount</div>
        <div class="stat-value">${scanResult.invoiceEvidence.amount || "Not found"}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Country</div>
        <div class="stat-value">${scanResult.invoiceEvidence.countryCode || "Not found"}</div>
      </div>
    </div>
  `;
}

async function readFileAsBase64(file) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function resetTransientState() {
  state.confirmed = null;
  state.validation = null;
  state.uploadedInvoice = null;
  updateDecisionSummary();
  validationResult.classList.add("hidden");
  validationResult.innerHTML = "";
  confirmationCard.classList.add("hidden");
  confirmationCard.innerHTML = "";
  confirmationEmpty.classList.remove("hidden");
  validationEmpty.classList.remove("hidden");
  scanSummary.className = "empty-state";
  scanSummary.textContent = "No invoice uploaded yet. Supported prototype formats: PDF, DOCX, TXT, MD.";
}

async function handleDiscovery(event) {
  event.preventDefault();
  clearMessage();
  candidateList.innerHTML = "";
  resetTransientState();
  setWorkflowStatus("Discovering merchant");

  const form = new FormData(discoveryForm);
  const payload = {
    supplierName: form.get("supplierName"),
    countryCode: "US"
  };

  try {
    const result = await requestJson("/merchant/discover", payload);
    addTimelineStep({
      title: "Merchant resolution pipeline",
      body: `Merchant Graph lookup ran first, then ${result.strategy.replaceAll("_", " ")} suggested ${result.suggestedMerchant?.canonicalName || "no merchant"}.`,
      requestPayload: payload,
      responsePayload: {
        strategy: result.strategy,
        suggestedMerchant: result.suggestedMerchant?.canonicalName
      },
      status: "success"
    });
    setMessage(
      `Strategy: ${result.strategy.replaceAll("_", " ")}. Suggested merchant: ${result.suggestedMerchant?.canonicalName || "none"}.`,
      "info"
    );
    renderCandidates(result);
  } catch (error) {
    setMessage(error.message || "Discovery failed");
    setWorkflowStatus("Discovery failed");
  }
}

async function handleConfirm(candidateId) {
  clearMessage();
  setWorkflowStatus("Confirming merchant");
  const form = new FormData(discoveryForm);
  const payload = {
    idempotencyKey: `ui-${Date.now()}-${candidateId}`,
    supplierName: form.get("supplierName"),
    selectedCandidateId: candidateId,
    countryCode: "US",
    requestType: form.get("requestType"),
    poNumber: "PO-DEMO-001"
  };

  try {
    const result = await requestJson("/merchant/confirm", payload);
    addTimelineStep({
      title: "PO merchant confirmation",
      body: `${result.merchant.canonicalName} was confirmed and stored on the PO snapshot.`,
      requestPayload: payload,
      responsePayload: {
        merchantId: result.merchant.id,
        canonicalName: result.merchant.canonicalName
      },
      status: "success"
    });
    addTimelineStep({
      title: "Visa Supplier Matching",
      body: `Card acceptance enrichment finished with status ${result.merchant.acceptance?.status || "unknown"}.`,
      requestPayload: {
        countryCode: result.merchant.countryCode,
        visaMerchantId: result.merchant.externalReferences?.visa?.merchantId || null
      },
      responsePayload: {
        acceptance: result.merchant.acceptance?.status
      },
      status: "success"
    });
    renderConfirmation(result);
  } catch (error) {
    setMessage(error.message || "Confirmation failed");
    setWorkflowStatus("Confirmation failed");
  }
}

async function handleInvoiceScan() {
  clearMessage();
  const file = invoiceFileInput.files?.[0];

  if (!file) {
    setMessage("Choose an invoice file before running the scan.");
    return;
  }

  setWorkflowStatus("Scanning invoice");
  addTimelineStep({
    title: "Invoice uploaded",
    body: `Preparing ${file.name} for local extraction and OCR or document parsing.`,
    requestPayload: { fileName: file.name, size: file.size, type: file.type || "unknown" },
    status: "info"
  });

  try {
    const base64Data = await readFileAsBase64(file);
    const result = await requestJson("/document/extract", {
      fileName: file.name,
      mimeType: file.type,
      base64Data
    });

    document.querySelector("#invoiceText").value = result.document.text || "";
    state.uploadedInvoice = result;
    dropFileName.textContent = file.name;
    renderScanSummary(result);
    addTimelineStep({
      title: "Document extraction and invoice scan",
      body: result.scanSummary.summary,
      requestPayload: { fileName: file.name },
      responsePayload: result.scanSummary,
      status: "success"
    });
    setWorkflowStatus("Invoice scanned");
  } catch (error) {
    setMessage(error.message || "Invoice scan failed");
    setWorkflowStatus("Scan failed");
  }
}

async function handleValidation(event) {
  event.preventDefault();
  clearMessage();

  if (!state.confirmed) {
    setMessage("Confirm a merchant first before running validation.");
    return;
  }

  setWorkflowStatus("Running validation");
  const form = new FormData(validationForm);
  const discoveryFormData = new FormData(discoveryForm);
  const payload = {
    poNumber: "PO-DEMO-001",
    requestType: discoveryFormData.get("requestType"),
    descriptor: form.get("descriptor"),
    mcc: form.get("mcc"),
    amount: Number(form.get("amount")),
    currency: "USD",
    invoiceText: form.get("invoiceText")
  };

  try {
    const result = await requestJson("/transaction/verify", payload);
    addTimelineStep({
      title: "Transaction intelligence scoring",
      body: `Validation finished with ${result.outcome} at ${result.confidence}% confidence.`,
      requestPayload: payload,
      responsePayload: {
        outcome: result.outcome,
        confidence: result.confidence,
        breakdown: result.breakdown
      },
      status: "success"
    });
    renderValidation(result);
  } catch (error) {
    setMessage(error.message || "Validation failed");
    setWorkflowStatus("Validation failed");
  }
}

function setSelectedFile(file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  invoiceFileInput.files = dataTransfer.files;
  dropFileName.textContent = file.name;
}

dropZone.addEventListener("click", () => {
  invoiceFileInput.click();
});

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    invoiceFileInput.click();
  }
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("active");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("active");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("active");
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    setSelectedFile(file);
  }
});

invoiceFileInput.addEventListener("change", () => {
  const file = invoiceFileInput.files?.[0];
  dropFileName.textContent = file ? file.name : "No file selected";
});

candidateList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-confirm]");
  if (!button) {
    return;
  }
  handleConfirm(button.dataset.confirm);
});

discoveryForm.addEventListener("submit", handleDiscovery);
validationForm.addEventListener("submit", handleValidation);
scanInvoiceButton.addEventListener("click", handleInvoiceScan);
clearTraceButton.addEventListener("click", () => {
  apiTrace.innerHTML = "";
});

updateDecisionSummary();
