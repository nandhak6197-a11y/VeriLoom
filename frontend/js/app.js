/* VeriLoom Round 2 MVP Reviewer Workbench Controller (v18.0) */
let DEMO_PRESETS = [];
let CURRENT_ASSET = null;
let ALL_SUBMISSIONS = [];
let QUEUE_FILTER = "all"; // "all" | "legal" | "approved" | "violations"
let ALL_FACTS_DATA = null;
let FACT_FILTER = "all"; // "all" | "active" | "expired"
let LAST_VISUAL_DATA = null;
let LAST_VISUAL_IMG = null;
let MUST_KEEP_TAGS = [];
let DETAIL_MODE = "simple"; // "simple" (Simple View) | "dev" (Audit Details)

function updateAvatarInitials(nameStr) {
  const pill = document.getElementById("user-avatar-initials");
  if (!pill) return;
  const parts = String(nameStr || "Nandha K").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    pill.textContent = "NK";
  } else if (parts.length === 1) {
    pill.textContent = parts[0].slice(0, 2).toUpperCase();
  } else {
    pill.textContent = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
}

function setDetailMode(mode) {
  DETAIL_MODE = mode === "dev" ? "dev" : "simple";
  document.body.classList.remove("mode-simple", "mode-dev");
  document.body.classList.add(`mode-${DETAIL_MODE}`);

  const btnSimple = document.getElementById("mode-btn-simple");
  const btnDev = document.getElementById("mode-btn-dev");
  const footerModeLabel = document.getElementById("footer-mode-label");
  if (btnSimple) btnSimple.classList.toggle("active", DETAIL_MODE === "simple");
  if (btnDev) btnDev.classList.toggle("active", DETAIL_MODE === "dev");
  if (footerModeLabel) {
    footerModeLabel.textContent = DETAIL_MODE === "dev" ? "Audit Details" : "Simple View";
  }

  if (CURRENT_ASSET) {
    renderActiveSubmission(CURRENT_ASSET);
  }
  if (ALL_SUBMISSIONS.length > 0) {
    renderSubmissionsQueueTable();
  }
  if (ALL_FACTS_DATA) {
    renderFactVaultView();
  }
}

function onRoleChanged() {
  if (CURRENT_ASSET) {
    renderActiveSubmission(CURRENT_ASSET);
  }
  if (ALL_FACTS_DATA) {
    renderFactVaultView();
  }
}

function switchRoleAndApprove() {
  const roleEl = document.getElementById("active-role-select");
  if (roleEl && roleEl.value === "Creator") {
    roleEl.value = "Authorised Reviewer";
  }
  onRoleChanged();
  const approveBtn = document.getElementById("btn-decision-APPROVE");
  submitAssetDecision("APPROVE", approveBtn);
}

function switchToRole(targetRole) {
  const roleEl = document.getElementById("active-role-select");
  if (roleEl) {
    roleEl.value = targetRole;
    onRoleChanged();
    showStatusMessage(`Switched active role to ${targetRole}. Governance controls are now unlocked.`);
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/§\s*(\d)/g, "Section $1")
    .replace(/§/g, "Section ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatOriginLabel(origin) {
  const map = {
    ai_generated: "AI-Generated",
    agency: "External Agency",
    employee: "In-House Team",
  };
  return map[origin] || origin || "In-House Team";
}

function formatChannelLabel(channel) {
  const map = {
    social: "Social Media",
    ad: "Paid Ad",
    email: "Email Campaign",
    web: "Web Page",
    deck: "Presentation Deck",
  };
  return map[channel] || channel || "Social Media";
}

function formatWorkflowStatusBadge(status) {
  const s = (status || "").toUpperCase();
  if (s === "APPROVED") {
    return `<span class="tier-badge tier-pass">${DETAIL_MODE === "dev" ? "APPROVED" : "Approved"}</span>`;
  }
  if (s === "ESCALATED_LEGAL") {
    return `<span class="tier-badge tier-advisory">${DETAIL_MODE === "dev" ? "ESCALATED_LEGAL" : "Escalated to Legal"}</span>`;
  }
  if (s === "BLOCKED_SECURITY") {
    return `<span class="tier-badge tier-violation">${DETAIL_MODE === "dev" ? "BLOCKED_SECURITY" : "Blocked (Security Policy)"}</span>`;
  }
  if (s === "REJECTED") {
    return `<span class="tier-badge tier-violation">${DETAIL_MODE === "dev" ? "REJECTED" : "Rejected"}</span>`;
  }
  if (s === "IN_MANAGER_REVIEW") {
    return `<span class="tier-badge tier-human">${DETAIL_MODE === "dev" ? "IN_MANAGER_REVIEW" : "Pending Review"}</span>`;
  }
  return `<span class="tier-badge tier-human">${escapeHtml(status)}</span>`;
}

function formatAuditEventBadge(eventType) {
  const ev = (eventType || "").toUpperCase();
  const map = {
    SUBMIT_AND_VERIFY: { label: "Submitted & Verified", cls: "tier-human" },
    UPLOAD_AND_VERIFY: { label: "Uploaded & Verified", cls: "tier-human" },
    CREATOR_ACCEPT: { label: "Accepted Surgical Fix", cls: "tier-pass" },
    CREATOR_EDIT: { label: "Custom Intent-Locked Edit", cls: "tier-pass" },
    CREATOR_DISPUTE: { label: "Disputed Finding", cls: "tier-advisory" },
    CREATOR_UNDO: { label: "Reverted Fix", cls: "tier-human" },
    REVIEWER_WAIVER: { label: "Granted Rule Waiver", cls: "tier-advisory" },
    REVIEWER_OVERRIDE: { label: "Overrode Flag (ROR)", cls: "tier-advisory" },
    REVIEWER_CONFIRM: { label: "Confirmed Violation", cls: "tier-violation" },
    APPROVE_ASSET: { label: "Approved Submission", cls: "tier-pass" },
    REJECT_ASSET: { label: "Rejected Submission", cls: "tier-violation" },
    ESCALATE_TO_AUTHORISED_REVIEWER: { label: "Escalated to Legal", cls: "tier-advisory" },
    PUBLISH_RULE_SET: { label: "Published Brand-AST", cls: "tier-pass" },
    UPSERT_FACT: { label: "Updated Fact Vault", cls: "tier-pass" },
    TOGGLE_FACT_STATUS: { label: "Toggled Fact Status", cls: "tier-advisory" },
  };
  const info = map[ev] || { label: ev, cls: "tier-human" };
  const text = DETAIL_MODE === "dev" ? `${info.label} [${ev}]` : info.label;
  return `<span class="tier-badge ${info.cls}">${escapeHtml(text)}</span>`;
}

function formatDefectTypeBadge(defectType) {
  const dt = (defectType || "").toUpperCase();
  const map = {
    MISSING_EXAMPLES: { label: "Missing Examples", cls: "tier-advisory" },
    UNCHECKABLE_VAGUE_CLAUSE: { label: "Uncheckable Vague Clause", cls: "tier-violation" },
    CONTRADICTORY_RULES: { label: "Contradictory Rules", cls: "tier-violation" },
    OVERLAPPING_SCOPE: { label: "Overlapping Scope", cls: "tier-human" },
  };
  const info = map[dt] || { label: dt, cls: "tier-advisory" };
  const text = DETAIL_MODE === "dev" ? `${info.label} (${dt})` : info.label;
  return `<span class="tier-badge ${info.cls}">${escapeHtml(text)}</span>`;
}

/* ========================================================================= */
/* PROTECTED WORDS INTERACTIVE CHIP / TAG INPUT                              */
/* ========================================================================= */
function syncMustKeepHiddenInput() {
  const hidden = document.getElementById("sub-must-keep");
  if (hidden) {
    hidden.value = MUST_KEEP_TAGS.join(", ");
  }
}

function renderMustKeepChips() {
  const listEl = document.getElementById("must-keep-chips-list");
  if (!listEl) return;
  syncMustKeepHiddenInput();
  let html = "";
  MUST_KEEP_TAGS.forEach((tag, idx) => {
    html += `<span class="must-keep-chip">
      <span>${escapeHtml(tag)}</span>
      <button type="button" class="chip-remove-btn" title="Remove protected word" onclick="event.stopPropagation(); removeMustKeepChip(${idx})">&times;</button>
    </span>`;
  });
  listEl.innerHTML = html;
}

function setMustKeepTagsFromString(rawStr) {
  MUST_KEEP_TAGS = String(rawStr || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  renderMustKeepChips();
}

function removeMustKeepChip(index) {
  MUST_KEEP_TAGS.splice(index, 1);
  renderMustKeepChips();
}

function commitMustKeepChipInput() {
  const inp = document.getElementById("must-keep-chip-input");
  if (!inp) return;
  const raw = inp.value.trim();
  if (!raw) return;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (!MUST_KEEP_TAGS.includes(p)) {
      MUST_KEEP_TAGS.push(p);
    }
  }
  inp.value = "";
  renderMustKeepChips();
}

function handleMustKeepChipKey(event) {
  const inp = event.target;
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    commitMustKeepChipInput();
  } else if (event.key === "Backspace" && inp.value === "" && MUST_KEEP_TAGS.length > 0) {
    MUST_KEEP_TAGS.pop();
    renderMustKeepChips();
  }
}

function renderTrackedChangesHtml(trackedStr) {
  let safe = escapeHtml(trackedStr || "");
  safe = safe.replace(/\[-(.*?)-\]/g, '<span class="diff-del" title="Removed span">[-$1-]</span>');
  safe = safe.replace(/\{\+(.*?)\+\}/g, '<span class="diff-ins" title="Suggested insertion">{+$1+}</span>');
  return safe;
}

function getTierBadgeHtml(tier) {
  const t = (tier || "").toUpperCase();
  if (t.includes("VIOLATION")) {
    return '<span class="tier-badge tier-violation">Violation</span>';
  }
  if (t.includes("HUMAN")) {
    return '<span class="tier-badge tier-human">Needs Human</span>';
  }
  if (t.includes("ADVISORY")) {
    return '<span class="tier-badge tier-advisory">Advisory</span>';
  }
  return '<span class="tier-badge tier-pass">Pass</span>';
}

function renderAreaLoader(message = "Running local verification...") {
  return `<div class="area-loader">
    <span class="spinner-light" aria-hidden="true"></span>
    <span class="area-loader-stage">${escapeHtml(message)}</span>
    <div class="shimmer-bar" aria-hidden="true"></div>
  </div>`;
}

function setButtonLoading(btnEl, loadingText, useDarkSpinner = null) {
  if (!btnEl) return () => {};
  const origHtml = btnEl.innerHTML;
  btnEl.disabled = true;
  const isDark = useDarkSpinner !== null ? useDarkSpinner : btnEl.classList.contains("btn-primary");
  const spinnerClass = isDark ? "spinner-inline" : "spinner-inline-light";
  btnEl.innerHTML = `<span class="${spinnerClass}" aria-hidden="true"></span><span>${escapeHtml(loadingText)}</span>`;
  return () => {
    btnEl.disabled = false;
    btnEl.innerHTML = origHtml;
  };
}

function resetAllInputsToDefault() {
  const clearIds = [
    "sub-content",
    "sub-title",
    "sub-intent",
    "sub-must-keep",
    "must-keep-chip-input",
    "replay-rule-id",
    "replay-terms",
    "new-fact-id",
    "new-fact-subject",
    "new-fact-metric",
    "new-fact-statement",
    "new-fact-from",
    "new-fact-until",
    "copilot-input",
  ];
  for (const id of clearIds) {
    const el = document.getElementById(id);
    if (el) el.value = "";
  }
  const presetSel = document.getElementById("preset-select");
  if (presetSel) {
    presetSel.value = "";
  }
  const originSel = document.getElementById("sub-origin");
  if (originSel) {
    originSel.value = "ai_generated";
  }
  const channelSel = document.getElementById("sub-channel");
  if (channelSel) {
    channelSel.value = "social";
  }
  const modSel = document.getElementById("new-fact-modality");
  if (modSel) {
    modSel.value = "directional";
  }
  MUST_KEEP_TAGS = [];
  renderMustKeepChips();

  // Reset Step 2 & Step 3 to standby state
  CURRENT_ASSET = null;
  renderActiveSubmission(null);

  // Reset Step 4 Submissions Queue to empty standby state
  ALL_SUBMISSIONS = [];
  renderSubmissionsQueueTable();

  // Reset Guidelines tab first box (Linter)
  const linterBox = document.getElementById("linter-results-box");
  if (linterBox) {
    linterBox.innerHTML = `<div class="diff-box" style="text-align:center;color:var(--text-muted);padding:32px 20px;">
      <div style="font-family:var(--font-header);font-size:1.02rem;color:#FFFFFF;margin-bottom:6px;">Guideline Linter Ready</div>
      Click <strong>Scan Rules for Defects</strong> above to inspect compiled Brand-AST rules for contradictions and ambiguous terms.
    </div>`;
  }
  const replayBox = document.getElementById("policy-replay-results");
  if (replayBox) replayBox.innerHTML = "";

  // Reset Metrics page boxes
  const hBox = document.getElementById("hypotheses-table-box");
  if (hBox) {
    hBox.innerHTML = `<div class="diff-box" style="text-align:center;color:var(--text-muted);padding:32px 20px;">
      <div style="font-family:var(--font-header);font-size:1.02rem;color:#FFFFFF;margin-bottom:6px;">Empirical Hypotheses Scorecard Ready</div>
      Click <strong>Refresh Metrics</strong> above or <strong>View Metrics Scorecard</strong> to compute live Section 7.4 empirical benchmark gates from telemetry.
      <div style="margin-top:14px;">
        <button type="button" class="btn btn-banner-preset" onclick="loadInsightsAndTelemetry(this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Load Metrics Scorecard</button>
      </div>
    </div>`;
  }
  const rBox = document.getElementById("ror-telemetry-table-box");
  if (rBox) {
    rBox.innerHTML = `<div class="diff-box" style="text-align:center;color:var(--text-muted);padding:24px 20px;">Reviewer Override Rate diagnostics will be displayed here once metrics are loaded.</div>`;
  }

  // Reset Audit Ledger boxes
  const sumBox = document.getElementById("audit-chain-summary-box");
  if (sumBox) {
    sumBox.innerHTML = `<div class="audit-chain-status-banner">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span class="audit-chain-header-text">Cryptographic Hash-Chain Status:</span>
        <span class="audit-intact-badge"><span class="check-icon">&#10003;</span> READY &amp; STANDBY</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-family:var(--font-header);font-size:0.84rem;color:#E2E8F0;">Verification: <strong style="color:#FFFFFF;">Awaiting User Action</strong></span>
        <button type="button" class="btn btn-banner-preset" onclick="loadAuditLedger(this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> Verify &amp; Load Ledger</button>
      </div>
    </div>`;
  }
  const evBox = document.getElementById("audit-events-table-box");
  if (evBox) {
    evBox.innerHTML = `<div class="diff-box" style="text-align:center;color:var(--text-muted);padding:36px 20px;">
      <div style="font-family:var(--font-header);font-size:1.02rem;color:#FFFFFF;margin-bottom:6px;">SHA-256 Audit Ledger Ready</div>
      Click <strong>Verify &amp; Load Ledger</strong> above to inspect the append-only cryptographic hash-chained governance log.
    </div>`;
  }

  // Reset Banner & Contrast results
  LAST_VISUAL_DATA = null;
  const vBox = document.getElementById("visual-audit-results");
  if (vBox) {
    vBox.innerHTML = `<div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 0.95rem;">Select <strong>Load Non-Compliant Banner</strong> or <strong>Load Compliant Banner</strong> above, or upload a custom image to inspect CIEDE2000 color distances &amp; WCAG 2.1 contrast.</div>`;
  }
}

const pauseForVisualFeedback = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

function scrollToWorkflowSection(sectionId) {
  if (sectionId === "hero-stage") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(sectionId);
  if (!el) return;
  const header = document.querySelector(".top-header");
  const offset = (header ? header.offsetHeight : 60) + 12;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function navigateFromFooter(tabName, sectionId = null) {
  switchTab(tabName, { skipScroll: true });
  if (tabName === "workbench" && sectionId) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToWorkflowSection(sectionId));
    });
    return;
  }
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function launchDraftComposer() {
  navigateFromFooter("workbench", "showcase-step-1");
  setTimeout(() => {
    const draftEl = document.getElementById("sub-content");
    if (draftEl) draftEl.focus({ preventScroll: true });
  }, 520);
}

function toggleDetailModeFromFooter() {
  const nextMode = DETAIL_MODE === "dev" ? "simple" : "dev";
  setDetailMode(nextMode);
  showStatusMessage(
    nextMode === "dev"
      ? "Switched to Audit Details view across the workbench."
      : "Switched to Simple View across the workbench."
  );
}

function showLocalPrivacyInfo() {
  showStatusMessage(
    "Local-first execution: AST linting, BERT-NLI claim verification, WCAG/CIEDE2000 image checks, and SHA-256 ledger hashing run 100% locally with zero external API calls."
  );
}

async function checkEngineHealthFromFooter(btnEl = null) {
  if (btnEl) btnEl.setAttribute("aria-busy", "true");
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const chainLabel = data.audit_chain_valid ? "chain verified" : "chain check flagged";
    showStatusMessage(
      `VeriLoom v${data.version || "2.0.0"} (${data.status || "healthy"}): ${data.active_rules_count ?? 0} active rules, ${data.facts_count ?? 0} verified facts, ${data.audit_events_count ?? 0} ledger events (${chainLabel}).`,
      !data.audit_chain_valid
    );
  } catch (err) {
    showStatusMessage(`Engine health check failed: ${err.message}`, true);
  } finally {
    if (btnEl) btnEl.removeAttribute("aria-busy");
  }
}

async function resetDemoQueueFromFooter() {
  navigateFromFooter("workbench", "showcase-step-4");
  await resetDemoQueue(null);
}

function openPendingSocialProfile(platformName) {
  showStatusMessage(`${platformName} placeholder icon — share your ${platformName} profile URL/ID and we will connect it.`);
}

let STATUS_TIMER = null;
let STATUS_EXIT_TIMER = null;
let LAST_CHAIN_EVENT_COUNT = null;
let LAST_CHAIN_VALID_STATE = null;

function scheduleStatusAutoHide(delayMs = 7000) {
  if (STATUS_TIMER) clearTimeout(STATUS_TIMER);
  STATUS_TIMER = setTimeout(() => {
    dismissStatusMessage();
  }, delayMs);
}

function dismissStatusMessage() {
  if (STATUS_TIMER) {
    clearTimeout(STATUS_TIMER);
    STATUS_TIMER = null;
  }
  const banner = document.getElementById("status-banner");
  if (!banner || banner.classList.contains("hidden") || banner.classList.contains("is-leaving")) {
    return;
  }
  banner.classList.remove("is-entering");
  void banner.offsetWidth;
  banner.classList.add("is-leaving");
  if (STATUS_EXIT_TIMER) clearTimeout(STATUS_EXIT_TIMER);
  STATUS_EXIT_TIMER = setTimeout(() => {
    banner.classList.add("hidden");
    banner.classList.remove("is-leaving", "is-entering");
    STATUS_EXIT_TIMER = null;
  }, 590);
}

function showStatusMessage(msg, isError = false) {
  const banner = document.getElementById("status-banner");
  if (!banner) return;

  if (STATUS_TIMER) {
    clearTimeout(STATUS_TIMER);
    STATUS_TIMER = null;
  }
  if (STATUS_EXIT_TIMER) {
    clearTimeout(STATUS_EXIT_TIMER);
    STATUS_EXIT_TIMER = null;
  }

  banner.style.removeProperty("border-left-color");
  banner.style.removeProperty("background");
  banner.style.removeProperty("color");

  banner.classList.remove("hidden", "is-leaving", "is-entering");
  banner.classList.toggle("is-error", Boolean(isError));

  const iconSvg = isError
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  banner.innerHTML = `<div class="status-toast-inner">
    <span class="status-toast-icon">${iconSvg}</span>
    <span class="status-toast-text">${escapeHtml(msg)}</span>
    <button type="button" class="status-close-btn" aria-label="Dismiss notification" onclick="dismissStatusMessage()">&times;</button>
  </div>`;

  if (!banner.dataset.toastHoverBound) {
    banner.dataset.toastHoverBound = "1";
    banner.addEventListener("mouseenter", () => {
      if (STATUS_TIMER) {
        clearTimeout(STATUS_TIMER);
        STATUS_TIMER = null;
      }
    });
    banner.addEventListener("mouseleave", () => {
      if (!banner.classList.contains("hidden") && !banner.classList.contains("is-leaving")) {
        scheduleStatusAutoHide(10000);
      }
    });
  }

  void banner.offsetWidth;
  banner.classList.add("is-entering");
  scheduleStatusAutoHide(10000);
}

function updateTopChainBadge(isValid, totalEvents = null) {
  const navBadge = document.getElementById("chain-status-badge");
  if (!navBadge) return;

  const validBool = Boolean(isValid);
  const parsedCount =
    typeof totalEvents === "number" && Number.isFinite(totalEvents)
      ? totalEvents
      : (typeof totalEvents === "string" && totalEvents.trim() !== "" && !Number.isNaN(Number(totalEvents))
          ? Number(totalEvents)
          : LAST_CHAIN_EVENT_COUNT);

  const countChanged =
    (parsedCount !== null && parsedCount !== LAST_CHAIN_EVENT_COUNT) ||
    (LAST_CHAIN_VALID_STATE !== null && LAST_CHAIN_VALID_STATE !== validBool);

  LAST_CHAIN_VALID_STATE = validBool;
  if (parsedCount !== null) {
    LAST_CHAIN_EVENT_COUNT = parsedCount;
  }

  navBadge.classList.toggle("chain-tampered", !validBool);
  const countBadgeHtml =
    LAST_CHAIN_EVENT_COUNT !== null
      ? `<span class="chain-badge-count">${LAST_CHAIN_EVENT_COUNT}</span>`
      : "";

  if (validBool) {
    navBadge.title =
      LAST_CHAIN_EVENT_COUNT !== null
        ? `SHA-256 Audit Ledger: ${LAST_CHAIN_EVENT_COUNT} blocks verified — Click to inspect`
        : "SHA-256 Audit Ledger Integrity Verified — Click to inspect";
    navBadge.innerHTML = `<svg class="chain-badge-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
      <span class="chain-badge-text">Chain Verified</span>
      ${countBadgeHtml}`;
  } else {
    navBadge.title =
      LAST_CHAIN_EVENT_COUNT !== null
        ? `TAMPER ALERT: Audit chain check failed across ${LAST_CHAIN_EVENT_COUNT} blocks — Click to inspect`
        : "TAMPER ALERT: Audit Ledger integrity mismatch detected — Click to inspect";
    navBadge.innerHTML = `<svg class="chain-badge-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M12 8v4"/>
        <path d="M12 16h.01"/>
      </svg>
      <span class="chain-badge-text">Tamper Alert</span>
      ${countBadgeHtml}`;
  }

  if (countChanged) {
    navBadge.classList.remove("chain-just-synced");
    void navBadge.offsetWidth;
    navBadge.classList.add("chain-just-synced");
  }
}

async function syncTopChainBadge() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return;
    const data = await res.json();
    updateTopChainBadge(Boolean(data.audit_chain_valid), data.audit_events_count);
  } catch (_) {
    // Keep last known badge state silently on transient polling errors
  }
}

function getActiveActor() {
  const roleEl = document.getElementById("active-role-select");
  const nameEl = document.getElementById("actor-name-input");
  return {
    role: roleEl ? roleEl.value : "Creator",
    name: nameEl && nameEl.value.trim() ? nameEl.value.trim() : "Nandha K",
  };
}

function playPanelVideos(panelEl) {
  if (!panelEl) return;
  for (const vid of panelEl.querySelectorAll("video")) {
    if (vid.paused) vid.play().catch(() => {});
  }
}

function switchTab(tabName, options = {}) {
  const tabs = ["workbench", "visual", "guidelines", "facts", "insights", "audit"];
  for (const t of tabs) {
    const btn = document.getElementById(`tab-btn-${t}`);
    const panel = document.getElementById(`panel-${t}`);
    if (btn) btn.setAttribute("aria-selected", t === tabName ? "true" : "false");
    if (panel) {
      if (t === tabName) {
        panel.classList.remove("hidden");
        panel.classList.remove("tab-panel-anim");
        void panel.offsetWidth;
        panel.classList.add("tab-panel-anim");
        playPanelVideos(panel);
      } else {
        panel.classList.add("hidden");
      }
    }
  }
  if (tabName === "visual" && !LAST_VISUAL_DATA) {
    const resBox = document.getElementById("visual-audit-results");
    if (resBox && !resBox.innerHTML.trim()) {
      resBox.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 0.95rem;">Select <strong>Load Non-Compliant Banner</strong> or <strong>Load Compliant Banner</strong> above, or upload a custom image to inspect CIEDE2000 color distances &amp; WCAG 2.1 contrast.</div>';
    }
  }
  if (tabName === "guidelines") {
    loadGuidelinesRules();
    const linterBox = document.getElementById("linter-results-box");
    if (linterBox && !linterBox.innerHTML.trim()) {
      linterBox.innerHTML = `<div class="diff-box" style="text-align:center;color:var(--text-muted);padding:32px 20px;">
        <div style="font-family:var(--font-header);font-size:1.02rem;color:#FFFFFF;margin-bottom:6px;">Guideline Linter Ready</div>
        Click <strong>Scan Rules for Defects</strong> above to inspect compiled Brand-AST rules for contradictions and ambiguous terms.
      </div>`;
    }
  }
  if (tabName === "facts") loadFactVault();
  if (tabName === "insights") {
    const hBox = document.getElementById("hypotheses-table-box");
    if (hBox && !hBox.innerHTML.trim()) {
      hBox.innerHTML = `<div class="diff-box" style="text-align:center;color:var(--text-muted);padding:32px 20px;">
        <div style="font-family:var(--font-header);font-size:1.02rem;color:#FFFFFF;margin-bottom:6px;">Empirical Hypotheses Scorecard Ready</div>
        Click <strong>Refresh Metrics</strong> above or <strong>View Metrics Scorecard</strong> to compute live Section 7.4 empirical benchmark gates from telemetry.
        <div style="margin-top:14px;">
          <button type="button" class="btn btn-banner-preset" onclick="loadInsightsAndTelemetry(this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Load Metrics Scorecard</button>
        </div>
      </div>`;
    }
    const rBox = document.getElementById("ror-telemetry-table-box");
    if (rBox && !rBox.innerHTML.trim()) {
      rBox.innerHTML = `<div class="diff-box" style="text-align:center;color:var(--text-muted);padding:24px 20px;">Reviewer Override Rate diagnostics will be displayed here once metrics are loaded.</div>`;
    }
  }
  if (tabName === "audit") {
    const sumBox = document.getElementById("audit-chain-summary-box");
    if (sumBox && !sumBox.innerHTML.trim()) {
      sumBox.innerHTML = `<div class="audit-chain-status-banner">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span class="audit-chain-header-text">Cryptographic Hash-Chain Status:</span>
          <span class="audit-intact-badge"><span class="check-icon">&#10003;</span> READY &amp; STANDBY</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font-family:var(--font-header);font-size:0.84rem;color:#E2E8F0;">Verification: <strong style="color:#FFFFFF;">Awaiting User Action</strong></span>
          <button type="button" class="btn btn-banner-preset" onclick="loadAuditLedger(this)"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg> Verify &amp; Load Ledger</button>
        </div>
      </div>`;
    }
    const evBox = document.getElementById("audit-events-table-box");
    if (evBox && !evBox.innerHTML.trim()) {
      evBox.innerHTML = `<div class="diff-box" style="text-align:center;color:var(--text-muted);padding:36px 20px;">
        <div style="font-family:var(--font-header);font-size:1.02rem;color:#FFFFFF;margin-bottom:6px;">SHA-256 Audit Ledger Ready</div>
        Click <strong>Verify &amp; Load Ledger</strong> above to inspect the append-only cryptographic hash-chained governance log.
      </div>`;
    }
  }
  scheduleWorkflowConnectors();
  const header = document.querySelector(".top-header");
  if (header) {
    header.classList.toggle("force-glass", tabName !== "workbench");
    header.classList.remove("header-hidden");
  }
  if (!options.skipScroll) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

async function loadPresets() {
  try {
    const res = await fetch("/api/submissions/presets/list");
    const data = await res.json();
    DEMO_PRESETS = data.presets || [];
    const sel = document.getElementById("preset-select");
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Choose a ready-made test scenario --</option>';
    for (const p of DEMO_PRESETS) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = String(p.label || "").replace(/§\s*(\d)/g, "Section $1").replace(/§/g, "Section ");
      sel.appendChild(opt);
    }
  } catch (err) {
    console.error("Failed to load presets:", err);
  }
}

function applySelectedPreset() {
  const sel = document.getElementById("preset-select");
  if (!sel || !sel.value) return;
  const preset = DEMO_PRESETS.find((p) => p.id === sel.value);
  if (!preset) return;
  document.getElementById("sub-title").value = String(preset.title || "").replace(/§\s*(\d)/g, "Section $1").replace(/§/g, "Section ");
  document.getElementById("sub-content").value = preset.content;
  document.getElementById("sub-intent").value = preset.creator_intent;
  setMustKeepTagsFromString((preset.must_keep_points || []).join(", "));
  document.getElementById("sub-origin").value = preset.origin || "employee";
  document.getElementById("sub-channel").value = preset.channel || "social";
  const cleanLabel = String(preset.label || "").replace(/§\s*(\d)/g, "Section $1").replace(/§/g, "Section ");
  showStatusMessage(`Loaded scenario: ${cleanLabel}. Click "Verify Draft Now" to evaluate.`);
}

/* ========================================================================= */
/* SUBMISSIONS QUEUE, FILTER BAR & DEMO RESET                                */
/* ========================================================================= */
function setQueueFilter(filterKey) {
  QUEUE_FILTER = filterKey;
  renderSubmissionsQueueTable();
}

function renderSubmissionsQueueTable() {
  const box = document.getElementById("submissions-queue-list");
  const filterBar = document.getElementById("queue-filter-bar");
  if (!box) return;

  const totalCount = ALL_SUBMISSIONS.length;
  const legalCount = ALL_SUBMISSIONS.filter((x) => x.status === "ESCALATED_LEGAL" || x.status === "IN_MANAGER_REVIEW").length;
  const approvedCount = ALL_SUBMISSIONS.filter((x) => x.status === "APPROVED").length;
  const violationCount = ALL_SUBMISSIONS.filter((x) => (x.overall_verdict || "").toUpperCase().includes("VIOLATION")).length;

  if (filterBar) {
    const filters = [
      { key: "all", label: "All Submissions", count: totalCount },
      { key: "legal", label: "Needs Sign-Off", count: legalCount },
      { key: "approved", label: "Approved", count: approvedCount },
      { key: "violations", label: "Violations", count: violationCount },
    ];
    filterBar.innerHTML = filters
      .map(
        (f) => `<button type="button" class="filter-pill ${QUEUE_FILTER === f.key ? "active" : ""}" onclick="setQueueFilter('${f.key}')">
          <span>${escapeHtml(f.label)}</span>
          <span class="filter-count">${f.count}</span>
        </button>`
      )
      .join("");
  }

  let filtered = ALL_SUBMISSIONS;
  if (QUEUE_FILTER === "legal") {
    filtered = ALL_SUBMISSIONS.filter((x) => x.status === "ESCALATED_LEGAL" || x.status === "IN_MANAGER_REVIEW");
  } else if (QUEUE_FILTER === "approved") {
    filtered = ALL_SUBMISSIONS.filter((x) => x.status === "APPROVED");
  } else if (QUEUE_FILTER === "violations") {
    filtered = ALL_SUBMISSIONS.filter((x) => (x.overall_verdict || "").toUpperCase().includes("VIOLATION"));
  }

  if (filtered.length === 0) {
    box.innerHTML = `<div class="diff-box" style="text-align:center;color:var(--text-muted);padding:36px 20px;">
      <div style="font-family:var(--font-header);font-size:1.02rem;color:#FFFFFF;margin-bottom:6px;">Submissions Queue Ready &amp; Waiting</div>
      ${ALL_SUBMISSIONS.length === 0 ? "No active submissions in queue. Enter marketing copy in Step 1 above and click <strong>Verify Draft Now</strong> to run verification, or click <strong>Load Benchmark Queue</strong> below." : "No submissions match the selected filter."}
      <div style="margin-top:14px;">
        <button type="button" class="btn btn-banner-preset" onclick="loadSubmissionsQueue(null, this)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ${ALL_SUBMISSIONS.length === 0 ? "Load Benchmark Queue" : "Refresh Submissions Queue"}</button>
      </div>
    </div>`;
    return;
  }

  let html = '<table class="data-table"><thead><tr><th>Asset ID</th><th>Submission Title</th><th>Origin &amp; Channel</th><th>Verdict</th><th>Assigned Reviewer</th><th>Workflow Status</th><th style="text-align:right;">Action</th></tr></thead><tbody>';
  for (const item of filtered) {
    const cleanTitle = escapeHtml(item.title);
    const isSelected = CURRENT_ASSET && CURRENT_ASSET.asset_id === item.asset_id;
    html += `<tr style="${isSelected ? "background: rgba(247, 230, 202, 0.07);" : ""}">
      <td style="white-space:nowrap;"><strong>${escapeHtml(item.asset_id)}</strong></td>
      <td>${cleanTitle}</td>
      <td style="white-space:nowrap;font-size:0.84rem;color:var(--text-muted);">${escapeHtml(formatOriginLabel(item.origin))} &bull; ${escapeHtml(formatChannelLabel(item.channel))}</td>
      <td style="white-space:nowrap;">${getTierBadgeHtml(item.overall_verdict)}</td>
      <td style="white-space:nowrap;"><span style="color:var(--text-secondary);">${escapeHtml(item.assigned_role)}</span></td>
      <td style="white-space:nowrap;">${formatWorkflowStatusBadge(item.status)}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button type="button" class="btn ${isSelected ? "btn-primary" : "btn-outline"} btn-sm" onclick="selectSubmission('${escapeHtml(item.asset_id)}', this)">
          ${isSelected ? "Viewing Report" : "Inspect Report"}
        </button>
      </td>
    </tr>`;
  }
  html += "</tbody></table>";
  box.innerHTML = html;
}

async function loadSubmissionsQueue(selectId = null, btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Refreshing...", false);
  try {
    if (btnEl) await pauseForVisualFeedback(240);
    const res = await fetch("/api/submissions");
    const data = await res.json();
    ALL_SUBMISSIONS = data.submissions || [];

    const target = selectId
      ? ALL_SUBMISSIONS.find((x) => x.asset_id === selectId)
      : (CURRENT_ASSET && ALL_SUBMISSIONS.find((x) => x.asset_id === CURRENT_ASSET.asset_id)) || null;

    if (target) {
      renderActiveSubmission(target);
    } else if (!CURRENT_ASSET) {
      renderActiveSubmission(null);
    }
    renderSubmissionsQueueTable();
  } catch (err) {
    console.error("Failed to load queue:", err);
  } finally {
    restoreBtn();
  }
}

async function resetDemoQueue(btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Resetting Demo Queue...", false);
  try {
    await pauseForVisualFeedback(260);
    const res = await fetch("/api/submissions/reset-demo-queue", { method: "POST" });
    const data = await res.json();
    QUEUE_FILTER = "all";
    const roleEl = document.getElementById("active-role-select");
    if (roleEl) roleEl.value = "Creator";
    await loadSubmissionsQueue("AST-WE-404");
    syncTopChainBadge();
    showStatusMessage(`Cleaned ${data.removed_duplicates || 0} duplicate test run(s) and reset Role to Creator for live demo pitch.`);
  } catch (err) {
    showStatusMessage(`Error resetting queue: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function selectSubmission(assetId, btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Loading...", false);
  try {
    if (btnEl) await pauseForVisualFeedback(200);
    const res = await fetch(`/api/submissions/${encodeURIComponent(assetId)}`);
    if (!res.ok) return;
    const asset = await res.json();
    renderActiveSubmission(asset);
    renderSubmissionsQueueTable();
    if (btnEl) {
      scrollToWorkflowSection("showcase-step-2");
    }
  } catch (err) {
    console.error("Error selecting submission:", err);
  } finally {
    restoreBtn();
  }
}

function renderActiveSubmission(asset) {
  CURRENT_ASSET = asset;
  if (!asset) {
    const titleEl = document.getElementById("active-asset-title");
    if (titleEl) titleEl.textContent = "Awaiting Draft Verification";
    const metaEl = document.getElementById("active-asset-meta");
    if (metaEl) metaEl.innerHTML = "Ready for input. Enter marketing copy in Step 1 and click <strong>Verify Draft Now</strong>, or select a record from the Submissions Queue below.";
    const vBadge = document.getElementById("active-verdict-badge");
    if (vBadge) vBadge.outerHTML = '<span id="active-verdict-badge" class="tier-badge tier-pass" style="border-radius:7px;">STANDBY</span>';
    const stBadge = document.getElementById("active-status-badge");
    if (stBadge) stBadge.outerHTML = '<span id="active-status-badge" class="tier-badge tier-pass" style="border-radius:7px;">AWAITING ACTION</span>';
    const origBox = document.getElementById("active-original-text");
    if (origBox) origBox.textContent = "No draft submitted yet. Enter copy in Step 1 above to begin verification.";
    const currBox = document.getElementById("active-current-text");
    if (currBox) currBox.textContent = "No working copy generated yet.";
    const findingsDiv = document.getElementById("active-findings-list");
    if (findingsDiv) findingsDiv.innerHTML = '<div style="padding: 28px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">No active findings. Enter your draft copy and click &quot;Verify Draft Now&quot;.</div>';
    const secBanner = document.getElementById("security-alert-banner");
    if (secBanner) {
      secBanner.className = "hidden";
      secBanner.innerHTML = "";
    }
    const signoffActions = document.getElementById("step3-signoff-actions");
    if (signoffActions) signoffActions.style.opacity = "0.45";
    const btnApprove = document.getElementById("btn-decision-APPROVE");
    if (btnApprove) btnApprove.disabled = true;
    const btnEscalate = document.getElementById("btn-decision-ESCALATE");
    if (btnEscalate) btnEscalate.disabled = true;
    const btnReject = document.getElementById("btn-decision-REJECT");
    if (btnReject) btnReject.disabled = true;
    const routeNote = document.getElementById("approval-routing-note");
    if (routeNote) routeNote.innerHTML = '<span style="color:var(--text-muted);font-size:0.84rem;">Ready for evaluation. Submit a draft in Step 1 to trigger multi-tier governance.</span>';
    return;
  }
  const cleanTitle = String(asset.title || "").replace(/§\s*(\d)/g, "Section $1").replace(/§/g, "Section ");
  document.getElementById("active-asset-title").textContent = `${asset.asset_id}: ${cleanTitle}`;

  const originText = DETAIL_MODE === "dev" ? `${formatOriginLabel(asset.origin)} (${asset.origin})` : formatOriginLabel(asset.origin);
  const channelText = DETAIL_MODE === "dev" ? `${formatChannelLabel(asset.channel)} (${asset.channel})` : formatChannelLabel(asset.channel);

  document.getElementById("active-asset-meta").innerHTML =
    `Origin: <strong>${escapeHtml(originText)}</strong> &bull; Channel: <strong>${escapeHtml(channelText)}</strong> &bull; ` +
    `Protected Words: <strong>${escapeHtml((asset.must_keep_points || []).join(", ") || "None")}</strong>` +
    `<span class="dev-only-el"> &bull; SHA-256: <code>${escapeHtml((asset.normalized_sha256 || "").slice(0, 16))}...</code></span>`;

  document.getElementById("active-verdict-badge").outerHTML =
    `<span id="active-verdict-badge">${getTierBadgeHtml(asset.overall_verdict)}</span>`;

  const stBadge = document.getElementById("active-status-badge");
  if (stBadge) {
    stBadge.outerHTML = `<span id="active-status-badge">${formatWorkflowStatusBadge(asset.status)}</span>`;
  }

  document.getElementById("active-original-text").textContent = asset.raw_content;
  const currBox = document.getElementById("active-current-text");
  const currLabel = document.getElementById("working-copy-label");

  // Compute cumulative working copy sequentially across all ACCEPTED_FIX findings
  const findings = asset.findings || [];
  const baseText = asset.normalized_content || asset.raw_content || "";
  let cumulativeWorkingCopy = baseText;
  const hasCustomEdit = findings.some((f) => f.creator_action === "EDIT");
  if (hasCustomEdit) {
    cumulativeWorkingCopy = asset.current_content;
  } else {
    for (const f of findings) {
      if (f.status !== "ACCEPTED_FIX" || !f.suggested_fix || f.suggested_fix === baseText) continue;
      const sf = String(f.suggested_fix);
      const minLen = Math.min(baseText.length, sf.length);
      let pLen = 0;
      while (pLen < minLen && baseText[pLen] === sf[pLen]) pLen++;
      let sLen = 0;
      while (
        sLen < minLen - pLen &&
        baseText[baseText.length - 1 - sLen] === sf[sf.length - 1 - sLen]
      ) {
        sLen++;
      }
      const oldSpan = baseText.slice(pLen, baseText.length - sLen);
      const newSpan = sf.slice(pLen, sf.length - sLen);
      if (oldSpan && cumulativeWorkingCopy.includes(oldSpan)) {
        cumulativeWorkingCopy = cumulativeWorkingCopy.replace(oldSpan, newSpan);
      }
    }
  }
  asset.current_content = cumulativeWorkingCopy;
  currBox.textContent = cumulativeWorkingCopy;

  // Determine whether any fix is currently applied vs disputed vs unchanged
  const hasAcceptedFix = findings.some((f) => f.status === "ACCEPTED_FIX") || cumulativeWorkingCopy !== (asset.normalized_content || asset.raw_content);
  const allDisputed = findings.length > 0 && findings.every((f) => f.status === "DISPUTED") && !hasAcceptedFix;

  if (currLabel && currBox) {
    if (hasAcceptedFix) {
      currLabel.textContent = "Working Copy (After Accepted Fixes)";
      currLabel.style.color = "#86efac";
      currBox.style.borderColor = "rgba(34, 197, 94, 0.45)";
      currBox.style.background = "rgba(34, 197, 94, 0.06)";
    } else if (allDisputed) {
      currLabel.textContent = "Working Copy (Unchanged — Finding Disputed by Creator)";
      currLabel.style.color = "var(--accent-champagne)";
      currBox.style.borderColor = "rgba(232, 213, 158, 0.35)";
      currBox.style.background = "var(--bg-input)";
    } else {
      currLabel.textContent = "Working Copy (Awaiting Creator Action)";
      currLabel.style.color = "var(--text-secondary)";
      currBox.style.borderColor = "var(--border-subtle)";
      currBox.style.background = "var(--bg-input)";
    }
  }

  const actor = getActiveActor();
  const isCreatorRole = actor.role === "Creator";
  const isManagerRole = actor.role === "Brand Manager";
  const isAuthorisedReviewer = actor.role === "Authorised Reviewer" || actor.role === "Brand Admin";
  const rc = asset.receipt || {};
  const hasInjection = (rc.injection_attempts_blocked || 0) > 0 || asset.status === "BLOCKED_SECURITY";
  const isApproved = asset.status === "APPROVED";

  // Render or hide OWASP LLM01 & PII Security Alert Banner at top of Step 2
  let secBanner = document.getElementById("security-alert-banner");
  if (!secBanner) {
    secBanner = document.createElement("div");
    secBanner.id = "security-alert-banner";
    const diffGrid = document.querySelector("#active-submission-panel .diff-comparison-grid");
    if (diffGrid && diffGrid.parentNode) {
      diffGrid.parentNode.insertBefore(secBanner, diffGrid);
    }
  }
  if (isApproved && hasInjection) {
    secBanner.className = "diff-box";
    secBanner.style.cssText = "border: 1px solid rgba(110, 231, 183, 0.28); background: linear-gradient(180deg, rgba(16, 38, 28, 0.72) 0%, rgba(10, 24, 18, 0.88) 100%); color: #F1F5F9; margin-bottom: 16px; padding: 14px 18px; border-radius: 9px; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.40), inset 0 1px 0 rgba(255, 255, 255, 0.08);";
    secBanner.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div style="flex:1;min-width:260px;">
          <div style="font-family:var(--font-header);font-size:1.02rem;font-weight:600;color:#A7F3D0;letter-spacing:-0.01em;display:flex;align-items:center;gap:7px;">
            <span>&#10003;</span>
            <span>OWASP LLM01 Security Cleared &amp; Sign-Off Completed</span>
          </div>
          <div style="font-size:0.86rem;color:#E2E8F0;line-height:1.55;margin-top:5px;">
            Prompt injection neutralized and PII redacted. Approved for production release by <strong>${escapeHtml(asset.approved_by || actor.name)}</strong>.
          </div>
        </div>
        <span class="tier-badge tier-pass" style="border-radius:7px;">Security Cleared</span>
      </div>`;
  } else if (!isApproved && hasInjection) {
    secBanner.className = "diff-box";
    secBanner.style.cssText = "border: 1px solid #731A25; background: linear-gradient(180deg, rgba(58, 18, 24, 0.72) 0%, rgba(36, 12, 16, 0.88) 100%); color: #FEE2E2; margin-bottom: 16px; padding: 14px 18px; border-radius: 9px; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.40), inset 0 1px 0 rgba(255, 255, 255, 0.08);";
    secBanner.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div style="flex:1;min-width:260px;">
          <div style="font-family:var(--font-header);font-size:1.02rem;font-weight:600;color:#FECACA;letter-spacing:-0.01em;display:flex;align-items:center;gap:7px;">
            <span>&#9888;</span>
            <span>OWASP LLM01: Prompt Injection &amp; PII Leakage Intercepted</span>
          </div>
          <div style="font-size:0.86rem;color:#E2E8F0;line-height:1.55;margin-top:5px;">
            <strong>OWASP LLM01 Security Gate:</strong> Direct instruction override attempting to bypass compliance verification and force approval was neutralized. Masked <strong>${rc.pii_masked_count || 2}</strong> sensitive PII entities and redacted <strong>${rc.confidential_terms_masked_count || 1}</strong> confidential code-names. Requires Authorised Reviewer (Legal) sign-off.
          </div>
        </div>
        <span class="tier-badge tier-violation" style="border-radius:7px;">OWASP LLM01 Flagged</span>
      </div>`;
  } else if (secBanner) {
    secBanner.className = "hidden";
    secBanner.innerHTML = "";
  }

  // Strict RBAC & Security Policy Governance on Step 3 Final Decision
  const signoffActions = document.getElementById("step3-signoff-actions");
  const btnApprove = document.getElementById("btn-decision-APPROVE");
  const btnEscalate = document.getElementById("btn-decision-ESCALATE");
  const btnReject = document.getElementById("btn-decision-REJECT");
  if (btnApprove && btnEscalate && btnReject) {
    if (isApproved) {
      btnApprove.disabled = true;
      btnApprove.style.opacity = "0.7";
      btnEscalate.disabled = true;
      btnReject.disabled = true;
      if (signoffActions) signoffActions.style.opacity = "0.85";
    } else {
      const canApprove = isAuthorisedReviewer || (!hasInjection && isManagerRole);
      btnApprove.disabled = !canApprove;
      btnEscalate.disabled = isCreatorRole;
      btnReject.disabled = isCreatorRole;
      if (signoffActions) {
        signoffActions.style.opacity = isCreatorRole ? "0.45" : "1";
      }
    }
  }

  const routeNote = document.getElementById("approval-routing-note");
  if (routeNote) {
    if (isApproved) {
      routeNote.innerHTML =
        `<span style="color:#86efac;font-weight:600;">&#10003; Approved by <strong>${escapeHtml(asset.approved_by || actor.name)}</strong></span>` +
        `<span class="dev-only-el"> &bull; Fingerprint: <code>${escapeHtml((asset.approved_sha256 || "").slice(0, 20))}...</code></span>`;
    } else if (isCreatorRole) {
      routeNote.innerHTML =
        `<div class="rbac-lock-notice">&#128274; Role Lock: Creators cannot self-approve submissions (Routed to <strong>${escapeHtml(asset.assigned_role)}</strong>).</div>` +
        `<div style="margin-top:6px;"><button type="button" class="btn btn-primary btn-sm" style="padding:4px 11px;font-size:0.76rem;" onclick="switchRoleAndApprove()">Switch to Legal Reviewer &amp; Approve (1-Click Demo)</button></div>`;
    } else if (isManagerRole && hasInjection) {
      routeNote.innerHTML =
        `<div class="rbac-lock-notice" style="color:#fca5a5;border-color:rgba(239,68,68,0.45);background:rgba(239,68,68,0.14);">&#128721; Security Gate: Prompt injection detected in source draft. Requires Authorised Reviewer (Legal Reviewer) sign-off.</div>` +
        `<div style="margin-top:6px;"><button type="button" class="btn btn-primary btn-sm" style="padding:4px 11px;font-size:0.76rem;" onclick="switchToRole('Authorised Reviewer')">Switch to Legal Reviewer &amp; Sign Off</button></div>`;
    } else {
      routeNote.innerHTML =
        `Signed in as <strong>${escapeHtml(actor.role)}</strong> &mdash; ${hasInjection ? "Security clearance &amp; governance sign-off unlocked." : "governance sign-off unlocked."}`;
    }
  }

  // Render findings cards with mutually exclusive state badges and RBAC locks
  const fBox = document.getElementById("active-findings-list");
  if (findings.length === 0) {
    fBox.innerHTML = '<div class="panel-card" style="background:rgba(34, 197, 94, 0.12);border-color:#22c55e;color:#86efac;font-weight:600;margin-bottom:0;">Zero brand or factual violations detected. Ready for human sign-off.</div>';
  } else {
    let cardsHtml = "";
    for (const f of findings) {
      const cardClass = f.verdict_tier === "Violation" ? "card-violation" : (f.verdict_tier === "Needs human" ? "card-human" : "card-advisory");
      const isAccepted = f.status === "ACCEPTED_FIX";
      const isDisputed = f.status === "DISPUTED";
      const isWaived = f.status === "WAIVED" || f.status === "OVERRIDDEN";
      const isPending = f.status === "OPEN";

      let statusPillHtml = '<span class="tier-badge tier-human">Open Finding</span>';
      if (isAccepted) {
        statusPillHtml = '<span class="tier-badge tier-pass" style="background:rgba(34,197,94,0.2);color:#86efac;border-color:#22c55e;">&#10003; Fix Applied</span>';
      } else if (isDisputed) {
        statusPillHtml = '<span class="tier-badge tier-advisory" style="background:rgba(245,158,11,0.2);color:#fde68a;border-color:#f59e0b;">&#9888; Disputed by Creator</span>';
      } else if (isWaived) {
        statusPillHtml = `<span class="tier-badge tier-pass">${escapeHtml(f.status === "WAIVED" ? "Waived by Reviewer" : "Overridden by Reviewer")}</span>`;
      }

      // Mutually exclusive Primary Creator Actions
      let creatorButtonsHtml = "";
      if (isAccepted) {
        creatorButtonsHtml = `
          <span class="tier-badge tier-pass" style="padding:6px 12px;background:rgba(34,197,94,0.16);color:#86efac;border-color:rgba(34,197,94,0.45);">&#10003; Surgical Fix Active in Working Copy</span>
          <button type="button" class="btn btn-outline btn-sm" onclick="handleCreatorFindingAction('${escapeHtml(f.finding_id)}', 'UNDO', this)">
            Undo Fix
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="handleCreatorFindingAction('${escapeHtml(f.finding_id)}', 'DISPUTE', this)">
            Switch to Dispute
          </button>
        `;
      } else if (isDisputed) {
        creatorButtonsHtml = `
          <button type="button" class="btn btn-primary" style="padding:8px 16px;" onclick="handleCreatorFindingAction('${escapeHtml(f.finding_id)}', 'ACCEPT', this)">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Accept Suggested Fix Instead
          </button>
          <span class="tier-badge tier-advisory" style="padding:6px 11px;">Dispute Escalated to Reviewer</span>
        `;
      } else {
        creatorButtonsHtml = `
          <button type="button" class="btn btn-primary" style="padding:8px 16px;" onclick="handleCreatorFindingAction('${escapeHtml(f.finding_id)}', 'ACCEPT', this)">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Accept Suggested Fix
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="handleCreatorFindingAction('${escapeHtml(f.finding_id)}', 'DISPUTE', this)">
            Dispute Finding
          </button>
        `;
      }

      cardsHtml += `
      <div class="finding-card ${cardClass}">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div class="mandatory-disclosure-header">
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
              ${getTierBadgeHtml(f.verdict_tier)}
              ${f.fact_id ? `<span class="tier-badge tier-human">Fact: ${escapeHtml(f.fact_id)}</span>` : ""}
            </div>
            <div>
              <strong class="simple-only-el" style="color:var(--text-primary);">${escapeHtml(f.category ? f.category.toUpperCase() + " CHECK" : "Brand Guideline")}</strong>
              <strong class="dev-only-el" style="color:var(--text-primary);">Rule: ${escapeHtml(f.rule_id)}</strong>
              <span class="dev-only-el" style="font-size:0.8rem;color:var(--text-muted);margin-left:6px;">(${escapeHtml(f.source_clause)})</span>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
            ${isPending ? `<span class="next-step-pill">Recommended Next Step: Accept Fix</span>` : ""}
            <span class="tier-badge tier-pass dev-only-el" title="Intent Preservation Metric">IPM: ${Number(f.ipm_score).toFixed(2)}</span>
            ${statusPillHtml}
          </div>
        </div>

        <p style="margin:10px 0 8px 0;font-weight:500;color:var(--text-primary);">${escapeHtml(f.explanation)}</p>

        <!-- Simple Summary Metadata -->
        <div class="finding-meta-grid simple-only-el">
          <div><strong>Flagged Phrase in Draft:</strong><br/><code>${escapeHtml(f.span)}</code></div>
          <div><strong>Approved Fact / Guideline:</strong><br/>${escapeHtml(f.fact_vault_match || "Brand voice & terminology rule")}</div>
        </div>

        <!-- Developer / Audit Details Metadata -->
        <div class="finding-meta-grid dev-only-el">
          <div><strong>Offending Span:</strong><br/><code>${escapeHtml(f.span)}</code></div>
          <div><strong>Fact Vault Match:</strong><br/>${escapeHtml(f.fact_vault_match || "Deterministic rule match")}</div>
          <div><strong>Stability Gate:</strong><br/>${escapeHtml(f.stability_note)}</div>
          <div><strong>Risk Routing:</strong><br/><strong>${escapeHtml(f.route_to)}</strong></div>
        </div>

        <div style="margin:10px 0;">
          <strong style="font-size:0.84rem;color:var(--text-secondary);">Suggested One-Click Rewrite (Tracked Change):</strong>
          <div class="diff-box" style="margin-top:6px;">${renderTrackedChangesHtml(f.tracked_change)}</div>
          <div class="simple-only-el" style="font-size:0.78rem;color:#86efac;margin-top:6px;">
            Protected keywords preserved automatically.
          </div>
          <div class="dev-only-el" style="font-size:0.78rem;color:#86efac;margin-top:6px;font-weight:500;">
            Intent Lock: ${escapeHtml(f.intent_lock_note)}
          </div>
        </div>

        <!-- Clear Visual Action Hierarchy: Primary Creator CTA vs Role-Locked Reviewer Waiver -->
        <div class="finding-actions-split">
          <div class="action-group-box" style="border-color:rgba(232, 213, 158, 0.35);background:rgba(247, 230, 202, 0.04);">
            <span class="action-group-label" style="color:var(--accent-cream);">Primary Action &mdash; Creator Fix</span>
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
              ${creatorButtonsHtml}
            </div>
          </div>
          <div class="action-group-box ${isCreatorRole ? "rbac-locked-box" : ""}">
            <span class="action-group-label">Secondary &mdash; Reviewer Exception / Waiver</span>
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
              <select id="waiver-reason-${escapeHtml(f.finding_id)}" class="form-control" style="width:auto;padding:5px 10px;font-size:0.8rem;" aria-label="Waiver reason code" ${isCreatorRole ? "disabled" : ""}>
                <option value="FALSE_POSITIVE">Reason: False Positive</option>
                <option value="CREATIVE_EXCEPTION">Reason: Creative Exception</option>
                <option value="APPROVED_PROMO_OVERRIDE">Reason: Approved Promo</option>
                <option value="UNCLEAR_RULE">Reason: Unclear Rule (Flag Linter)</option>
              </select>
              <button type="button" class="btn btn-ghost btn-sm" ${isCreatorRole ? "disabled" : ""} onclick="handleReviewerFindingDecision('${escapeHtml(f.finding_id)}', 'WAIVER', this)">
                Grant Waiver
              </button>
              <button type="button" class="btn btn-ghost btn-sm dev-only-el" ${isCreatorRole ? "disabled" : ""} onclick="handleReviewerFindingDecision('${escapeHtml(f.finding_id)}', 'OVERRIDE', this)">
                Override Flag
              </button>
            </div>
            ${isCreatorRole ? `<div class="rbac-lock-notice">&#128274; Switch Role to Brand Manager or Legal Reviewer to grant waivers</div>` : ""}
          </div>
        </div>
      </div>`;
    }
    fBox.innerHTML = cardsHtml;
    initGlassSelects(fBox);
  }

  // Render AI Disclosure & Privacy Summary
  const rBox = document.getElementById("active-receipt-box");
  const modelsText = (rc.models_invoked && rc.models_invoked.length > 0)
    ? rc.models_invoked.join(", ")
    : "Local Deterministic Engine + 67M BERT-NLI";
  rBox.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
      <div>
        <strong style="font-size:0.96rem;color:var(--text-primary);">AI Verification &amp; Privacy Guarantee</strong>
        <span class="simple-only-el" style="font-size:0.85rem;color:var(--text-muted);margin-left:8px;">
          Verified locally on your device &bull; 0 bytes sent to external servers.
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="tier-badge tier-pass">100% Local Execution</span>
        <button type="button" class="btn btn-ghost btn-sm simple-only-el" style="padding:3px 9px;font-size:0.75rem;" onclick="setDetailMode('dev')">
          Show Technical &amp; SHA-256 Details
        </button>
        <button type="button" class="btn btn-ghost btn-sm dev-only-el" style="padding:3px 9px;font-size:0.75rem;" onclick="setDetailMode('simple')">
          Switch to Simple Summary
        </button>
      </div>
    </div>
    <div class="dev-only-el" style="margin-top:12px;">
      <p style="margin:0 0 12px 0;color:var(--text-secondary);">
        ${escapeHtml(rc.summary_text || "All brand rules, Fact Vault claims, and semantic intent checks were verified locally on your machine.")}
      </p>
      <div class="finding-meta-grid" style="margin:0;grid-template-columns:repeat(3, 1fr);">
        <div><strong>Engine &amp; Models:</strong><br/>${escapeHtml(modelsText)}</div>
        <div><strong>Data Privacy:</strong><br/>${rc.external_data_sent ? "External API Used" : "0 Bytes Sent Externally"}</div>
        <div><strong>Document SHA-256:</strong><br/><code>${escapeHtml((asset.original_sha256 || "").slice(0, 24))}...</code></div>
      </div>
    </div>`;
}

async function submitContentForVerification() {
  commitMustKeepChipInput();
  const actor = getActiveActor();
  const title = document.getElementById("sub-title").value.trim() || "Untitled Submission";
  const content = document.getElementById("sub-content").value.trim();
  const intent = document.getElementById("sub-intent").value.trim();
  const mkRaw = document.getElementById("sub-must-keep").value;
  const mustKeep = mkRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const origin = document.getElementById("sub-origin").value;
  const channel = document.getElementById("sub-channel").value;

  if (!content) {
    showStatusMessage("Please enter content to verify.", true);
    return;
  }

  const verifyBtn = document.getElementById("btn-verify-draft");
  const restoreVerifyBtn = setButtonLoading(verifyBtn, "Verifying Draft...", true);
  const fBox = document.getElementById("active-findings-list");
  if (fBox) {
    fBox.innerHTML = renderAreaLoader("Executing 9-layer deterministic AST & Fact Vault checks...");
  }

  let stageTimer = null;
  if (fBox) {
    stageTimer = setTimeout(() => {
      const stageEl = fBox.querySelector(".area-loader-stage");
      if (stageEl) {
        stageEl.style.opacity = "0";
        setTimeout(() => {
          if (stageEl.isConnected) {
            stageEl.textContent = "Evaluating local 67M BERT-NLI intent & safety gates...";
            stageEl.style.opacity = "1";
          }
        }, 160);
      }
    }, 280);
  }

  try {
    const [res] = await Promise.all([
      fetch("/api/submissions", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          title,
          content,
          creator_intent: intent,
          must_keep_points: mustKeep,
          origin,
          channel,
          actor_name: actor.name,
          actor_role: actor.role,
        }),
      }),
      pauseForVisualFeedback(520),
    ]);
    const data = await res.json();
    if (!res.ok) {
      if (fBox) fBox.innerHTML = "";
      showStatusMessage(data.detail || "Verification request failed.", true);
      return;
    }
    showStatusMessage(`Verified ${data.asset_id}: Verdict = ${data.overall_verdict} (${data.findings_count} finding(s)). Routed to ${data.assigned_role}.`);
    await loadSubmissionsQueue(data.asset_id);
    syncTopChainBadge();
    scrollToWorkflowSection("showcase-step-2");
  } catch (err) {
    if (fBox) fBox.innerHTML = "";
    showStatusMessage(`Error: ${err.message}`, true);
  } finally {
    if (stageTimer) clearTimeout(stageTimer);
    restoreVerifyBtn();
  }
}

async function uploadDocumentFile() {
  commitMustKeepChipInput();
  const fileInput = document.getElementById("file-upload-input");
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
  const file = fileInput.files[0];

  const uploadLabelText = document.getElementById("upload-file-label-text");
  const origLabel = uploadLabelText ? uploadLabelText.innerHTML : "Upload Doc (.txt/.docx)";
  if (uploadLabelText) {
    uploadLabelText.innerHTML = `<span class="spinner-inline-light"></span> Uploading...`;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", `Uploaded: ${file.name}`);
  formData.append("creator_intent", document.getElementById("sub-intent").value);
  formData.append("must_keep_points", document.getElementById("sub-must-keep").value);
  formData.append("origin", document.getElementById("sub-origin").value);
  formData.append("channel", document.getElementById("sub-channel").value);

  try {
    await pauseForVisualFeedback(280);
    const res = await fetch("/api/submissions/upload-file", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      showStatusMessage(data.detail || "File upload failed.", true);
      return;
    }
    showStatusMessage(`Ingested & verified ${file.name} (${data.asset_id}): Verdict = ${data.overall_verdict}.`);
    await loadSubmissionsQueue(data.asset_id);
    syncTopChainBadge();
    scrollToWorkflowSection("showcase-step-2");
  } catch (err) {
    showStatusMessage(`Upload error: ${err.message}`, true);
  } finally {
    if (uploadLabelText) uploadLabelText.innerHTML = origLabel;
    fileInput.value = "";
  }
}

async function handleCreatorFindingAction(findingId, action, btnEl = null) {
  const actor = getActiveActor();
  const isAccept = action === "ACCEPT";
  const labelMap = {
    ACCEPT: "Applying Fix...",
    DISPUTE: "Submitting Dispute...",
    UNDO: "Reverting Fix...",
  };
  const restoreBtn = setButtonLoading(btnEl, labelMap[action] || "Updating...", isAccept);
  try {
    await pauseForVisualFeedback(280);
    const res = await fetch("/api/workflow/creator-action", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        finding_id: findingId,
        action,
        comment: `Creator (${actor.name}) triggered ${action}`,
        actor_name: actor.name,
        actor_role: actor.role,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showStatusMessage(data.detail || "Action blocked.", true);
      return;
    }
    const friendlyMsg = action === "ACCEPT"
      ? `Applied surgical fix for ${findingId}. Working copy updated & hashed to audit log.`
      : (action === "UNDO"
        ? `Reverted surgical fix for ${findingId}. Working copy restored to original draft.`
        : `Disputed ${findingId}. Working copy kept unchanged & escalated to human reviewer.`);
    showStatusMessage(friendlyMsg);
    if (CURRENT_ASSET) await selectSubmission(CURRENT_ASSET.asset_id);
    await loadSubmissionsQueue(CURRENT_ASSET ? CURRENT_ASSET.asset_id : null);
    syncTopChainBadge();
  } catch (err) {
    showStatusMessage(`Error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function handleReviewerFindingDecision(findingId, action, btnEl = null) {
  const actor = getActiveActor();
  const reasonEl = document.getElementById(`waiver-reason-${findingId}`);
  const reasonCode = reasonEl ? reasonEl.value : "FALSE_POSITIVE";
  const restoreBtn = setButtonLoading(
    btnEl,
    action === "WAIVER" ? "Granting Waiver..." : "Overriding Flag...",
    false
  );

  try {
    await pauseForVisualFeedback(280);
    const res = await fetch("/api/workflow/reviewer-decision", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        finding_id: findingId,
        action,
        reason_code: reasonCode,
        comment: `${actor.role} (${actor.name}) recorded ${action} with reason ${reasonCode}`,
        actor_name: actor.name,
        actor_role: actor.role,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showStatusMessage(data.detail || "Reviewer action blocked by RBAC.", true);
      return;
    }
    showStatusMessage(`Reviewer decision ${action} (${reasonCode}) logged to audit chain (Block ${data.audit_block_hash.slice(0, 12)}...).`);
    if (CURRENT_ASSET) await selectSubmission(CURRENT_ASSET.asset_id);
    syncTopChainBadge();
  } catch (err) {
    showStatusMessage(`Error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function submitAssetDecision(decision, btnEl = null) {
  if (!CURRENT_ASSET) return;
  const actor = getActiveActor();
  const labelMap = {
    APPROVE: "Approving Submission...",
    ESCALATE: "Escalating to Legal...",
    REJECT: "Rejecting Submission...",
  };
  const targetBtn = btnEl || document.getElementById(`btn-decision-${decision}`);
  const restoreBtn = setButtonLoading(
    targetBtn,
    labelMap[decision] || "Recording Decision...",
    false
  );
  try {
    await pauseForVisualFeedback(300);
    const res = await fetch("/api/workflow/approve", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        asset_id: CURRENT_ASSET.asset_id,
        decision,
        comment: `Decision ${decision} by ${actor.name} (${actor.role})`,
        actor_name: actor.name,
        actor_role: actor.role,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showStatusMessage(data.detail || "Approval blocked by Role-Based Access Control.", true);
      return;
    }
    showStatusMessage(`Asset ${CURRENT_ASSET.asset_id} state set to ${data.asset_status} by ${actor.name} (${actor.role}). SHA-256 recorded in audit log.`);
    await loadSubmissionsQueue(CURRENT_ASSET.asset_id);
    syncTopChainBadge();
  } catch (err) {
    showStatusMessage(`Error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

/* ========================================================================= */
/* TAB 2: VISUAL & CONTRAST INSPECTOR (WITH HOVER SYNC & CUSTOM UPLOAD)      */
/* ========================================================================= */
function drawVisualCanvas(highlightedBoxId = null) {
  const canvas = document.getElementById("visual-inspector-canvas");
  if (!canvas || !LAST_VISUAL_DATA || !LAST_VISUAL_IMG) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(LAST_VISUAL_IMG, 0, 0, canvas.width, canvas.height);

  for (const box of LAST_VISUAL_DATA.text_boxes || []) {
    const b = box.bbox;
    const isHighlighted = highlightedBoxId && box.box_id === highlightedBoxId;
    ctx.save();
    if (isHighlighted) {
      ctx.shadowColor = "#F7E6CA";
      ctx.shadowBlur = 16;
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = "#F7E6CA";
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(247, 230, 202, 0.16)";
      ctx.fillRect(b.x, b.y, b.width, b.height);
    } else {
      ctx.lineWidth = 3;
      if (box.wcag_aa_pass) {
        ctx.strokeStyle = "#16a34a";
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = "#dc2626";
        ctx.setLineDash([6, 4]);
      }
    }
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = isHighlighted ? "#E8D59E" : (box.wcag_aa_pass ? "#166534" : "#991b1b");
    ctx.fillRect(b.x, Math.max(0, b.y - 20), 215, 20);
    ctx.fillStyle = isHighlighted ? "#1A1A1A" : "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(
      `${box.box_id}: ${box.contrast_ratio}:1 (${box.wcag_aa_pass ? "PASS" : "FAIL <4.5:1"})`,
      b.x + 5,
      Math.max(14, b.y - 6)
    );
    ctx.restore();
  }
}

function highlightOcrBox(boxId) {
  drawVisualCanvas(boxId);
}

function renderVisualAuditResults(data) {
  LAST_VISUAL_DATA = data;
  const rawLabel = String(data.banner_label || "Banner Canvas & OCR Inspection");
  const cleanLabel = rawLabel.includes("Non-Compliant")
    ? "Non-Compliant Draft Banner (Visual Defects Detected)"
    : rawLabel.includes("Compliant")
    ? "Compliant Brand Banner (All Invariants Passed)"
    : rawLabel;
  document.getElementById("visual-banner-title").textContent = cleanLabel;

  if (data.preview_data_url) {
    const img = new Image();
    img.onload = function () {
      LAST_VISUAL_IMG = img;
      drawVisualCanvas(null);
    };
    img.src = data.preview_data_url;
  }

  let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;"><span style="font-family:var(--font-header);font-size:0.92rem;font-weight:500;color:var(--text-primary);">Overall Visual Audit Verdict:</span> ${getTierBadgeHtml(data.overall_pass ? "PASS" : "VIOLATION")}</div>`;
  html += `<h4 style="margin:10px 0 6px 0;color:var(--text-primary);font-family:var(--font-header);font-size:0.94rem;">1. Dominant Colour Swatches <span class="dev-only-el">(CIEDE2000 &Delta;E<sub>00</sub> &le; 2.5)</span></h4>`;
  html += `<table class="data-table"><thead><tr><th>Swatch</th><th>Area</th><th>Nearest Brand Colour</th><th class="dev-only-el">&Delta;E<sub>00</sub></th><th>Status</th></tr></thead><tbody>`;
  for (const s of data.dominant_swatches || []) {
    html += `<tr>
      <td style="white-space:nowrap;"><span style="display:inline-block;width:14px;height:14px;background:${escapeHtml(s.tested_hex)};border:1px solid #444856;border-radius:3px;vertical-align:middle;margin-right:6px;"></span><span class="hex-code-chip">${escapeHtml(s.tested_hex)}</span></td>
      <td>${s.pixel_share}%</td>
      <td>${escapeHtml(s.nearest_name)} <span class="hex-bracket-wrap">(<span class="hex-code-chip">${escapeHtml(s.nearest_hex)}</span>)</span></td>
      <td class="dev-only-el"><strong>${s.delta_e00}</strong></td>
      <td style="white-space:nowrap;" title="CIEDE2000 distance = ${s.delta_e00}">${s.within_tolerance ? '<span class="tier-badge tier-pass">Within Tolerance (&le; 2.5)</span>' : '<span class="tier-badge tier-violation">Off-Palette (&gt; 2.5)</span>'}</td>
    </tr>`;
  }
  html += `</tbody></table>`;

  html += `<h4 style="margin:14px 0 6px 0;color:var(--text-primary);font-family:var(--font-header);font-size:0.94rem;">2. WCAG 2.1 Contrast Under OCR Text Boxes (&ge; 4.5:1)</h4>`;
  html += `<table class="data-table"><thead><tr><th>OCR Box</th><th>Foreground Ink</th><th>Background Fill</th><th>Measured Ratio</th><th>WCAG 2.1 AA</th></tr></thead><tbody>`;
  for (const b of data.text_boxes || []) {
    html += `<tr class="ocr-table-row" onmouseenter="highlightOcrBox('${escapeHtml(b.box_id)}')" onmouseleave="highlightOcrBox(null)">
      <td><strong>${escapeHtml(b.box_id)}</strong></td>
      <td><span style="display:inline-block;width:11px;height:11px;background:${escapeHtml(b.foreground_hex)};border:1px solid #444856;border-radius:2px;vertical-align:middle;margin-right:5px;"></span><span class="hex-code-chip">${escapeHtml(b.foreground_hex)}</span></td>
      <td><span style="display:inline-block;width:11px;height:11px;background:${escapeHtml(b.background_hex)};border:1px solid #444856;border-radius:2px;vertical-align:middle;margin-right:5px;"></span><span class="hex-code-chip">${escapeHtml(b.background_hex)}</span></td>
      <td><strong>${b.contrast_ratio}:1</strong></td>
      <td style="white-space:nowrap;">${b.wcag_aa_pass ? '<span class="tier-badge tier-pass">AA Pass (&ge; 4.5:1)</span>' : '<span class="tier-badge tier-violation">AA Fail (&lt; 4.5:1)</span>'}</td>
    </tr>`;
  }
  html += `</tbody></table>`;

  const lc = data.logo_check || {};
  html += `<h4 style="margin:14px 0 6px 0;color:var(--text-primary);font-family:var(--font-header);font-size:0.94rem;">3. Wordmark Aspect Ratio Check <span class="dev-only-el">[VIS-02]</span></h4>`;
  html += `<div class="diff-box">Measured Ratio: <strong>${lc.measured_ratio}:1</strong> (Expected: ${lc.expected_ratio}:1 &plusmn;5%) &mdash; ${lc.pass ? '<span class="tier-badge tier-pass">Valid Proportions</span>' : '<span class="tier-badge tier-violation">Stretched / Distorted</span>'}</div>`;

  document.getElementById("visual-audit-results").innerHTML = html;
  scheduleWorkflowConnectors();
}

async function runVisualAuditDemo(mode, btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Inspecting Banner...", false);
  const resBox = document.getElementById("visual-audit-results");
  if (resBox) resBox.innerHTML = renderAreaLoader("Measuring CIEDE2000 colour distances & OCR WCAG 2.1 contrast...");
  try {
    if (btnEl) await pauseForVisualFeedback(240);
    const res = await fetch("/api/submissions/visual-audit", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({mode}),
    });
    const data = await res.json();
    renderVisualAuditResults(data);
  } catch (err) {
    console.error("Visual audit error:", err);
  } finally {
    restoreBtn();
  }
}

async function uploadCustomBannerImage() {
  const fileInput = document.getElementById("custom-banner-input");
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
  const file = fileInput.files[0];
  const labelEl = document.getElementById("custom-banner-upload-label");
  const origLabel = labelEl ? labelEl.innerHTML : "Upload Custom Banner (.png/.jpg)";
  if (labelEl) {
    labelEl.innerHTML = `<span class="spinner-inline-light"></span> Auditing Image...`;
  }
  const resBox = document.getElementById("visual-audit-results");
  if (resBox) resBox.innerHTML = renderAreaLoader(`Auditing ${file.name} with CIEDE2000 & WCAG 2.1 contrast math...`);

  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/submissions/visual-audit", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        mode: "custom_upload",
        filename: file.name,
        image_base64: dataUrl,
      }),
    });
    const data = await res.json();
    renderVisualAuditResults(data);
    showStatusMessage(`Audited custom banner "${file.name}": Overall Verdict = ${data.overall_pass ? "PASS" : "VIOLATION"}.`);
  } catch (err) {
    showStatusMessage(`Custom banner audit error: ${err.message}`, true);
  } finally {
    if (labelEl) labelEl.innerHTML = origLabel;
    fileInput.value = "";
  }
}

/* ========================================================================= */
/* TAB 3: GUIDELINE LAB, LINTER (GROUPED BY RULE) & POLICY REPLAY            */
/* ========================================================================= */
async function loadGuidelinesRules() {
  try {
    const res = await fetch("/api/guidelines/rules");
    const data = await res.json();
    const box = document.getElementById("compiled-rules-table-box");
    if (!box) return;
    let html = '<table class="data-table"><thead><tr><th>Rule ID</th><th>Modality</th><th class="dev-only-el">Check Type</th><th>Clause &amp; Specification</th></tr></thead><tbody>';
    for (const r of data.rules || []) {
      html += `<tr>
        <td style="white-space:nowrap;"><strong>${escapeHtml(r.rule_id)}</strong><br/><span style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(r.severity)}</span></td>
        <td style="white-space:nowrap;"><span class="modality-chip">${escapeHtml(r.modality)}</span></td>
        <td class="dev-only-el"><span style="color:var(--text-secondary);">${escapeHtml(r.check_type)}</span></td>
        <td><strong>${escapeHtml(r.source_clause)}</strong><br/><span style="color:var(--text-secondary);">${escapeHtml(r.description)}</span></td>
      </tr>`;
    }
    html += "</tbody></table>";
    box.innerHTML = html;
    scheduleWorkflowConnectors();
  } catch (err) {
    console.error("Error loading rules:", err);
  }
}

function loadRuleIntoReplaySimulator(ruleId, suggestedTerms = "synergy, hyper-growth, rockstar, ninja") {
  const rInput = document.getElementById("replay-rule-id");
  const tInput = document.getElementById("replay-terms");
  if (rInput) rInput.value = ruleId;
  if (tInput) tInput.value = suggestedTerms;
  const replayCard = document.getElementById("policy-replay-card");
  if (replayCard) {
    replayCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const btn = document.getElementById("btn-run-policy-replay");
  executePolicyReplay(btn);
}

async function runGuidelineLinter(includeSeeded = true, btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Scanning Rules...", true);
  const box = document.getElementById("linter-results-box");
  if (box) box.innerHTML = renderAreaLoader("Scanning Brand-AST rules for contradictions & vague buzzwords...");
  try {
    if (btnEl) await pauseForVisualFeedback(240);
    const res = await fetch("/api/guidelines/lint", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({include_seeded_defects: includeSeeded}),
    });
    const data = await res.json();
    if (!box) return;

    // Group defects by rule_id so DEFECT-VAGUE-01 appears as a single consolidated card
    const groupedMap = new Map();
    for (const d of data.defects || []) {
      if (!groupedMap.has(d.rule_id)) {
        groupedMap.set(d.rule_id, {
          rule_id: d.rule_id,
          defect_types: [],
          explanations: [],
          remediations: [],
        });
      }
      const g = groupedMap.get(d.rule_id);
      if (!g.defect_types.includes(d.defect_type)) g.defect_types.push(d.defect_type);
      if (!g.explanations.includes(d.explanation)) g.explanations.push(d.explanation);
      if (!g.remediations.includes(d.remediation)) g.remediations.push(d.remediation);
    }

    let html = `<div style="margin-bottom:12px;color:var(--accent-cream);">
      Scanned <strong>${data.total_rules_scanned}</strong> rules &bull; Seeded Defects Caught: <strong>${data.seeded_defects_detected}/${data.seeded_defects_total}</strong> (${(data.seeded_detection_rate * 100).toFixed(0)}% &ge; 90% H5 Target)
    </div>`;

    for (const g of groupedMap.values()) {
      const badgesHtml = g.defect_types.map((dt) => formatDefectTypeBadge(dt)).join(" ");
      html += `<div class="finding-card card-violation" style="padding:14px 16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong>Rule: ${escapeHtml(g.rule_id)}</strong>
            ${badgesHtml}
          </div>
          <button type="button" class="btn btn-outline btn-sm" style="padding:3px 10px;font-size:0.75rem;" onclick="loadRuleIntoReplaySimulator('${escapeHtml(g.rule_id.includes("OVERLAP") ? "TERM-01" : "TONE-01")}')">
            Simulate Fix in Replay &rarr;
          </button>
        </div>
        <p style="margin:6px 0;color:var(--text-secondary);font-size:0.9rem;">${g.explanations.map((e) => escapeHtml(e)).join(" &bull; ")}</p>
        <div class="recommended-ast-fix"><strong>Recommended AST Fix:</strong> ${escapeHtml(g.remediations[0] || "")}</div>
      </div>`;
    }
    box.innerHTML = html;
    scheduleWorkflowConnectors();
  } catch (err) {
    console.error("Linter error:", err);
  } finally {
    restoreBtn();
  }
}

async function executePolicyReplay(btnEl = null) {
  const ruleInput = document.getElementById("replay-rule-id");
  const termsInput = document.getElementById("replay-terms");
  const ruleId = ruleInput ? ruleInput.value.trim() : "";
  const termsRaw = termsInput ? termsInput.value : "";
  const terms = termsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  if (!ruleId) {
    showStatusMessage("Please enter a Rule ID to replay (e.g. TERM-01).", true);
    if (ruleInput) ruleInput.focus();
    return;
  }
  if (terms.length === 0) {
    showStatusMessage("Please enter at least one proposed forbidden term.", true);
    if (termsInput) termsInput.focus();
    return;
  }

  const restoreBtn = setButtonLoading(btnEl, "Simulating Replay...", true);
  const box = document.getElementById("policy-replay-results");
  if (box) box.innerHTML = renderAreaLoader("Replaying proposed policy across 18 benchmark pieces...");

  try {
    if (btnEl) await pauseForVisualFeedback(240);
    const res = await fetch("/api/guidelines/replay", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        rule_id: ruleId,
        proposed_modality: "FORBIDDEN",
        proposed_severity: "Violation",
        proposed_patterns: {forbidden_terms: terms},
      }),
    });
    const data = await res.json();
    if (!box) return;

    let html = `<div class="diff-box" style="margin-bottom:10px;">
      Replayed <strong>${escapeHtml(data.rule_id)}</strong> across <strong>${data.corpus_size}</strong> golden pieces:
      <strong>${data.total_verdict_changes}</strong> piece(s) changed verdict
      (${data.newly_flagged_count} newly flagged, ${data.newly_cleared_count} newly cleared).
    </div>`;
    if ((data.changed_pieces || []).length > 0) {
      html += '<table class="data-table"><thead><tr><th>Piece</th><th>Verdict Change</th><th>Matched Span</th><th>Snippet</th></tr></thead><tbody>';
      for (const ch of data.changed_pieces) {
        html += `<tr>
          <td style="white-space:nowrap;"><strong>${escapeHtml(ch.piece_id)}</strong></td>
          <td style="white-space:nowrap;"><span class="tier-badge tier-advisory">${escapeHtml(ch.direction)}</span></td>
          <td><code>${escapeHtml((ch.matched_spans || []).join(", "))}</code></td>
          <td><span style="color:var(--text-secondary);">${escapeHtml(ch.snippet)}</span></td>
        </tr>`;
      }
      html += "</tbody></table>";
    }
    box.innerHTML = html;
  } catch (err) {
    console.error("Replay error:", err);
  } finally {
    restoreBtn();
  }
}

/* ========================================================================= */
/* TAB 4: FACT VAULT (WITH FILTER BAR, STRIKETHROUGH & BRAND ADMIN CRUD)     */
/* ========================================================================= */
function setFactFilter(filterKey) {
  FACT_FILTER = filterKey;
  renderFactVaultView();
}

function toggleAddFactDrawer() {
  const actor = getActiveActor();
  const drawer = document.getElementById("add-fact-drawer");
  if (!drawer) return;
  if (actor.role !== "Brand Admin" && drawer.classList.contains("hidden")) {
    showStatusMessage("Role Lock: Switching to 'Brand Admin' role so you can register a new approved fact.");
    switchToRole("Brand Admin");
  }
  drawer.classList.toggle("hidden");
}

function renderFactVaultView() {
  const box = document.getElementById("fact-vault-table-box");
  const filterBar = document.getElementById("fact-filter-bar");
  if (!box || !ALL_FACTS_DATA) return;

  const allRawFacts = ALL_FACTS_DATA.facts || [];
  // Sample reference baseline: 2 Active Facts and 2 Expired Facts (+ any user-added facts)
  const activeSamples = allRawFacts.filter((f) => f.status === "ACTIVE").slice(0, 2);
  const expiredSamples = allRawFacts.filter((f) => f.status === "EXPIRED").slice(0, 2);
  const sampleFactIds = new Set([...activeSamples.map((f) => f.fact_id), ...expiredSamples.map((f) => f.fact_id)]);

  // Keep only the curated 1-2 sample reference facts per status, plus any custom-added facts
  const facts = allRawFacts.filter(
    (f) => sampleFactIds.has(f.fact_id) || f.source === "Brand Admin Governance Entry" || f.is_custom
  );

  const activeCount = facts.filter((f) => f.status === "ACTIVE").length;
  const expiredCount = facts.filter((f) => f.status === "EXPIRED").length;

  if (filterBar) {
    const filters = [
      { key: "all", label: "All Facts", count: facts.length },
      { key: "active", label: "Active Facts", count: activeCount },
      { key: "expired", label: "Expired Facts", count: expiredCount },
    ];
    filterBar.innerHTML = filters
      .map(
        (f) => `<button type="button" class="filter-pill ${FACT_FILTER === f.key ? "active" : ""}" onclick="setFactFilter('${f.key}')">
          <span>${escapeHtml(f.label)}</span>
          <span class="filter-count">${f.count}</span>
        </button>`
      )
      .join("");
  }

  let filtered = facts;
  if (FACT_FILTER === "active") filtered = facts.filter((f) => f.status === "ACTIVE");
  if (FACT_FILTER === "expired") filtered = facts.filter((f) => f.status === "EXPIRED");

  const actor = getActiveActor();
  const isBrandAdmin = actor.role === "Brand Admin";

  let html = `
    <div class="fact-sample-reference-banner" style="margin-bottom: 12px; padding: 10px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="data-chip" style="background: linear-gradient(180deg, #2D313C 0%, #22252E 100%); border: 1px solid #444856; color: #FFFFFF; font-family: var(--font-header); font-size: 0.72rem; font-weight: 500;">Sample Reference Baseline</span>
        <span style="font-size: 0.82rem; color: rgba(255, 255, 255, 0.78); font-family: var(--font-header);">
          Displaying <strong>1–2 sample facts per category</strong> (2 Active &middot; 2 Expired) for reference testing.
        </span>
      </div>
      <span style="font-size: 0.76rem; color: var(--text-muted); font-family: var(--font-header);">Click <strong>+ Add Approved Fact</strong> to register custom organizational facts</span>
    </div>
    <table class="data-table"><thead><tr><th>Fact ID</th><th>Status</th><th>Subject &amp; Approved Claim</th><th>Modality</th><th>Validity Window</th><th>Source &amp; Owner</th><th style="text-align:right;">Governance</th></tr></thead><tbody>
  `;

  for (const f of filtered) {
    const isExpired = f.status === "EXPIRED";
    const isSample = sampleFactIds.has(f.fact_id);
    const badge = !isExpired
      ? '<span class="tier-badge tier-pass">Active Fact</span>'
      : '<span class="tier-badge tier-violation">Expired Fact</span>';

    const sampleChip = isSample
      ? '<span class="data-chip" style="font-size:0.68rem;padding:1px 6px;margin-left:6px;opacity:0.85;font-family:var(--font-header);">Sample Reference</span>'
      : '<span class="data-chip" style="font-size:0.68rem;padding:1px 6px;margin-left:6px;color:#85E3B3;border-color:rgba(133,227,179,0.3);font-family:var(--font-header);">Custom Fact</span>';

    const actionBtn = isBrandAdmin
      ? `<button type="button" class="btn ${isExpired ? "btn-outline" : "btn-ghost-danger"} btn-sm" onclick="toggleFactStatus('${escapeHtml(f.fact_id)}', this)">
           ${isExpired ? "Reactivate" : "Expire Fact"}
         </button>`
      : `<button type="button" class="btn btn-ghost btn-sm" title="Click to switch to Brand Admin role" onclick="switchToRole('Brand Admin')">
           &#128274; Brand Admin Only
         </button>`;

    html += `<tr class="${isExpired ? "row-expired-fact" : ""}">
      <td style="white-space:nowrap;"><strong>${escapeHtml(f.fact_id)}</strong>${sampleChip}</td>
      <td style="white-space:nowrap;">${badge}</td>
      <td style="min-width:270px;max-width:440px;word-break:normal;overflow-wrap:break-word;">
        <strong style="color:#FFFFFF;">${escapeHtml(f.subject)}: <span class="${isExpired ? "expired-claim-strike" : ""}">${escapeHtml(f.metric)}</span></strong><br/>
        <span style="font-size:0.85rem;color:var(--text-secondary);line-height:1.45;display:inline-block;margin-top:3px;">${escapeHtml(f.statement)}</span>
      </td>
      <td style="white-space:nowrap;"><span class="modality-chip">${escapeHtml(f.modality)}</span></td>
      <td style="white-space:nowrap;"><span class="data-chip">${escapeHtml(f.valid_from)}</span> <span style="color:var(--text-muted);margin:0 3px;">&rarr;</span> <span class="data-chip">${escapeHtml(f.valid_until)}</span></td>
      <td><strong>${escapeHtml(f.source)}</strong><br/><span style="font-size:0.82rem;color:var(--text-muted);">${escapeHtml(f.owner)}</span></td>
      <td style="text-align:right;white-space:nowrap;">${actionBtn}</td>
    </tr>`;
  }
  html += "</tbody></table>";
  box.innerHTML = html;
}

async function loadFactVault() {
  const box = document.getElementById("fact-vault-table-box");
  if (box && !ALL_FACTS_DATA) box.innerHTML = renderAreaLoader("Loading Time-Bounded Fact Vault...");
  try {
    const res = await fetch("/api/facts");
    ALL_FACTS_DATA = await res.json();
    renderFactVaultView();
  } catch (err) {
    console.error("Error loading facts:", err);
  }
}

async function toggleFactStatus(factId, btnEl = null) {
  const actor = getActiveActor();
  const restoreBtn = setButtonLoading(btnEl, "Updating...", false);
  try {
    await pauseForVisualFeedback(220);
    const res = await fetch(`/api/facts/${encodeURIComponent(factId)}/toggle-status`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        actor_name: actor.name,
        actor_role: actor.role,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showStatusMessage(data.detail || "Fact Vault update blocked by RBAC.", true);
      return;
    }
    showStatusMessage(`Fact ${factId} status set to ${data.new_status} (valid_until: ${data.valid_until}). Chained to SHA-256 audit log.`);
    await loadFactVault();
    syncTopChainBadge();
  } catch (err) {
    showStatusMessage(`Error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function submitNewFact(btnEl = null) {
  const actor = getActiveActor();
  const factId = document.getElementById("new-fact-id").value.trim();
  const subject = document.getElementById("new-fact-subject").value.trim();
  const metric = document.getElementById("new-fact-metric").value.trim();
  const modality = document.getElementById("new-fact-modality").value;
  const statement = document.getElementById("new-fact-statement").value.trim();
  const validFrom = document.getElementById("new-fact-from").value.trim();
  const validUntil = document.getElementById("new-fact-until").value.trim();

  if (!factId || !subject || !metric || !statement || !validFrom || !validUntil) {
    showStatusMessage("Please fill in Fact ID, Subject, Approved Metric, Statement, Valid From, and Valid Until.", true);
    return;
  }

  const restoreBtn = setButtonLoading(btnEl, "Saving Fact...", true);
  try {
    await pauseForVisualFeedback(240);
    const res = await fetch("/api/facts", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        fact_id: factId,
        tenant: "northwind_academy",
        category: "outcomes",
        subject,
        predicate: "achieved",
        metric,
        modality,
        statement,
        owner: actor.name,
        source: "Brand Admin Governance Entry",
        valid_from: validFrom,
        valid_until: validUntil,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showStatusMessage(data.detail || "Failed to save fact.", true);
      return;
    }
    document.getElementById("add-fact-drawer").classList.add("hidden");
    showStatusMessage(`Added approved fact ${data.fact_id} to Fact Vault (Audit Block ${data.audit_block_hash.slice(0, 12)}...).`);
    await loadFactVault();
    syncTopChainBadge();
  } catch (err) {
    showStatusMessage(`Error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

/* ========================================================================= */
/* TAB 5: INSIGHTS, ROR & HYPOTHESES H1–H7                                   */
/* ========================================================================= */
function openRuleInGuidelineLab(ruleId) {
  switchTab("guidelines");
  setTimeout(() => {
    loadRuleIntoReplaySimulator(ruleId, "crush, dominate, #1, guaranteed");
  }, 150);
}

async function loadInsightsAndTelemetry(btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Refreshing...", false);
  try {
    if (btnEl) await pauseForVisualFeedback(240);
    const res = await fetch("/api/insights/telemetry");
    const data = await res.json();

    const hBox = document.getElementById("hypotheses-table-box");
    if (hBox) {
      let hHtml = '<table class="data-table"><thead><tr><th>ID</th><th>Hypothesis (Section 7.4)</th><th>Target</th><th>Measured Round 2 Result</th><th>Status</th></tr></thead><tbody>';
      for (const h of data.hypotheses || []) {
        hHtml += `<tr>
          <td style="white-space:nowrap;"><strong>${escapeHtml(h.id)}</strong></td>
          <td>${escapeHtml(h.hypothesis)}</td>
          <td style="white-space:nowrap;"><span class="data-chip">${escapeHtml(h.target)}</span></td>
          <td><strong>${escapeHtml(h.measured)}</strong></td>
          <td style="white-space:nowrap;"><span class="tier-badge tier-pass">${escapeHtml(h.status)}</span></td>
        </tr>`;
      }
      hHtml += "</tbody></table>";
      hBox.innerHTML = hHtml;
    }

    const rBox = document.getElementById("ror-telemetry-table-box");
    if (rBox && data.ror_report) {
      let rHtml = '<table class="data-table"><thead><tr><th>Rule ID</th><th>Total Flags</th><th>Overridden / Dismissed</th><th>ROR</th><th>Diagnostic Classification</th><th>Actionable Recommendation</th></tr></thead><tbody>';
      for (const r of data.ror_report.rules_telemetry || []) {
        if (r.total_flags === 0) continue;
        let diagBadge = '<span class="tier-badge tier-pass">Healthy Rule</span>';
        let recHtml = `<span style="color:var(--text-secondary);">${escapeHtml(r.recommendation)}</span>`;

        if (r.diagnostic_status === "UNCLEAR_GUIDELINE_CANDIDATE") {
          diagBadge = '<span class="tier-badge tier-violation">Unclear Rule (&gt; 45% ROR)</span>';
          recHtml = `
            <div style="color:var(--text-secondary);margin-bottom:6px;">${escapeHtml(r.recommendation)}</div>
            <button type="button" class="btn btn-primary btn-sm" style="padding:4px 11px;font-size:0.75rem;" onclick="openRuleInGuidelineLab('${escapeHtml(r.rule_id)}')">
              Open ${escapeHtml(r.rule_id)} in Guideline Lab &rarr;
            </button>
          `;
        } else if (r.diagnostic_status === "CREATOR_TRAINING_GAP") {
          diagBadge = '<span class="tier-badge tier-pass" title="0% Reviewer Override: Rule is 100% accurate; recurring flags indicate creators need pre-flight templates">Healthy Rule &bull; Pre-Flight Gap (0% Override)</span>';
          recHtml = `<span style="color:var(--text-secondary);"><strong>Rule is 100% accurate</strong> (0% reviewer override across ${r.total_flags} flags). Recurring initial violations indicate an opportunity for creator pre-flight templates.</span>`;
        }
        rHtml += `<tr>
          <td style="white-space:nowrap;"><strong>${escapeHtml(r.rule_id)}</strong><br/><span style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(r.source_clause)}</span></td>
          <td>${r.total_flags}</td>
          <td>${r.dismissed_or_overridden}</td>
          <td><strong>${(r.ror * 100).toFixed(1)}%</strong></td>
          <td style="white-space:nowrap;">${diagBadge}</td>
          <td>${recHtml}</td>
        </tr>`;
      }
      rHtml += "</tbody></table>";
      rBox.innerHTML = rHtml;
    }
    scheduleWorkflowConnectors();
  } catch (err) {
    console.error("Error loading insights:", err);
  } finally {
    restoreBtn();
  }
}

/* ========================================================================= */
/* TAB 6: SHA-256 HASH-CHAINED AUDIT LEDGER (WITH TAMPER SIMULATION DEMO)    */
/* ========================================================================= */
async function loadAuditLedger(btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Verifying Chain...", true);
  const evBox = document.getElementById("audit-events-table-box");
  if (evBox && btnEl) evBox.innerHTML = renderAreaLoader("Verifying cryptographic SHA-256 hash chain...");
  try {
    if (btnEl) await pauseForVisualFeedback(240);
    const res = await fetch("/api/insights/audit-log");
    const data = await res.json();
    const cv = data.chain_verification || {};

    // Toggle Simulate Tamper vs Restore buttons
    const btnTamper = document.getElementById("btn-simulate-tamper");
    const btnRestore = document.getElementById("btn-restore-chain");
    if (btnTamper && btnRestore) {
      if (cv.valid) {
        btnTamper.classList.remove("hidden");
        btnRestore.classList.add("hidden");
      } else {
        btnTamper.classList.add("hidden");
        btnRestore.classList.remove("hidden");
      }
    }

    // Update top navbar chain badge as well
    updateTopChainBadge(Boolean(cv.valid), cv.total_events);

    const brokenId = cv.broken_at_id || (cv.broken_links && cv.broken_links.length > 0 ? cv.broken_links[0].id : null);
    const brokenInfo = (cv.broken_links && cv.broken_links.length > 0) ? cv.broken_links[0] : null;
    const sumBox = document.getElementById("audit-chain-summary-box");
    if (sumBox) {
      if (cv.valid) {
        sumBox.innerHTML = `<div class="audit-chain-status-banner">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="audit-chain-header-text">Cryptographic Hash-Chain Status:</span>
            <span class="audit-intact-badge"><span class="check-icon">&#10003;</span> 100% INTACT &amp; TAMPER-FREE</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-family:var(--font-header);font-size:0.84rem;color:#E2E8F0;">Total Chained Events: <strong style="color:#FFFFFF;">${cv.total_events}</strong></span>
            <span class="data-chip" title="Latest Block Hash: ${escapeHtml(cv.latest_hash || "")}">Head SHA-256: ${escapeHtml((cv.latest_hash || "").slice(0, 16))}...</span>
          </div>
        </div>`;
      } else {
        const hashMismatchText = brokenInfo
          ? `Expected SHA-256 ${brokenInfo.actual_hash.slice(0, 12)}... != Recomputed ${brokenInfo.expected_hash.slice(0, 12)}...`
          : "Payload hash mismatch";
        sumBox.innerHTML = `<div class="diff-box" style="border:1px solid #731A25;background:linear-gradient(180deg, rgba(58, 18, 24, 0.72) 0%, rgba(36, 12, 16, 0.88) 100%);border-radius:9px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:14px 18px;">
          <div>
            <strong style="color:#FECACA;font-family:var(--font-header);">&#9888; CRYPTOGRAPHIC TAMPERING DETECTED:</strong>
            <span style="color:#F1F5F9;font-weight:500;margin-left:6px;">Block #${escapeHtml(brokenId)} failed SHA-256 verification (${escapeHtml(hashMismatchText)})!</span>
          </div>
          <button type="button" class="btn btn-banner-preset" onclick="restoreTamperedChain(this)">Restore Intact Chain Now</button>
        </div>`;
      }
    }

    if (evBox) {
      let html = '<table class="data-table"><thead><tr><th>#</th><th>Timestamp (UTC)</th><th>Actor &amp; Role</th><th>Governance Event &amp; Target</th><th>Cryptographic Hash Chain</th></tr></thead><tbody>';
      for (const e of data.events || []) {
        const dObj = e.details || {};
        const isBrokenRow = !cv.valid && brokenId === e.id;
        
        const cleanDetails = [];
        if (dObj.overall_verdict) cleanDetails.push(`Verdict: ${dObj.overall_verdict}`);
        if (dObj.assigned_role) cleanDetails.push(`Assigned: ${dObj.assigned_role}`);
        if (dObj.channel) cleanDetails.push(`Channel: ${dObj.channel}`);
        if (dObj.findings_count !== undefined) cleanDetails.push(`Findings: ${dObj.findings_count}`);
        if (dObj.decision) cleanDetails.push(`Decision: ${dObj.decision}`);
        if (dObj.actor_role) cleanDetails.push(`Role: ${dObj.actor_role}`);
        if (dObj.rule_id) cleanDetails.push(`Rule: ${dObj.rule_id}`);
        if (dObj.fact_id) cleanDetails.push(`Fact: ${dObj.fact_id}`);
        if (dObj.subject) cleanDetails.push(`Subject: ${dObj.subject}`);
        if (dObj.new_status) cleanDetails.push(`Status: ${dObj.new_status}`);
        if (cleanDetails.length === 0) {
          for (const [k, v] of Object.entries(dObj).slice(0, 3)) {
            if (k.includes("hash") || k.includes("sha")) continue;
            cleanDetails.push(`${k}: ${v}`);
          }
        }
        const detailsHtml = cleanDetails
          .map((item) => `<span class="data-chip" style="font-size:0.72rem;padding:1px 6px;margin:2px 3px 2px 0;">${escapeHtml(item)}</span>`)
          .join(" ");

        html += `<tr class="${isBrokenRow ? "row-tampered-block" : ""}">
          <td style="white-space:nowrap;"><strong>#${e.id}</strong> ${isBrokenRow ? '<span class="tier-badge tier-violation">CORRUPTED</span>' : ""}</td>
          <td style="white-space:nowrap;"><span class="data-chip">${escapeHtml(e.timestamp.slice(0, 19))}Z</span></td>
          <td style="white-space:nowrap;"><strong>${escapeHtml(e.actor_name)}</strong><br/><span style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(e.actor_role)}</span></td>
          <td style="word-break:normal;min-width:240px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
              ${formatAuditEventBadge(e.event_type)}
              <span style="font-size:0.82rem;color:var(--text-muted);">on</span>
              <span class="data-chip">${escapeHtml(e.target_id)}</span>
            </div>
            <div style="margin-top:4px;">${detailsHtml}</div>
          </td>
          <td class="hash-cell-wrap">
            <div class="simple-only-el">
              <span class="hash-copy-chip" title="Full SHA-256: ${escapeHtml(e.block_hash)}">
                <span>${escapeHtml(e.block_hash.slice(0, 12))}...</span>
                <button type="button" class="btn-copy-hash" title="Copy full SHA-256 hash" onclick="copyHashToClipboard('${escapeHtml(e.block_hash)}', this)">&#128203;</button>
              </span>
            </div>
            <div class="dev-only-el">
              <div style="font-size:0.73rem;color:var(--text-muted);margin-bottom:3px;" title="Prev: ${escapeHtml(e.prev_hash)}">Prev: <code>${escapeHtml(e.prev_hash.slice(0, 12))}...</code></div>
              <span class="hash-copy-chip" title="Full Block SHA-256: ${escapeHtml(e.block_hash)}">
                <span>Block: ${escapeHtml(e.block_hash.slice(0, 12))}...</span>
                <button type="button" class="btn-copy-hash" title="Copy full SHA-256 hash" onclick="copyHashToClipboard('${escapeHtml(e.block_hash)}', this)">&#128203;</button>
              </span>
            </div>
          </td>
        </tr>`;
      }
      html += "</tbody></table>";
      evBox.innerHTML = html;
    }
  } catch (err) {
    console.error("Error loading audit log:", err);
  } finally {
    restoreBtn();
  }
}

function copyHashToClipboard(fullHash, btnEl) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(fullHash);
  }
  if (btnEl) {
    const orig = btnEl.innerHTML;
    btnEl.innerHTML = "&#10003;";
    btnEl.style.color = "#86efac";
    setTimeout(() => {
      btnEl.innerHTML = orig;
      btnEl.style.color = "";
    }, 1200);
  }
  showStatusMessage(`Copied full 64-char SHA-256 hash to clipboard: ${fullHash.slice(0, 20)}...`);
}

async function triggerTamperSimulation(btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Injecting Tamper...", false);
  try {
    await pauseForVisualFeedback(260);
    const res = await fetch("/api/insights/simulate-tamper", { method: "POST" });
    const data = await res.json();
    showStatusMessage(`Simulated unauthorized DB edit on Audit Block #${data.tampered_event_id}. SHA-256 hash chain immediately detected the mismatch!`, true);
    await loadAuditLedger();
  } catch (err) {
    showStatusMessage(`Tamper simulation error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function restoreTamperedChain(btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Restoring Chain...", false);
  try {
    await pauseForVisualFeedback(240);
    await fetch("/api/insights/restore-chain", { method: "POST" });
    showStatusMessage("Restored original cryptographic payload. SHA-256 hash chain is 100% intact.");
    await loadAuditLedger();
  } catch (err) {
    showStatusMessage(`Restore error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

function initScrollAwareHeader() {
  const header = document.querySelector(".top-header");
  if (!header || header._hideWatcherAttached) return;
  header._hideWatcherAttached = true;

  let ticking = false;

  const syncHeaderOnScroll = () => {
    ticking = false;
    const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    header.classList.remove("header-hidden");
    if (scrollY > 16) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
      header.classList.remove("header-revealed");
    }
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(syncHeaderOnScroll);
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      if (scrollY <= 16) return;
      if (e.clientY <= 36) {
        header.classList.add("header-revealed");
      } else if (e.clientY > 88 && !header.contains(document.activeElement)) {
        header.classList.remove("header-revealed");
      }
    },
    { passive: true }
  );

  header.addEventListener("focusin", () => {
    header.classList.add("header-revealed");
  });

  syncHeaderOnScroll();
}

/* ========================================================================= */
/* SLEEK GLASSMORPHIC BLURRED SEMI-CURVED DROPDOWN ENHANCER                  */
/* ========================================================================= */
const GLASS_SELECT_VALUE_DESC = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
let ACTIVE_GLASS_SELECT = null;
let GLASS_SELECT_GLOBAL_BOUND = false;

function closeActiveGlassMenu(options = {}) {
  if (!ACTIVE_GLASS_SELECT) return;
  const { menu, trigger, heroPill } = ACTIVE_GLASS_SELECT;
  if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
  trigger.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
  if (heroPill) heroPill.classList.remove("is-open");
  ACTIVE_GLASS_SELECT = null;
  if (options.restoreFocus && typeof trigger.focus === "function") {
    trigger.focus();
  }
}

function bindGlassSelectGlobals() {
  if (GLASS_SELECT_GLOBAL_BOUND) return;
  GLASS_SELECT_GLOBAL_BOUND = true;

  document.addEventListener("pointerdown", (e) => {
    if (!ACTIVE_GLASS_SELECT) return;
    if (
      ACTIVE_GLASS_SELECT.menu.contains(e.target) ||
      ACTIVE_GLASS_SELECT.anchorEl.contains(e.target)
    ) {
      return;
    }
    closeActiveGlassMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (!ACTIVE_GLASS_SELECT) return;
    const { menu, optionBtns } = ACTIVE_GLASS_SELECT;
    const enabled = optionBtns.filter((btn) => !btn.disabled);
    if (!enabled.length) return;

    const currentIdx = enabled.findIndex((btn) => btn.classList.contains("is-active"));
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      closeActiveGlassMenu({ restoreFocus: true });
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const nextIdx = currentIdx === -1
        ? (delta > 0 ? 0 : enabled.length - 1)
        : (currentIdx + delta + enabled.length) % enabled.length;
      enabled.forEach((b) => b.classList.remove("is-active"));
      enabled[nextIdx].classList.add("is-active");
      enabled[nextIdx].scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const targetBtn = e.key === "Home" ? enabled[0] : enabled[enabled.length - 1];
      enabled.forEach((b) => b.classList.remove("is-active"));
      targetBtn.classList.add("is-active");
      targetBtn.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const activeBtn = enabled[currentIdx] || menu.querySelector(".glass-select-option.is-selected");
      if (activeBtn) activeBtn.click();
    }
  });

  window.addEventListener(
    "scroll",
    (e) => {
      if (!ACTIVE_GLASS_SELECT) return;
      if (e.target === ACTIVE_GLASS_SELECT.menu) return;
      closeActiveGlassMenu();
    },
    true
  );

  window.addEventListener("resize", () => {
    if (ACTIVE_GLASS_SELECT) closeActiveGlassMenu();
  });
}

function positionGlassMenu(menu, anchorEl, minWidthPx) {
  const rect = anchorEl.getBoundingClientRect();
  const width = Math.max(rect.width, minWidthPx);
  const gap = 6;
  menu.style.minWidth = `${Math.round(width)}px`;
  menu.style.maxWidth = `${Math.max(Math.round(width), Math.min(460, window.innerWidth - 24))}px`;

  const menuHeight = menu.offsetHeight || 220;
  const menuWidth = menu.offsetWidth || width;
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const spaceAbove = rect.top - 12;

  let top = rect.bottom + gap;
  if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
    top = Math.max(12, rect.top - menuHeight - gap);
  }
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - menuWidth - 12);

  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
}

function initGlassSelects(root = document) {
  bindGlassSelectGlobals();
  if (!root || !root.querySelectorAll) return;

  const selects = root.querySelectorAll("select");
  for (const sel of selects) {
    if (sel.dataset.glassInit === "1") continue;
    sel.dataset.glassInit = "1";

    const heroPill = sel.closest(".hero-control-pill");
    const inCopilot = Boolean(sel.closest(".copilot-panel"));
    const isFormControl = sel.classList.contains("form-control");
    const isInlineCompact = sel.style.width === "auto";

    const wrap = document.createElement("div");
    wrap.className = inCopilot ? "glass-select-wrap copilot-select-wrap" : "glass-select-wrap";
    if (isFormControl && !isInlineCompact) wrap.classList.add("is-block");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = isFormControl ? "form-control glass-select-trigger" : "glass-select-trigger";
    if (sel.style.cssText && isInlineCompact) {
      trigger.style.cssText = sel.style.cssText;
    }
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const ariaLabel = sel.getAttribute("aria-label");
    if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);

    const labelSpan = document.createElement("span");
    labelSpan.className = "glass-select-trigger-label";

    const chevronSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevronSvg.setAttribute("class", "glass-select-chevron");
    chevronSvg.setAttribute("width", "14");
    chevronSvg.setAttribute("height", "14");
    chevronSvg.setAttribute("viewBox", "0 0 24 24");
    chevronSvg.setAttribute("fill", "none");
    chevronSvg.setAttribute("stroke", "currentColor");
    chevronSvg.setAttribute("stroke-width", "2");
    chevronSvg.setAttribute("stroke-linecap", "round");
    chevronSvg.setAttribute("stroke-linejoin", "round");
    chevronSvg.setAttribute("aria-hidden", "true");
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute("points", "6 9 12 15 18 9");
    chevronSvg.appendChild(poly);

    trigger.appendChild(labelSpan);
    trigger.appendChild(chevronSvg);

    const parent = sel.parentNode;
    parent.insertBefore(wrap, sel);
    wrap.appendChild(trigger);
    wrap.appendChild(sel);

    sel.classList.add("glass-select-native");
    sel.tabIndex = -1;

    const syncTrigger = () => {
      const idx = sel.selectedIndex >= 0 ? sel.selectedIndex : 0;
      const opt = sel.options[idx];
      labelSpan.textContent = opt ? opt.textContent : "";
      trigger.disabled = Boolean(sel.disabled);
    };

    if (GLASS_SELECT_VALUE_DESC && GLASS_SELECT_VALUE_DESC.get && GLASS_SELECT_VALUE_DESC.set) {
      Object.defineProperty(sel, "value", {
        configurable: true,
        get() {
          return GLASS_SELECT_VALUE_DESC.get.call(this);
        },
        set(v) {
          GLASS_SELECT_VALUE_DESC.set.call(this, v);
          syncTrigger();
        },
      });
    }

    const observer = new MutationObserver(() => syncTrigger());
    observer.observe(sel, { childList: true, attributes: true, attributeFilter: ["disabled"] });
    sel.addEventListener("change", syncTrigger);

    if (sel.id) {
      const assocLabel = document.querySelector(`label[for="${CSS.escape(sel.id)}"]`);
      if (assocLabel && assocLabel.dataset.glassLabelBound !== "1") {
        assocLabel.dataset.glassLabelBound = "1";
        assocLabel.addEventListener("click", (e) => {
          e.preventDefault();
          if (!trigger.disabled) {
            trigger.focus();
            trigger.click();
          }
        });
      }
    }

    if (heroPill && heroPill.dataset.glassPillBound !== "1") {
      heroPill.dataset.glassPillBound = "1";
      heroPill.addEventListener("click", (e) => {
        if (e.target.closest("button, label, select")) return;
        if (!trigger.disabled) {
          trigger.focus();
          trigger.click();
        }
      });
    }

    const openMenu = () => {
      if (trigger.disabled) return;
      if (ACTIVE_GLASS_SELECT && ACTIVE_GLASS_SELECT.trigger === trigger) {
        closeActiveGlassMenu({ restoreFocus: true });
        return;
      }
      closeActiveGlassMenu();

      const menu = document.createElement("div");
      menu.className = inCopilot ? "glass-select-menu copilot-select-menu" : "glass-select-menu";
      menu.setAttribute("role", "listbox");
      if (ariaLabel) menu.setAttribute("aria-label", ariaLabel);

      const currentValue = sel.value;
      const optionBtns = [];

      for (const opt of Array.from(sel.options)) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "glass-select-option";
        item.setAttribute("role", "option");
        item.disabled = Boolean(opt.disabled);

        const isSelected = opt.value === currentValue;
        item.setAttribute("aria-selected", isSelected ? "true" : "false");
        if (isSelected) {
          item.classList.add("is-selected", "is-active");
        }

        const textSpan = document.createElement("span");
        textSpan.textContent = opt.textContent;
        item.appendChild(textSpan);

        if (isSelected) {
          const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          check.setAttribute("class", "glass-select-check");
          check.setAttribute("width", "15");
          check.setAttribute("height", "15");
          check.setAttribute("viewBox", "0 0 24 24");
          check.setAttribute("fill", "none");
          check.setAttribute("stroke", "currentColor");
          check.setAttribute("stroke-width", "2.2");
          check.setAttribute("stroke-linecap", "round");
          check.setAttribute("stroke-linejoin", "round");
          const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
          path.setAttribute("points", "20 6 9 17 4 12");
          check.appendChild(path);
          item.appendChild(check);
        }

        item.addEventListener("click", () => {
          if (item.disabled) return;
          const changed = sel.value !== opt.value;
          sel.value = opt.value;
          syncTrigger();
          closeActiveGlassMenu({ restoreFocus: true });
          if (changed) {
            sel.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });

        menu.appendChild(item);
        optionBtns.push(item);
      }

      document.body.appendChild(menu);
      trigger.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      if (heroPill) heroPill.classList.add("is-open");

      const anchorEl = heroPill || trigger;
      positionGlassMenu(menu, anchorEl, heroPill ? 196 : 160);

      ACTIVE_GLASS_SELECT = { menu, trigger, heroPill, anchorEl, optionBtns };
    };

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      openMenu();
    });

    trigger.addEventListener("keydown", (e) => {
      if (ACTIVE_GLASS_SELECT && ACTIVE_GLASS_SELECT.trigger === trigger) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
    });

    syncTrigger();
  }
}

/* ========================================================================= */
/* CURVED SVG WORKFLOW CONNECTORS (Step 1 -> Step 2 -> Step 3)               */
/* ========================================================================= */
let WORKFLOW_CONNECTOR_RAF = null;

function buildCurvedConnectorPath(x1, y1, x2, y2, cFrom, cTo, sideBySide, panelWidth) {
  if (!sideBySide) {
    const startX = Math.round(x1);
    const endX = Math.round(x2);
    const startY = Math.round(y1);
    const endY = Math.round(y2);
    const dy = endY - startY;
    if (dy < 20) return null;

    if (Math.abs(endX - startX) < 14) {
      const swing = Math.min(34, Math.max(18, panelWidth * 0.048));
      return `M ${startX} ${startY} C ${(startX + swing).toFixed(1)} ${(startY + dy * 0.34).toFixed(1)}, ${(endX - swing * 0.55).toFixed(1)} ${(startY + dy * 0.68).toFixed(1)}, ${endX} ${endY}`;
    }

    const midY = (startY + endY) / 2;
    return `M ${startX} ${startY} C ${startX} ${midY.toFixed(1)}, ${endX} ${midY.toFixed(1)}, ${endX} ${endY}`;
  }

  const corridorTop = Math.max(y1 + 24, cFrom.bottom + 18);
  const corridorBot = Math.min(y2 - 18, cTo.top - 18);
  let midY = (corridorTop + corridorBot) / 2;
  if (corridorBot < corridorTop) {
    midY = (y1 + y2) / 2;
  }

  const dx = x2 - x1;
  const dir = dx >= 0 ? 1 : -1;
  const dyTop = Math.max(0, midY - y1);
  const dyBot = Math.max(0, y2 - midY);
  const baseCurve = Math.min(Math.max(panelWidth * 0.072, 36), 92);
  const rTop = Math.min(baseCurve * 1.15, Math.abs(dx) * 0.40, dyTop * 0.65);
  const rBot = Math.min(baseCurve * 0.90, Math.abs(dx) * 0.34, dyBot * 0.85);

  if (rTop < 10 || rBot < 10 || dyTop <= rTop || dyBot <= rBot) {
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${midY.toFixed(1)}, ${x2.toFixed(1)} ${midY.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  const k = 0.56;
  const xStartCurve = x1 + dir * rTop;
  const xEndCurve = x2 - dir * rBot;
  return [
    `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    `L ${x1.toFixed(1)} ${(midY - rTop).toFixed(1)}`,
    `C ${x1.toFixed(1)} ${(midY - rTop * k).toFixed(1)}, ${(x1 + dir * rTop * k).toFixed(1)} ${midY.toFixed(1)}, ${xStartCurve.toFixed(1)} ${midY.toFixed(1)}`,
    `L ${xEndCurve.toFixed(1)} ${midY.toFixed(1)}`,
    `C ${(x2 - dir * rBot * k).toFixed(1)} ${midY.toFixed(1)}, ${x2.toFixed(1)} ${(midY + rBot * k).toFixed(1)}, ${x2.toFixed(1)} ${(midY + rBot).toFixed(1)}`,
    `L ${x2.toFixed(1)} ${y2.toFixed(1)}`,
  ].join(" ");
}

const SHOWCASE_CONNECTOR_SPECS = [
  {
    panelId: "panel-workbench",
    svgId: "workflow-step-connectors",
    pairs: [
      ["showcase-step-1", "showcase-step-2", "conn-grad-12"],
      ["showcase-step-2", "showcase-step-3", "conn-grad-23"],
      ["showcase-step-3", "showcase-step-4", "conn-grad-34"],
    ],
  },
  {
    panelId: "panel-visual",
    svgId: "visual-step-connectors",
    pairs: [["visual-step-1", "visual-step-2", "conn-vis-12"]],
  },
  {
    panelId: "panel-guidelines",
    svgId: "guidelines-step-connectors",
    pairs: [
      ["guidelines-step-1", "guidelines-step-2", "conn-gdl-12"],
      ["guidelines-step-2", "guidelines-step-3", "conn-gdl-23"],
    ],
  },
  {
    panelId: "panel-insights",
    svgId: "insights-step-connectors",
    pairs: [["insights-step-1", "insights-step-2", "conn-ins-12"]],
  },
];

function renderPanelShowcaseConnectors(panel, svg, pairs) {
  if (!panel || !svg) return;

  if (panel.classList.contains("hidden") || panel.offsetParent === null) {
    svg.innerHTML = "";
    return;
  }

  const panelRect = panel.getBoundingClientRect();
  if (panelRect.width < 100 || panelRect.height < 100) return;

  const toLocal = (el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left - panelRect.left,
      right: r.right - panelRect.left,
      top: r.top - panelRect.top,
      bottom: r.bottom - panelRect.top,
      width: r.width,
      height: r.height,
    };
  };

  svg.setAttribute("viewBox", `0 0 ${Math.round(panelRect.width)} ${Math.round(panelRect.height)}`);
  svg.setAttribute("shape-rendering", "geometricPrecision");
  const svgNs = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(svgNs, "defs");

  const glowFilterId = `${svg.id}-glow`;
  const glowFilter = document.createElementNS(svgNs, "filter");
  glowFilter.setAttribute("id", glowFilterId);
  glowFilter.setAttribute("filterUnits", "userSpaceOnUse");
  glowFilter.setAttribute("x", "0");
  glowFilter.setAttribute("y", "0");
  glowFilter.setAttribute("width", String(Math.round(panelRect.width)));
  glowFilter.setAttribute("height", String(Math.round(panelRect.height)));
  const blur = document.createElementNS(svgNs, "feGaussianBlur");
  blur.setAttribute("in", "SourceGraphic");
  blur.setAttribute("stdDeviation", "4.5");
  glowFilter.appendChild(blur);
  defs.appendChild(glowFilter);

  const frag = document.createDocumentFragment();
  frag.appendChild(defs);

  for (const [fromId, toId, gradId] of pairs) {
    const fromBand = document.getElementById(fromId);
    const toBand = document.getElementById(toId);
    if (!fromBand || !toBand) continue;

    const gFromEl = fromBand.querySelector(".step-guidance-col");
    const cFromEl = fromBand.querySelector(".step-box-col");
    const lToEl = toBand.querySelector(".step-outer-label");
    const cToEl = toBand.querySelector(".step-box-col");
    if (!gFromEl || !cFromEl || !lToEl || !cToEl) continue;

    const gFrom = toLocal(gFromEl);
    const cFrom = toLocal(cFromEl);
    const lTo = toLocal(lToEl);
    const cTo = toLocal(cToEl);

    const sideBySide = Math.abs(gFrom.left - cFrom.left) > 100;
    const toStacked = toBand.classList.contains("showcase-stacked");
    const x1 = sideBySide
      ? gFrom.left + Math.min(64, gFrom.width * 0.18)
      : cFrom.left + Math.min(44, cFrom.width * 0.08);
    const y1 = sideBySide ? gFrom.bottom + 24 : cFrom.bottom + 14;
    const x2 = toStacked
      ? lTo.left + lTo.width / 2
      : (sideBySide
          ? lTo.left + Math.min(54, Math.max(120, lTo.width) * 0.16)
          : lTo.left + Math.min(44, Math.max(120, lTo.width) * 0.08));
    const y2 = lTo.top - 16;

    const d = buildCurvedConnectorPath(x1, y1, x2, y2, cFrom, cTo, sideBySide, panelRect.width);
    if (!d) continue;

    const grad = document.createElementNS(svgNs, "linearGradient");
    grad.setAttribute("id", gradId);
    grad.setAttribute("gradientUnits", "userSpaceOnUse");
    grad.setAttribute("x1", x1.toFixed(1));
    grad.setAttribute("y1", y1.toFixed(1));
    grad.setAttribute("x2", x2.toFixed(1));
    grad.setAttribute("y2", y2.toFixed(1));

    const stops = [
      ["0%", "#6F82A6", "0.62"],
      ["28%", "#8979A8", "0.78"],
      ["56%", "#9F8490", "0.82"],
      ["82%", "#7C9C97", "0.86"],
      ["100%", "#BCC8DA", "0.94"],
    ];
    for (const [offset, color, opacity] of stops) {
      const stop = document.createElementNS(svgNs, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      stop.setAttribute("stop-opacity", opacity);
      grad.appendChild(stop);
    }
    defs.appendChild(grad);

    const dotGlow = document.createElementNS(svgNs, "circle");
    dotGlow.setAttribute("cx", x1.toFixed(1));
    dotGlow.setAttribute("cy", y1.toFixed(1));
    dotGlow.setAttribute("r", "6");
    dotGlow.setAttribute("fill", "rgba(111, 130, 166, 0.35)");
    dotGlow.setAttribute("filter", `url(#${glowFilterId})`);
    frag.appendChild(dotGlow);

    const dot = document.createElementNS(svgNs, "circle");
    dot.setAttribute("cx", x1.toFixed(1));
    dot.setAttribute("cy", y1.toFixed(1));
    dot.setAttribute("r", "3");
    dot.setAttribute("fill", "#8E9FBF");
    frag.appendChild(dot);

    const halo = document.createElementNS(svgNs, "path");
    halo.setAttribute("d", d);
    halo.setAttribute("fill", "none");
    halo.setAttribute("stroke", `url(#${gradId})`);
    halo.setAttribute("stroke-opacity", "0.52");
    halo.setAttribute("stroke-width", "5.2");
    halo.setAttribute("stroke-linecap", "round");
    halo.setAttribute("stroke-linejoin", "round");
    halo.setAttribute("filter", `url(#${glowFilterId})`);
    frag.appendChild(halo);

    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", `url(#${gradId})`);
    path.setAttribute("stroke-width", "1.65");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    frag.appendChild(path);

    const arrowD = `M ${(x2 - 5.5).toFixed(1)} ${(y2 - 6.5).toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)} L ${(x2 + 5.5).toFixed(1)} ${(y2 - 6.5).toFixed(1)}`;
    const arrowHalo = document.createElementNS(svgNs, "path");
    arrowHalo.setAttribute("d", arrowD);
    arrowHalo.setAttribute("fill", "none");
    arrowHalo.setAttribute("stroke", "#BCC8DA");
    arrowHalo.setAttribute("stroke-opacity", "0.45");
    arrowHalo.setAttribute("stroke-width", "4.5");
    arrowHalo.setAttribute("stroke-linecap", "round");
    arrowHalo.setAttribute("stroke-linejoin", "round");
    arrowHalo.setAttribute("filter", `url(#${glowFilterId})`);
    frag.appendChild(arrowHalo);

    const arrow = document.createElementNS(svgNs, "path");
    arrow.setAttribute("d", arrowD);
    arrow.setAttribute("fill", "none");
    arrow.setAttribute("stroke", "#CED7E5");
    arrow.setAttribute("stroke-opacity", "0.94");
    arrow.setAttribute("stroke-width", "1.75");
    arrow.setAttribute("stroke-linecap", "round");
    arrow.setAttribute("stroke-linejoin", "round");
    frag.appendChild(arrow);
  }

  svg.innerHTML = "";
  svg.appendChild(frag);
}

function updateWorkflowConnectors() {
  for (const spec of SHOWCASE_CONNECTOR_SPECS) {
    renderPanelShowcaseConnectors(
      document.getElementById(spec.panelId),
      document.getElementById(spec.svgId),
      spec.pairs
    );
  }
}

function scheduleWorkflowConnectors() {
  if (WORKFLOW_CONNECTOR_RAF) cancelAnimationFrame(WORKFLOW_CONNECTOR_RAF);
  WORKFLOW_CONNECTOR_RAF = requestAnimationFrame(() => {
    WORKFLOW_CONNECTOR_RAF = null;
    updateWorkflowConnectors();
  });
}

function initWorkflowConnectors() {
  const flows = document.querySelectorAll(".workbench-editorial-flow");
  if (!flows.length) return;

  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => scheduleWorkflowConnectors());
    ro.observe(document.body);
    for (const panel of flows) {
      ro.observe(panel);
      for (const band of panel.querySelectorAll(".showcase-band-16x9, .showcase-band-inner, .step-box-col, .step-guidance-col")) {
        ro.observe(band);
      }
    }
  }

  window.addEventListener("resize", scheduleWorkflowConnectors, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleWorkflowConnectors, { passive: true });
  }
  for (const panel of flows) {
    panel.addEventListener("toggle", scheduleWorkflowConnectors, true);
    panel.addEventListener("transitionend", scheduleWorkflowConnectors, true);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleWorkflowConnectors).catch(() => {});
  }
  scheduleWorkflowConnectors();
}

window.addEventListener("DOMContentLoaded", async () => {
  initScrollAwareHeader();
  initGlassSelects(document);
  resetAllInputsToDefault();
  initWorkflowConnectors();
  const roleEl = document.getElementById("active-role-select");
  if (roleEl) roleEl.value = "Creator";
  updateAvatarInitials(document.getElementById("actor-name-input")?.value || "Nandha K");
  setDetailMode("simple");
  await Promise.all([loadPresets(), syncTopChainBadge()]);
  scheduleWorkflowConnectors();
});
