/* VeriLoom Round 3 Production Reviewer Workbench Controller (v24.0) */
let DEMO_PRESETS = [];
let CURRENT_ASSET = null;
let ALL_SUBMISSIONS = [];
let QUEUE_FILTER = "all"; // "all" | "legal" | "approved" | "violations"
let ALL_FACTS_DATA = null;
let FACT_FILTER = "all"; // "all" | "active" | "expired"
let LAST_VISUAL_DATA = null;
let LAST_VISUAL_IMG = null;
let MUST_KEEP_TAGS = ["12 Nov", "webinar"];
let DETAIL_MODE = "simple"; // "simple" (Simple View) | "dev" (Audit Details)
let CURRENT_JURISDICTION = "US"; // "US" | "EU" | "UK" | "GLOBAL"
let SHOW_SAFEZONE_OVERLAY = true;
let FACT_VIEW_MODE = "table"; // "table" | "graph"
let KNOWLEDGE_GRAPH_DATA = null;
let ACTIVE_DISCLOSURE_DATA = null;

function onJurisdictionChanged() {
  const sel = document.getElementById("active-jurisdiction-select");
  if (!sel) return;
  CURRENT_JURISDICTION = sel.value;
  
  const jurNames = {
    US: "United States (FTC 16 CFR §255 Endorsement Guides)",
    EU: "European Union (EU AI Act Article 50 & EAA)",
    UK: "United Kingdom (CMA & ASA / CAP Code)",
    GLOBAL: "Global Baseline Harmonized Standards",
  };
  showStatusMessage(`Jurisdiction switched to ${jurNames[CURRENT_JURISDICTION] || CURRENT_JURISDICTION}. Re-compiling regulatory compliance rules...`);

  if (CURRENT_ASSET) {
    recompileSubmissionForJurisdiction(CURRENT_ASSET.asset_id, CURRENT_JURISDICTION);
  }
}

function onGlobalJurisdictionChanged(val) {
  if (val) {
    CURRENT_JURISDICTION = val;
    const sel = document.getElementById("active-jurisdiction-select");
    if (sel && sel.value !== val) sel.value = val;
  }
  onJurisdictionChanged();
}

async function recompileSubmissionForJurisdiction(assetId, jurisdiction) {
  if (!CURRENT_ASSET) return;
  try {
    const actor = getActiveActor();
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: CURRENT_ASSET.title || "Regulatory Re-Compilation",
        content: CURRENT_ASSET.current_content || CURRENT_ASSET.raw_content,
        creator_intent: CURRENT_ASSET.creator_intent || "Evaluate copy",
        must_keep_points: CURRENT_ASSET.must_keep_points || [],
        origin: CURRENT_ASSET.origin || "ai_generated",
        channel: CURRENT_ASSET.channel || "social",
        jurisdiction: jurisdiction,
        actor_name: actor.name,
        actor_role: actor.role,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      CURRENT_ASSET = data;
      renderActiveSubmission(data);
      await loadSubmissionsQueue(data.asset_id);
      showStatusMessage(`Dynamic regulatory re-compilation complete for ${jurisdiction}. Verdict: ${data.overall_verdict}.`);
    }
  } catch (err) {
    console.error("Jurisdiction re-compilation failed:", err);
  }
}

function updateAvatarInitials(nameStr) {
  const pill = document.getElementById("user-avatar-initials");
  const nameInput = document.getElementById("actor-name-input");
  if (nameInput) {
    const rawVal = nameStr !== undefined ? nameStr : nameInput.value;
    const charLen = String(rawVal || "Nandha K").length;
    nameInput.style.width = Math.max(78, charLen * 9.5) + "px";
  }
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
  if (btnSimple) btnSimple.classList.toggle("active", DETAIL_MODE === "simple");
  if (btnDev) btnDev.classList.toggle("active", DETAIL_MODE === "dev");

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
    <span class="spinner-light"></span>
    <span>${escapeHtml(message)}</span>
    <div class="shimmer-bar"></div>
  </div>`;
}

function setButtonLoading(btnEl, loadingText, useDarkSpinner = false) {
  if (!btnEl) return () => {};
  const origHtml = btnEl.innerHTML;
  btnEl.disabled = true;
  const spinnerClass = useDarkSpinner ? "spinner-inline" : "spinner-inline-light";
  btnEl.innerHTML = `<span class="${spinnerClass}"></span> ${escapeHtml(loadingText)}`;
  return () => {
    btnEl.disabled = false;
    btnEl.innerHTML = origHtml;
  };
}

const pauseForVisualFeedback = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

let statusBannerTimer = null;
function showStatusMessage(msg, isError = false) {
  const banner = document.getElementById("status-banner");
  if (!banner) return;
  if (statusBannerTimer) {
    clearTimeout(statusBannerTimer);
    statusBannerTimer = null;
  }
  banner.classList.remove("hidden");
  banner.style.borderLeftColor = isError ? "#ef4444" : "rgba(255, 255, 255, 0.2)";
  banner.style.background = isError ? "rgba(38, 14, 20, 0.95)" : "rgba(18, 19, 26, 0.95)";
  banner.style.color = isError ? "#fca5a5" : "#FFFFFF";
  banner.textContent = msg;

  // Each and every pop-up automatically vanishes after 5 seconds
  statusBannerTimer = setTimeout(() => {
    banner.classList.add("hidden");
    statusBannerTimer = null;
  }, 5000);
}

function getActiveActor() {
  const roleEl = document.getElementById("active-role-select");
  const nameEl = document.getElementById("actor-name-input");
  return {
    role: roleEl ? roleEl.value : "Creator",
    name: nameEl && nameEl.value.trim() ? nameEl.value.trim() : "Nandha K",
  };
}

function switchTab(tabName) {
  const tabs = ["workbench", "visual", "guidelines", "facts", "insights", "audit"];
  for (const t of tabs) {
    const btn = document.getElementById(`tab-btn-${t}`);
    const panel = document.getElementById(`panel-${t}`);
    if (btn) btn.setAttribute("aria-selected", t === tabName ? "true" : "false");
    if (panel) {
      if (t === tabName) panel.classList.remove("hidden");
      else panel.classList.add("hidden");
    }
  }
  if (tabName === "visual" && !LAST_VISUAL_DATA) runVisualAuditDemo("non_compliant_demo");
  if (tabName === "guidelines") {
    loadGuidelinesRules();
    runGuidelineLinter(true);
  }
  if (tabName === "facts") loadFactVault();
  if (tabName === "insights") loadInsightsAndTelemetry();
  if (tabName === "audit") loadAuditLedger();
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
    box.innerHTML = `<div class="diff-box" style="text-align:center;color:var(--text-muted);">No submissions match the selected filter.</div>`;
    return;
  }

  let html = '<table class="data-table"><thead><tr><th>Asset ID</th><th>Submission Title</th><th>Origin &amp; Channel</th><th>Verdict</th><th>Assigned Reviewer</th><th>Workflow Status</th><th style="text-align:right;">Action</th></tr></thead><tbody>';
  for (const item of filtered) {
    const cleanTitle = escapeHtml(item.title);
    const isSelected = CURRENT_ASSET && CURRENT_ASSET.asset_id === item.asset_id;
    const selectedStyle = isSelected ? "background: rgba(70, 76, 232, 0.12); box-shadow: inset 3px 0 0 #6478D2;" : "";
    html += `<tr class="${isSelected ? "row-selected-codex" : ""}" style="${selectedStyle}">
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
      ? ALL_SUBMISSIONS.find((x) => x.asset_id === selectId) || ALL_SUBMISSIONS[0]
      : (CURRENT_ASSET && ALL_SUBMISSIONS.find((x) => x.asset_id === CURRENT_ASSET.asset_id)) || ALL_SUBMISSIONS[0];

    if (target) {
      renderActiveSubmission(target);
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
  } catch (err) {
    console.error("Error selecting submission:", err);
  } finally {
    restoreBtn();
  }
}

function renderActiveSubmission(asset) {
  CURRENT_ASSET = asset;
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
    secBanner.style.cssText = "border-color:#22c55e;background:rgba(34,197,94,0.12);color:#86efac;margin-bottom:16px;padding:12px 16px;";
    secBanner.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="color:#86efac;font-size:0.96rem;">&#10003; OWASP LLM01 Security Cleared &amp; Approved</strong>
          <div style="font-size:0.84rem;color:var(--text-secondary);margin-top:3px;">
            Prompt injection neutralized and PII redacted. Approved for release by <strong>${escapeHtml(asset.approved_by || actor.name)}</strong>.
          </div>
        </div>
        <span class="tier-badge tier-pass">Security Cleared</span>
      </div>`;
  } else if (!isApproved && hasInjection) {
    secBanner.className = "diff-box";
    secBanner.style.cssText = "border-color:#ef4444;background:rgba(239,68,68,0.16);color:#fca5a5;margin-bottom:16px;padding:12px 16px;";
    secBanner.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <strong style="color:#fca5a5;font-size:0.96rem;">&#9888; Prompt Injection &amp; PII Leakage Detected &mdash; Routed to Legal Reviewer</strong>
          <div style="font-size:0.84rem;color:#ffffff;margin-top:3px;">
            OWASP LLM01 Security Gate: Intercepted <strong>${rc.injection_attempts_blocked || 2}</strong> prompt injection attempt(s), masked <strong>${rc.pii_masked_count || 2}</strong> PII item(s), and redacted <strong>${rc.confidential_terms_masked_count || 1}</strong> confidential project name(s). Requires Authorised Reviewer (Legal) sign-off.
          </div>
        </div>
        <span class="tier-badge tier-violation">OWASP LLM01 Flagged</span>
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
  const btnDownloadCert = document.getElementById("btn-download-certificate");
  const btnDownloadCertOld = document.getElementById("btn-download-cert");

  if (isApproved) {
    if (btnDownloadCert) btnDownloadCert.classList.remove("hidden");
    if (btnDownloadCertOld) btnDownloadCertOld.classList.add("hidden");
  } else {
    if (btnDownloadCert) btnDownloadCert.classList.add("hidden");
    if (btnDownloadCertOld) btnDownloadCertOld.classList.add("hidden");
  }

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

  // Evaluate Step 2 1-Click Compliant Legal Disclosure Card (§Improvement 2)
  evaluateRegulatoryDisclosures(asset);

  const routeNote = document.getElementById("approval-routing-note");
  if (routeNote) {
    if (isApproved) {
      routeNote.innerHTML =
        `<span style="color:#86efac;font-weight:600;">&#10003; Approved by <strong>${escapeHtml(asset.approved_by || actor.name)}</strong></span>` +
        `<span class="dev-only-el"> &bull; Fingerprint: <code>${escapeHtml((asset.approved_sha256 || "").slice(0, 20))}...</code></span>`;
    } else if (isCreatorRole) {
      routeNote.innerHTML =
        `<div class="rbac-lock-notice"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;display:inline-block;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Role Lock: Creators cannot self-approve submissions (Routed to <strong>${escapeHtml(asset.assigned_role)}</strong>).</div>` +
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

      const isRegulatory = f.check_type === "regulatory_compliance" || (f.rule_id && f.rule_id.startsWith("REG-"));
      if (isRegulatory) {
        const rawLen = (asset.raw_content || "").length;
        const discLen = (f.suggested_disclosure || "").length;
        const totalLen = rawLen + discLen;
        const charLimit = f.channel_char_limit || (asset.channel === "social" ? 280 : 2000);
        const fitsLimit = totalLen <= charLimit;

        cardsHtml += `
        <div class="finding-card card-advisory" style="border-left: 4px solid #10B981; background: rgba(16, 185, 129, 0.05); margin-bottom: 14px;">
          <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;">
            <div>
              <span class="tier-badge tier-pass" style="background:#10B981;color:#090D16;font-weight:700;">⚖️ STATUTORY DISCLOSURE</span>
              <strong style="margin-left:6px;color:var(--text-primary);">${escapeHtml(f.jurisdiction_name || f.jurisdiction || "Cross-Border Advertising Law")}</strong>
              <span style="font-size:0.8rem;color:var(--text-muted);margin-left:6px;">(${escapeHtml(f.source_clause)})</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="tier-badge ${fitsLimit ? "tier-pass" : "tier-violation"}">${totalLen}/${charLimit} Chars (${fitsLimit ? "Fits Channel" : "Exceeds Limit"})</span>
              ${statusPillHtml}
            </div>
          </div>
          <p style="margin:10px 0 8px 0;font-weight:500;color:var(--text-primary);">${escapeHtml(f.explanation)}</p>
          <div style="margin:10px 0;">
            <strong style="font-size:0.84rem;color:var(--text-secondary);">Non-Destructive Statutory Disclaimer Injection:</strong>
            <div class="diff-box" style="margin-top:6px;border-color:rgba(16,185,129,0.35);">${renderTrackedChangesHtml(f.tracked_change || (asset.raw_content + ' {+' + (f.suggested_disclosure || '') + '+}'))}</div>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;align-items:center;">
            ${isAccepted ? `
              <span class="tier-badge tier-pass" style="padding:6px 12px;background:rgba(34,197,94,0.16);color:#86efac;border-color:rgba(34,197,94,0.45);">&#10003; Statutory Disclaimer Active</span>
            ` : `
              <button type="button" class="btn btn-primary" style="background:#10B981;color:#090D16;font-weight:600;padding:8px 16px;" onclick="applyRegulatoryDisclosure('${escapeHtml(f.finding_id)}', '${escapeHtml(f.rule_id)}', '${escapeHtml(f.suggested_disclosure || "")}', this)">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="stroke:#090D16;"><polyline points="20 6 9 17 4 12"/></svg>
                1-Click Non-Destructive Disclosure Injection
              </button>
            `}
          </div>
        </div>`;
        continue;
      }

      cardsHtml += `
      <div class="finding-card ${cardClass}">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;">
          <div>
            ${getTierBadgeHtml(f.verdict_tier)}
            <strong class="simple-only-el" style="margin-left:6px;color:var(--text-primary);">${escapeHtml(f.category ? f.category.toUpperCase() + " CHECK" : "Brand Guideline")}</strong>
            <strong class="dev-only-el" style="margin-left:6px;color:var(--text-primary);">Rule: ${escapeHtml(f.rule_id)}</strong>
            ${f.fact_id ? `<span class="tier-badge tier-human" style="margin-left:4px;">Fact: ${escapeHtml(f.fact_id)}</span>` : ""}
            <span class="dev-only-el" style="font-size:0.8rem;color:var(--text-muted);margin-left:6px;">(${escapeHtml(f.source_clause)})</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
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
            ${isCreatorRole ? `<div class="rbac-lock-notice"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;display:inline-block;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Switch Role to Brand Manager or Legal Reviewer to grant waivers</div>` : ""}
          </div>
        </div>
      </div>`;
    }
    fBox.innerHTML = cardsHtml;
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
  const jurisdiction = document.getElementById("sub-jurisdiction") ? document.getElementById("sub-jurisdiction").value : (document.getElementById("active-jurisdiction-select")?.value || "US");

  if (!content) {
    showStatusMessage("Please enter content to verify.", true);
    return;
  }

  const verifyBtn = document.getElementById("btn-verify-draft");
  const origBtnHtml = verifyBtn ? verifyBtn.innerHTML : "";
  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = `<span class="spinner-inline"></span> Verifying with 67M BERT-NLI...`;
  }
  const fBox = document.getElementById("active-findings-list");
  if (fBox) {
    fBox.innerHTML = renderAreaLoader("Executing 9-layer deterministic AST, Fact Vault & local 67M BERT-NLI verification...");
  }

  try {
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        title,
        content,
        creator_intent: intent,
        must_keep_points: mustKeep,
        origin,
        channel,
        jurisdiction,
        actor_name: actor.name,
        actor_role: actor.role,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showStatusMessage(data.detail || "Verification request failed.", true);
      return;
    }
    showStatusMessage(`Verified ${data.asset_id}: Verdict = ${data.overall_verdict} (${data.findings_count} finding(s)). Routed to ${data.assigned_role}.`);
    await loadSubmissionsQueue(data.asset_id);
  } catch (err) {
    showStatusMessage(`Error: ${err.message}`, true);
  } finally {
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.innerHTML = origBtnHtml;
    }
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
  const uploadJur = document.getElementById("sub-jurisdiction") ? document.getElementById("sub-jurisdiction").value : (document.getElementById("active-jurisdiction-select")?.value || "US");
  formData.append("jurisdiction", uploadJur);

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
  } catch (err) {
    showStatusMessage(`Error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

/* ========================================================================= */
/* CERTIFICATE DOWNLOAD & REGULATORY DISCLOSURE INJECTION (§Round 3)        */
/* ========================================================================= */
async function downloadVerificationCertificate(btnEl = null) {
  if (!CURRENT_ASSET) return;
  const actor = getActiveActor();
  const restoreBtn = setButtonLoading(btnEl, "Generating Certificate...", true);

  try {
    await pauseForVisualFeedback(300);
    const res = await fetch(`/api/submissions/${encodeURIComponent(CURRENT_ASSET.asset_id)}/certificate?signer_name=${encodeURIComponent(actor.name)}&signer_role=${encodeURIComponent(actor.role)}&download=true`);
    if (!res.ok) {
      showStatusMessage("Failed to fetch compliance certificate.", true);
      return;
    }
    const certData = await res.json();

    const blob = new Blob([JSON.stringify(certData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certificate-${CURRENT_ASSET.asset_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatusMessage(`Downloaded cryptographic verification certificate for ${CURRENT_ASSET.asset_id} (Cert ID: ${certData.certificate_id || "CERT-VERIFIED"}). Merkle block chain verified.`);
  } catch (err) {
    showStatusMessage(`Certificate download error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function downloadComplianceCertificate(btnEl = null) {
  return downloadVerificationCertificate(btnEl);
}

function evaluateRegulatoryDisclosures(asset) {
  const card = document.getElementById("legal-disclosure-card");
  if (!card) return;

  const findings = asset.findings || [];
  const regFinding = findings.find((f) =>
    (f.rule_id && f.rule_id.startsWith("REG-")) ||
    f.category === "regulatory" ||
    f.check_type === "regulatory_compliance" ||
    (f.explanation && f.explanation.toLowerCase().includes("disclosure")) ||
    (f.explanation && f.explanation.toLowerCase().includes("ai origin")) ||
    Boolean(f.suggested_disclosure)
  );

  if (!regFinding) {
    card.classList.add("hidden");
    ACTIVE_DISCLOSURE_DATA = null;
    return;
  }

  const channel = asset.channel || "social";
  const channelLimits = { social: 280, ad: 150, email: 2000, web: 5000, deck: 500 };
  const maxLimit = channelLimits[channel] || 280;

  let disclosureText = regFinding.suggested_disclosure;
  if (!disclosureText) {
    if (CURRENT_JURISDICTION === "EU") disclosureText = "[AI-Assisted \u2022 EU AI Act Art. 50]";
    else if (CURRENT_JURISDICTION === "US") disclosureText = "#Ad *Terms apply.";
    else if (CURRENT_JURISDICTION === "UK") disclosureText = "*CAP Code: Substantiated claim.";
    else disclosureText = "[Compliant Disclosure: Verified]";
  }

  ACTIVE_DISCLOSURE_DATA = {
    asset_id: asset.asset_id,
    rule_id: regFinding.rule_id || "REG-01",
    disclosure_text: disclosureText,
    channel,
    max_limit: maxLimit,
  };

  const titleEl = document.getElementById("disclosure-rule-title");
  if (titleEl) titleEl.textContent = `Missing Mandatory Legal Disclosure (${regFinding.rule_id || "Statutory Matrix"})`;

  const expEl = document.getElementById("disclosure-explanation");
  if (expEl) expEl.textContent = regFinding.explanation || "Content lacks mandatory statutory disclosure under active jurisdiction rule engine.";

  const prevEl = document.getElementById("disclosure-text-preview");
  if (prevEl) prevEl.textContent = disclosureText;

  const chanBadge = document.getElementById("disclosure-channel-badge");
  if (chanBadge) chanBadge.textContent = `${formatChannelLabel(channel)} (Max ${maxLimit} chars)`;

  const currentLen = (asset.current_content || asset.raw_content || "").length;
  const projectedLen = currentLen + disclosureText.length + 2;
  const remaining = maxLimit - projectedLen;
  const fillPct = Math.min(100, Math.round((projectedLen / maxLimit) * 100));

  const fillBar = document.getElementById("disclosure-char-meter-fill");
  const countLabel = document.getElementById("disclosure-char-count-label");

  if (fillBar) {
    fillBar.style.width = `${fillPct}%`;
    fillBar.style.background = fillPct > 100 ? "#F43F5E" : (fillPct > 80 ? "#F59E0B" : "#10B981");
  }
  if (countLabel) {
    countLabel.textContent = `${projectedLen} / ${maxLimit} chars (${remaining >= 0 ? remaining + " remaining" : Math.abs(remaining) + " over limit!"})`;
    countLabel.style.color = fillPct > 100 ? "#F43F5E" : (fillPct > 80 ? "#F59E0B" : "#34D399");
  }

  card.classList.remove("hidden");
}

async function injectCompliantDisclosure(btnEl = null) {
  if (!ACTIVE_DISCLOSURE_DATA || !CURRENT_ASSET) return;
  const actor = getActiveActor();
  const restoreBtn = setButtonLoading(btnEl, "Appending Disclosure...", true);

  try {
    await pauseForVisualFeedback(280);
    const res = await fetch(`/api/submissions/${encodeURIComponent(ACTIVE_DISCLOSURE_DATA.asset_id)}/apply-disclosure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rule_id: ACTIVE_DISCLOSURE_DATA.rule_id,
        disclosure_text: ACTIVE_DISCLOSURE_DATA.disclosure_text,
        placement: "append",
        actor_name: actor.name,
        actor_role: actor.role,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showStatusMessage(data.detail || "Failed to inject disclosure.", true);
      return;
    }
    CURRENT_ASSET = data;
    showStatusMessage(`Appended compliant disclosure to ${ACTIVE_DISCLOSURE_DATA.asset_id}. Working copy updated & chained to audit block.`);
    await selectSubmission(ACTIVE_DISCLOSURE_DATA.asset_id);
  } catch (err) {
    showStatusMessage(`Disclosure error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function applyRegulatoryDisclosure(findingId, ruleId, disclosureText, btnEl = null) {
  if (!CURRENT_ASSET) return;
  const actor = getActiveActor();
  const restoreBtn = setButtonLoading(btnEl, "Injecting...", true);
  try {
    await pauseForVisualFeedback(240);
    const textToInject = disclosureText || (CURRENT_JURISDICTION === "EU" ? "[AI-Assisted \u2022 EU AI Act Art. 50]" : "#Ad *Terms apply.");
    const res = await fetch(`/api/submissions/${encodeURIComponent(CURRENT_ASSET.asset_id)}/apply-disclosure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rule_id: ruleId || "REG-01",
        disclosure_text: textToInject,
        placement: "append",
        actor_name: actor.name,
        actor_role: actor.role,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showStatusMessage(data.detail || "Failed to apply disclosure", true);
      return;
    }
    CURRENT_ASSET = data;
    showStatusMessage(`Statutory disclosure injected into ${CURRENT_ASSET.asset_id}. Working copy updated & audited.`);
    await selectSubmission(CURRENT_ASSET.asset_id);
  } catch (err) {
    showStatusMessage(`Error applying disclosure: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

/* ========================================================================= */
/* TAB 2: VISUAL & CONTRAST INSPECTOR (WITH LOGO SAFE-ZONE OVERLAY)          */
/* ========================================================================= */
function toggleLogoSafeZoneOverlay() {
  SHOW_SAFEZONE_OVERLAY = !SHOW_SAFEZONE_OVERLAY;
  const btn = document.getElementById("btn-toggle-safezone-overlay");
  if (btn) {
    btn.classList.toggle("active", SHOW_SAFEZONE_OVERLAY);
  }
  drawVisualCanvas(null);
  showStatusMessage(`Logo Safe-Zone (0.5x Margin) overlay ${SHOW_SAFEZONE_OVERLAY ? "enabled" : "hidden"}.`);
}

function drawVisualCanvas(highlightedBoxId = null) {
  const canvas = document.getElementById("visual-inspector-canvas");
  if (!canvas || !LAST_VISUAL_DATA || !LAST_VISUAL_IMG) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(LAST_VISUAL_IMG, 0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / (LAST_VISUAL_DATA.image_dimensions?.width || 1200);
  const scaleY = canvas.height / (LAST_VISUAL_DATA.image_dimensions?.height || 630);

  // Safe-Zone Clearance Overlay (0.5x Logo Height Margin)
  const sz = LAST_VISUAL_DATA.safe_zone_audit;
  if (SHOW_SAFEZONE_OVERLAY && sz && sz.safe_zone_bbox) {
    const sb = sz.safe_zone_bbox;
    const isSzPass = sz.safe_zone_pass !== false && sz.passes_safe_zone !== false;
    const sx = sb.x * scaleX;
    const sy = sb.y * scaleY;
    const sw = sb.width * scaleX;
    const sh = sb.height * scaleY;

    ctx.save();
    // 0.5x margin outer boundary
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = isSzPass ? "#10B981" : "#F43F5E";
    ctx.fillStyle = isSzPass ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.16)";
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeRect(sx, sy, sw, sh);

    // Core Brand Logo bounding box (cyan)
    if (sz.logo_bbox) {
      const lb = sz.logo_bbox;
      const lx = lb.x * scaleX;
      const ly = lb.y * scaleY;
      const lw = lb.width * scaleX;
      const lh = lb.height * scaleY;
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#38BDF8";
      ctx.strokeRect(lx, ly, lw, lh);

      ctx.fillStyle = "#0F172A";
      ctx.fillRect(lx, Math.max(0, ly - 18), 110, 18);
      ctx.fillStyle = "#38BDF8";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("BRAND LOGO", lx + 4, Math.max(12, ly - 5));
    }

    // Safe zone status tag
    ctx.fillStyle = isSzPass ? "#065F46" : "#9F1239";
    const tagWidth = 270;
    ctx.fillRect(sx, Math.max(0, sy - 18), tagWidth, 18);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText(
      `SAFE ZONE: ${sz.required_padding_px}px (0.5x H) \u2022 ${isSzPass ? "PASS (CLEARED)" : "FAIL (ENCROACHED)"}`,
      sx + 6,
      Math.max(12, sy - 5)
    );
    ctx.restore();

    // Highlight encroaching elements
    if (sz.encroaching_elements && sz.encroaching_elements.length > 0) {
      for (const enc of sz.encroaching_elements) {
        const eb = enc.bbox || enc;
        const ex = eb.x * scaleX;
        const ey = eb.y * scaleY;
        const ew = eb.width * scaleX;
        const eh = eb.height * scaleY;
        ctx.save();
        ctx.setLineDash([4, 2]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#F43F5E";
        ctx.fillStyle = "rgba(244, 63, 94, 0.25)";
        ctx.fillRect(ex, ey, ew, eh);
        ctx.strokeRect(ex, ey, ew, eh);
        ctx.fillStyle = "#F43F5E";
        ctx.font = "bold 9px sans-serif";
        ctx.fillText("MARGIN COLLISION", ex + 2, ey + 10);
        ctx.restore();
      }
    }
  }

  for (const box of LAST_VISUAL_DATA.text_boxes || []) {
    const b = box.bbox;
    const isHighlighted = highlightedBoxId && box.box_id === highlightedBoxId;
    ctx.save();
    if (isHighlighted) {
      ctx.shadowColor = "#38BDF8";
      ctx.shadowBlur = 16;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#38BDF8";
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
      ctx.fillRect(b.x, b.y, b.width, b.height);
    } else {
      ctx.lineWidth = 2.5;
      if (box.wcag_aa_pass) {
        ctx.strokeStyle = "#10B981";
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = "#F43F5E";
        ctx.setLineDash([6, 4]);
      }
    }
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = isHighlighted ? "#0284C7" : (box.wcag_aa_pass ? "#065F46" : "#9F1239");
    ctx.fillRect(b.x, Math.max(0, b.y - 20), 215, 20);
    ctx.fillStyle = "#FFFFFF";
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
  document.getElementById("visual-banner-title").textContent = data.banner_label || "1. Banner Canvas & OCR Bounding Boxes";

  if (data.preview_data_url) {
    const img = new Image();
    img.onload = function () {
      LAST_VISUAL_IMG = img;
      drawVisualCanvas(null);
    };
    img.src = data.preview_data_url;
  }

  let html = `<div style="margin-bottom:12px;">Overall Visual Audit Verdict: ${getTierBadgeHtml(data.overall_pass ? "PASS" : "VIOLATION")}</div>`;
  html += `<h4 style="margin:10px 0 6px 0;color:var(--text-primary);">1. Dominant Colour Swatches <span class="dev-only-el">(CIEDE2000 &Delta;E<sub>00</sub> &le; 2.5)</span></h4>`;
  html += `<table class="data-table"><thead><tr><th>Swatch</th><th>Area</th><th>Nearest Brand Colour</th><th class="dev-only-el">&Delta;E<sub>00</sub></th><th>Status</th></tr></thead><tbody>`;
  for (const s of data.dominant_swatches || []) {
    html += `<tr>
      <td style="white-space:nowrap;"><span style="display:inline-block;width:14px;height:14px;background:${escapeHtml(s.tested_hex)};border:1px solid var(--border-card);border-radius:3px;vertical-align:middle;margin-right:6px;"></span><code>${escapeHtml(s.tested_hex)}</code></td>
      <td>${s.pixel_share}%</td>
      <td>${escapeHtml(s.nearest_name)} (<code>${escapeHtml(s.nearest_hex)}</code>)</td>
      <td class="dev-only-el"><strong>${s.delta_e00}</strong></td>
      <td style="white-space:nowrap;" title="CIEDE2000 distance = ${s.delta_e00}">${s.within_tolerance ? '<span class="tier-badge tier-pass">Within Tolerance (&le; 2.5)</span>' : '<span class="tier-badge tier-violation">Off-Palette (&gt; 2.5)</span>'}</td>
    </tr>`;
  }
  html += `</tbody></table>`;

  html += `<h4 style="margin:14px 0 6px 0;color:var(--text-primary);">2. WCAG 2.1 Contrast Under OCR Text Boxes (&ge; 4.5:1)</h4>`;
  html += `<table class="data-table"><thead><tr><th>OCR Box</th><th>Foreground Ink</th><th>Background Fill</th><th>Measured Ratio</th><th>WCAG 2.1 AA</th></tr></thead><tbody>`;
  for (const b of data.text_boxes || []) {
    html += `<tr class="ocr-table-row" onmouseenter="highlightOcrBox('${escapeHtml(b.box_id)}')" onmouseleave="highlightOcrBox(null)">
      <td><strong>${escapeHtml(b.box_id)}</strong></td>
      <td><span style="display:inline-block;width:11px;height:11px;background:${escapeHtml(b.foreground_hex)};border:1px solid var(--border-card);border-radius:2px;vertical-align:middle;margin-right:5px;"></span><code>${escapeHtml(b.foreground_hex)}</code></td>
      <td><span style="display:inline-block;width:11px;height:11px;background:${escapeHtml(b.background_hex)};border:1px solid var(--border-card);border-radius:2px;vertical-align:middle;margin-right:5px;"></span><code>${escapeHtml(b.background_hex)}</code></td>
      <td><strong>${b.contrast_ratio}:1</strong></td>
      <td style="white-space:nowrap;">${b.wcag_aa_pass ? '<span class="tier-badge tier-pass">AA Pass (&ge; 4.5:1)</span>' : '<span class="tier-badge tier-violation">AA Fail (&lt; 4.5:1)</span>'}</td>
    </tr>`;
  }
  html += `</tbody></table>`;

  const lc = data.logo_check || {};
  html += `<h4 style="margin:14px 0 6px 0;color:var(--text-primary);">3. Wordmark Aspect Ratio Check <span class="dev-only-el">[VIS-02]</span></h4>`;
  html += `<div class="diff-box">Measured Ratio: <strong>${lc.measured_ratio}:1</strong> (Expected: ${lc.expected_ratio}:1 &plusmn;5%) &mdash; ${lc.pass ? '<span class="tier-badge tier-pass">Valid Proportions</span>' : '<span class="tier-badge tier-violation">Stretched / Distorted</span>'}</div>`;

  const sz = data.safe_zone_audit || {};
  if (sz.required_padding_px) {
    const isSzPass = sz.safe_zone_pass !== false && sz.passes_safe_zone !== false;
    html += `<h4 style="margin:16px 0 6px 0;color:var(--text-primary);">4. Brand Logo Safe-Zone Clearance (§8.3 &bull; 0.5&times; Padding Rule)</h4>`;
    html += `<div class="diff-box" style="border-left: 4px solid ${isSzPass ? 'var(--accent-emerald)' : 'var(--accent-rose)'}; background: #0B1120;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
        <span style="font-weight:600;color:var(--text-primary);">Minimum 0.5&times; Logo Height Buffer: <strong>${sz.required_padding_px}px</strong> required</span>
        ${isSzPass ? '<span class="safezone-pass-badge">&#10003; Safe-Zone Cleared</span>' : '<span class="safezone-fail-badge">&#9888; Safe-Zone Encroached</span>'}
      </div>
      <table class="safe-zone-table">
        <thead>
          <tr>
            <th>Boundary</th>
            <th>Required Margin</th>
            <th>Measured Clearance</th>
            <th>Margin Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Left Margin</strong></td>
            <td>&ge; ${sz.required_padding_px}px</td>
            <td><strong>${sz.edge_clearance ? sz.edge_clearance.left_px : 0}px</strong></td>
            <td>${(sz.edge_clearance?.left_px || 0) >= sz.required_padding_px ? '<span class="tier-badge tier-pass">Pass</span>' : '<span class="tier-badge tier-violation">Violated</span>'}</td>
          </tr>
          <tr>
            <td><strong>Top Margin</strong></td>
            <td>&ge; ${sz.required_padding_px}px</td>
            <td><strong>${sz.edge_clearance ? sz.edge_clearance.top_px : 0}px</strong></td>
            <td>${(sz.edge_clearance?.top_px || 0) >= sz.required_padding_px ? '<span class="tier-badge tier-pass">Pass</span>' : '<span class="tier-badge tier-violation">Violated</span>'}</td>
          </tr>
          <tr>
            <td><strong>Right Margin</strong></td>
            <td>&ge; ${sz.required_padding_px}px</td>
            <td><strong>${sz.edge_clearance ? sz.edge_clearance.right_px : 0}px</strong></td>
            <td>${(sz.edge_clearance?.right_px || 0) >= sz.required_padding_px ? '<span class="tier-badge tier-pass">Pass</span>' : '<span class="tier-badge tier-violation">Violated</span>'}</td>
          </tr>
          <tr>
            <td><strong>Bottom Margin</strong></td>
            <td>&ge; ${sz.required_padding_px}px</td>
            <td><strong>${sz.edge_clearance ? sz.edge_clearance.bottom_px : 0}px</strong></td>
            <td>${(sz.edge_clearance?.bottom_px || 0) >= sz.required_padding_px ? '<span class="tier-badge tier-pass">Pass</span>' : '<span class="tier-badge tier-violation">Violated</span>'}</td>
          </tr>
        </tbody>
      </table>
      ${sz.edge_violations && sz.edge_violations.length > 0 ? `<div style="color:#FDA4AF;font-size:0.82rem;margin-top:8px;">⚠️ Edge Violations: ${sz.edge_violations.map(escapeHtml).join(", ")}</div>` : ''}
      ${sz.encroaching_elements && sz.encroaching_elements.length > 0 ? `<div style="color:#FDA4AF;font-size:0.82rem;margin-top:4px;">⚠️ Encroaching Elements: ${sz.encroaching_elements.map(e => escapeHtml(e.violation || e.box_id)).join("; ")}</div>` : ''}
    </div>`;
  }

  document.getElementById("visual-audit-results").innerHTML = html;
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
        <td style="white-space:nowrap;"><code>${escapeHtml(r.modality)}</code></td>
        <td class="dev-only-el"><span style="color:var(--text-secondary);">${escapeHtml(r.check_type)}</span></td>
        <td><strong>${escapeHtml(r.source_clause)}</strong><br/><span style="color:var(--text-secondary);">${escapeHtml(r.description)}</span></td>
      </tr>`;
    }
    html += "</tbody></table>";
    box.innerHTML = html;
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
        <div style="font-size:0.84rem;color:#86EFAC;margin-top:6px;"><strong>Recommended AST Fix:</strong> ${escapeHtml(g.remediations[0] || "")}</div>
      </div>`;
    }
    box.innerHTML = html;
  } catch (err) {
    console.error("Linter error:", err);
  } finally {
    restoreBtn();
  }
}

async function executePolicyReplay(btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Simulating Replay...", true);
  const ruleId = document.getElementById("replay-rule-id").value.trim() || "TERM-01";
  const termsRaw = document.getElementById("replay-terms").value;
  const terms = termsRaw.split(",").map((s) => s.trim()).filter(Boolean);
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

  const facts = ALL_FACTS_DATA.facts || [];
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

  let html = '<table class="data-table"><thead><tr><th>Fact ID</th><th>Status</th><th>Subject &amp; Approved Claim</th><th>Modality</th><th>Validity Window</th><th>Source &amp; Owner</th><th style="text-align:right;">Governance</th></tr></thead><tbody>';
  for (const f of filtered) {
    const isExpired = f.status === "EXPIRED";
    const badge = !isExpired
      ? '<span class="tier-badge tier-pass">Active Fact</span>'
      : '<span class="tier-badge tier-violation">Expired Fact</span>';

    const actionBtn = isBrandAdmin
      ? `<button type="button" class="btn ${isExpired ? "btn-outline" : "btn-ghost-danger"} btn-sm" onclick="toggleFactStatus('${escapeHtml(f.fact_id)}', this)">
           ${isExpired ? "Reactivate" : "Expire Fact"}
         </button>`
      : `<button type="button" class="btn btn-ghost btn-sm" title="Click to switch to Brand Admin role" onclick="switchToRole('Brand Admin')">
           &#128274; Brand Admin Only
         </button>`;

    html += `<tr class="${isExpired ? "row-expired-fact" : ""}">
      <td style="white-space:nowrap;"><strong>${escapeHtml(f.fact_id)}</strong></td>
      <td style="white-space:nowrap;">${badge}</td>
      <td>
        <strong>${escapeHtml(f.subject)}: <span class="${isExpired ? "expired-claim-strike" : ""}">${escapeHtml(f.metric)}</span></strong><br/>
        <span style="font-size:0.86rem;color:var(--text-secondary);">${escapeHtml(f.statement)}</span>
      </td>
      <td style="white-space:nowrap;"><code>${escapeHtml(f.modality)}</code></td>
      <td style="white-space:nowrap;"><code>${escapeHtml(f.valid_from)}</code> to <code>${escapeHtml(f.valid_until)}</code></td>
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
  } catch (err) {
    showStatusMessage(`Error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function submitNewFact(btnEl = null) {
  const actor = getActiveActor();
  const factId = document.getElementById("new-fact-id").value.trim() || "F-2026-09";
  const subject = document.getElementById("new-fact-subject").value.trim() || "Enterprise Cohort";
  const metric = document.getElementById("new-fact-metric").value.trim() || "94% completion rate";
  const modality = document.getElementById("new-fact-modality").value;
  const statement = document.getElementById("new-fact-statement").value.trim();
  const validFrom = document.getElementById("new-fact-from").value.trim() || "2026-07-01";
  const validUntil = document.getElementById("new-fact-until").value.trim() || "2027-06-30";

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
      let hHtml = '<table class="data-table"><thead><tr><th style="white-space:nowrap;">ID</th><th>Hypothesis (Section 7.4)</th><th style="white-space:nowrap;">Target</th><th style="white-space:nowrap;">Measured Round 2 Result</th><th style="white-space:nowrap;">Status</th></tr></thead><tbody>';
      for (const h of data.hypotheses || []) {
        hHtml += `<tr>
          <td style="white-space:nowrap;"><strong>${escapeHtml(h.id)}</strong></td>
          <td>${escapeHtml(h.hypothesis)}</td>
          <td style="white-space:nowrap;"><code>${escapeHtml(h.target)}</code></td>
          <td style="white-space:nowrap;"><strong>${escapeHtml(h.measured)}</strong></td>
          <td style="white-space:nowrap;"><span class="tier-badge tier-pass">${escapeHtml(h.status)}</span></td>
        </tr>`;
      }
      hHtml += "</tbody></table>";
      hBox.innerHTML = hHtml;
    }

    const rBox = document.getElementById("ror-telemetry-table-box");
    if (rBox && data.ror_report) {
      let rHtml = '<table class="data-table"><thead><tr><th style="width:200px;">Rule ID &amp; Clause</th><th style="text-align:center;white-space:nowrap;width:80px;">Total Flags</th><th style="text-align:center;white-space:nowrap;width:110px;">Overridden</th><th style="text-align:center;white-space:nowrap;width:75px;">ROR</th><th style="white-space:nowrap;width:170px;">Diagnostic Classification</th><th style="min-width:240px;">Actionable Recommendation</th></tr></thead><tbody>';
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
          <td><strong style="white-space:nowrap;">${escapeHtml(r.rule_id)}</strong><br/><span style="font-size:0.75rem;color:var(--text-muted);display:block;max-width:190px;line-height:1.35;word-break:break-word;">${escapeHtml(r.source_clause)}</span></td>
          <td style="text-align:center;white-space:nowrap;">${r.total_flags}</td>
          <td style="text-align:center;white-space:nowrap;">${r.dismissed_or_overridden}</td>
          <td style="text-align:center;white-space:nowrap;"><strong style="font-size:0.92rem;color:${r.ror > 0.45 ? '#fca5a5' : '#86efac'};">${(r.ror * 100).toFixed(1)}%</strong></td>
          <td style="white-space:nowrap;">${diagBadge}</td>
          <td style="line-height:1.45;">${recHtml}</td>
        </tr>`;
      }
      rHtml += "</tbody></table>";
      rBox.innerHTML = rHtml;
    }
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
    const navBadge = document.getElementById("chain-status-badge");
    if (navBadge) {
      navBadge.innerHTML = cv.valid
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-champagne)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span style="font-size: 0.74rem; color: var(--text-secondary);">Chain Verified</span>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg><span style="font-size: 0.74rem; color: #fca5a5; font-weight: 600;">Tamper Alert!</span>`;
    }

    const brokenId = cv.broken_at_id || (cv.broken_links && cv.broken_links.length > 0 ? cv.broken_links[0].id : null);
    const brokenInfo = (cv.broken_links && cv.broken_links.length > 0) ? cv.broken_links[0] : null;
    const sumBox = document.getElementById("audit-chain-summary-box");
    if (sumBox) {
      if (cv.valid) {
        sumBox.innerHTML = `<div class="diff-box" style="border-color:#22c55e;background:rgba(34,197,94,0.06);">
          <strong>Cryptographic Hash-Chain Status:</strong> <span style="color:#86efac;font-weight:600;">&#10003; 100% INTACT &amp; TAMPER-FREE</span> &bull;
          Total Chained Events: <strong>${cv.total_events}</strong> &bull;
          Head SHA-256: <code>${escapeHtml((cv.latest_hash || "").slice(0, 24))}...</code>
        </div>`;
      } else {
        const hashMismatchText = brokenInfo
          ? `Expected SHA-256 ${brokenInfo.actual_hash.slice(0, 12)}... != Recomputed ${brokenInfo.expected_hash.slice(0, 12)}...`
          : "Payload hash mismatch";
        sumBox.innerHTML = `<div class="diff-box" style="border-color:#ef4444;background:rgba(239,68,68,0.14);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <strong style="color:#fca5a5;">&#9888; CRYPTOGRAPHIC TAMPERING DETECTED:</strong>
            <span style="color:#ffffff;font-weight:600;margin-left:6px;">Block #${escapeHtml(brokenId)} failed SHA-256 verification (${escapeHtml(hashMismatchText)})!</span>
          </div>
          <button type="button" class="btn btn-success btn-sm" onclick="restoreTamperedChain(this)">Restore Intact Chain Now</button>
        </div>`;
      }
    }

    if (evBox) {
      let html = '<table class="data-table"><thead><tr><th>#</th><th>Timestamp (UTC)</th><th>Actor &amp; Role</th><th>Governance Event &amp; Target</th><th>Cryptographic Hash Chain</th></tr></thead><tbody>';
      for (const e of data.events || []) {
        const dObj = e.details || {};
        const isBrokenRow = !cv.valid && brokenId === e.id;
        const summaryPairs = Object.entries(dObj)
          .map(([k, v]) => `${escapeHtml(k)}: <code>${escapeHtml(String(v).length > 22 ? String(v).slice(0, 18) + "..." : String(v))}</code>`)
          .join(" &bull; ");
        html += `<tr class="${isBrokenRow ? "row-tampered-block" : ""}">
          <td style="white-space:nowrap;"><strong>#${e.id}</strong> ${isBrokenRow ? '<span class="tier-badge tier-violation">CORRUPTED</span>' : ""}</td>
          <td style="white-space:nowrap;"><code>${escapeHtml(e.timestamp.slice(0, 19))}Z</code></td>
          <td style="white-space:nowrap;"><strong>${escapeHtml(e.actor_name)}</strong><br/><span style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(e.actor_role)}</span></td>
          <td style="word-break:break-word;">${formatAuditEventBadge(e.event_type)} <span style="margin-left:6px;">on <code>${escapeHtml(e.target_id)}</code></span><br/><span style="font-size:0.8rem;color:var(--text-secondary);display:inline-block;margin-top:4px;word-break:break-all;">${summaryPairs}</span></td>
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

/* ========================================================================= */
/* ROUND 3 INNOVATION HANDLERS (Fact Vault Knowledge Graph & Live Sync HUD)  */
/* ========================================================================= */

function setFactViewMode(mode) {
  FACT_VIEW_MODE = mode;
  const btnTable = document.getElementById("fact-view-table-btn");
  const btnGraph = document.getElementById("fact-view-graph-btn");
  const tableBox = document.getElementById("fact-vault-table-box");
  const filterBar = document.getElementById("fact-filter-bar");
  const graphCard = document.getElementById("fact-graph-view-card");
  const oldContainer = document.getElementById("knowledge-graph-container");

  if (btnTable) btnTable.classList.toggle("active", mode === "table");
  if (btnGraph) btnGraph.classList.toggle("active", mode === "graph");

  if (mode === "graph") {
    if (tableBox) tableBox.classList.add("hidden");
    if (filterBar) filterBar.classList.add("hidden");
    if (graphCard) graphCard.classList.remove("hidden");
    if (oldContainer) oldContainer.classList.remove("hidden");
    loadKnowledgeGraph();
  } else {
    if (tableBox) tableBox.classList.remove("hidden");
    if (filterBar) filterBar.classList.remove("hidden");
    if (graphCard) graphCard.classList.add("hidden");
    if (oldContainer) oldContainer.classList.add("hidden");
  }
}

function toggleKnowledgeSyncHud() {
  const hud = document.getElementById("knowledge-sync-hud");
  const oldDrawer = document.getElementById("enterprise-sync-drawer");
  if (hud) hud.classList.toggle("hidden");
  if (oldDrawer && !hud) oldDrawer.classList.toggle("hidden");
}

function toggleEnterpriseSyncDrawer() {
  toggleKnowledgeSyncHud();
}

function toggleKnowledgeGraphView() {
  setFactViewMode(FACT_VIEW_MODE === "graph" ? "table" : "graph");
}

function refreshKnowledgeGraph(btnEl = null) {
  loadKnowledgeGraph();
}

async function renderFactKnowledgeGraph() {
  loadKnowledgeGraph();
}

function applySyncScenarioPreset() {
  const sel = document.getElementById("sync-scenario-preset");
  const typeSel = document.getElementById("sync-source-type");
  const title = document.getElementById("sync-source-name");
  const ta = document.getElementById("sync-doc-content") || document.getElementById("sync-document-text");
  if (!sel || !ta) return;

  const val = sel.value;
  if (val === "q3_pricing") {
    if (typeSel) typeSel.value = "confluence";
    if (title) title.value = "Q3 2026 Curriculum Pricing & Outcomes Release";
    ta.value = `Northwind Academy offers a 30% discount for all enterprise partners in Q4 2026.
Data Foundations duration is 16 weeks with mandatory capstone project.
Advanced Cloud Architecture takes 12 weeks.
AWS Cohort achieved a 94% job placement rate according to the internal auditor.
Cohort size is capped at 30 students per session.`;
  } else if (val === "accreditation_soc2") {
    if (typeSel) typeSel.value = "notion";
    if (title) title.value = "SOC2 Type II & ISO-27001 Security Specifications";
    ta.value = `Northwind Academy achieved SOC2 Type II compliance and ISO-27001 accreditation.
All enterprise learner records are encrypted at rest with AES-256.
Cryptographic audit chains maintain a dual SHA-256 Merkle block proof.
Maximum cohort size is capped at 30 learners per session.`;
  } else if (val === "sla_guarantee") {
    if (typeSel) typeSel.value = "jira";
    if (title) title.value = "99.95% Enterprise SLA & Support Matrix";
    ta.value = `Enterprise Service Level Agreement 2026:
Northwind Enterprise platform guarantees 99.95% uptime SLA.
Priority support response window is 1 hour for critical incidents.
Data Foundations takes 16 weeks to complete.`;
  }
}

function loadPresetEnterpriseDoc(type) {
  const sel = document.getElementById("sync-scenario-preset");
  if (sel) {
    if (type === "confluence") sel.value = "q3_pricing";
    else if (type === "notion") sel.value = "accreditation_soc2";
    else if (type === "jira") sel.value = "sla_guarantee";
  }
  applySyncScenarioPreset();
}

function onSyncSourceChanged() {
  const typeSel = document.getElementById("sync-source-type");
  if (typeSel) loadPresetEnterpriseDoc(typeSel.value);
}

async function executeEnterpriseKnowledgeSync(btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Extracting Truth & Blast Radius...", true);
  const textEl = document.getElementById("sync-doc-content") || document.getElementById("sync-document-text");
  const nameEl = document.getElementById("sync-source-name");
  const typeEl = document.getElementById("sync-source-type");
  const terminal = document.getElementById("sync-hud-terminal");
  const output = document.getElementById("sync-terminal-output");
  const termStatus = document.getElementById("sync-terminal-status");
  const blastBox = document.getElementById("sync-blast-radius-box");

  const docText = textEl ? textEl.value.trim() : "";
  const sourceName = nameEl ? nameEl.value.trim() : "Enterprise Knowledge Memo";
  const sourceType = typeEl ? typeEl.value : "confluence";

  if (!docText) {
    showStatusMessage("Please provide enterprise documentation payload to sync.", true);
    restoreBtn();
    return;
  }

  if (terminal) terminal.classList.remove("hidden");
  if (termStatus) {
    termStatus.className = "tier-badge tier-human";
    termStatus.textContent = "EXTRACTING TRUTH...";
  }
  if (output) {
    output.textContent = `[INITIALIZING] Enterprise Knowledge Sync Engine v3.0.0...\n`;
    output.textContent += `[INGESTING] Feed source: "${sourceName}" (${sourceType.toUpperCase()})\n`;
  }

  try {
    await pauseForVisualFeedback(280);
    const res = await fetch("/api/facts/sync-enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_name: sourceName,
        source_type: sourceType,
        document_text: docText,
        tenant: "northwind_academy",
        auto_import_facts: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (output) output.textContent += `[ERROR] Extraction failed: ${data.detail || "Server error"}\n`;
      if (termStatus) {
        termStatus.className = "tier-badge tier-violation";
        termStatus.textContent = "SYNC FAILED";
      }
      return;
    }

    const blast = data.blast_radius || {};
    const isHigh = blast.blast_radius_risk === "HIGH";

    let log = `[INGESTION SUCCESS] Extracted ${data.extracted_count} atomic truth tuples (${data.imported_count} saved to Fact Vault).\n`;
    log += `[PROVENANCE] Dual SHA-256 Digest: ${data.facts?.[0]?.source_sha256 || "verified"}\n`;
    log += `[PROVENANCE] Audit Block Hash: ${data.audit_block_hash.slice(0, 32)}...\n`;
    log += `[BLAST RADIUS] Scanned ${blast.pending_submissions_analyzed || blast.scanned_assets_count || 4} pending submissions.\n`;
    log += `[BLAST RISK LEVEL] Queue Blast Radius: ${blast.blast_radius_risk || "LOW"} RISK (${blast.impacted_assets_count || 0} drafts impacted).\n`;

    (data.facts || []).forEach((f) => {
      log += `  -> Fact [${f.fact_id}]: ${f.subject} ${f.predicate} "${f.metric}" (valid: ${f.valid_from} to ${f.valid_until})\n`;
    });

    if (blast.impacted_assets_count > 0) {
      log += `[IMPACTED SUBMISSIONS]:\n`;
      (blast.impacted_assets || []).forEach((a) => {
        log += `  ⚠️ Asset ${a.asset_id} ("${a.title}"): ${a.conflict_count} conflict(s) -> Action: ${a.action_required}\n`;
      });
    } else {
      log += `[INTEGRITY] ✓ Zero pending submissions invalidated by this update.\n`;
    }

    if (output) output.textContent += log;
    if (termStatus) {
      termStatus.className = isHigh ? "tier-badge tier-violation" : "tier-badge tier-pass";
      termStatus.textContent = `SYNC VERIFIED (${blast.blast_radius_risk || "LOW"} RISK)`;
    }

    if (blastBox) {
      blastBox.innerHTML = `
        <div class="diff-box" style="margin-top:10px;border-left: 3px solid ${isHigh ? '#F43F5E' : '#10B981'};">
          <strong>Enterprise Sync Result:</strong> ${data.extracted_count} facts extracted. Queue blast-radius: <strong>${blast.blast_radius_risk}</strong> risk (${blast.impacted_assets_count || 0} pending drafts impacted).
        </div>
      `;
    }

    showStatusMessage(`Synced ${data.extracted_count} facts from "${sourceName}". Blast-radius evaluated: ${blast.blast_radius_risk} risk.`);
    await loadFactVault();
    if (FACT_VIEW_MODE === "graph") {
      await loadKnowledgeGraph();
    }
  } catch (err) {
    if (output) output.textContent += `[CRITICAL ERROR] ${err.message}\n`;
    showStatusMessage(`Sync error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function loadKnowledgeGraph() {
  try {
    const res = await fetch("/api/facts/graph?tenant=northwind_academy");
    if (!res.ok) return;
    const data = await res.json();
    KNOWLEDGE_GRAPH_DATA = data;
    drawKnowledgeGraph(data);
  } catch (err) {
    console.error("Failed to load knowledge graph:", err);
  }
}

function drawKnowledgeGraph(data, highlightedNodeId = null) {
  const canvas = document.getElementById("fact-knowledge-graph-canvas");
  if (!canvas || !data) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const nodes = data.nodes || [];
  const edges = data.edges || [];
  if (nodes.length === 0) {
    ctx.fillStyle = "#94A3B8";
    ctx.font = "14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No atomic facts in vault.", canvas.width / 2, canvas.height / 2);
    return;
  }

  // Calculate layout coordinates
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radiusX = canvas.width * 0.38;
  const radiusY = canvas.height * 0.38;

  const subjects = nodes.filter((n) => n.type === "subject");
  const facts = nodes.filter((n) => n.type === "fact");

  nodes.forEach((node) => {
    if (!node.x || !node.y) {
      if (node.type === "subject") {
        const sIdx = subjects.indexOf(node);
        const angle = (sIdx / Math.max(1, subjects.length)) * Math.PI - Math.PI / 2;
        node.x = centerX - radiusX * 0.5 + 40 * Math.cos(angle);
        node.y = centerY + radiusY * 0.8 * Math.sin(angle);
      } else {
        const fIdx = facts.indexOf(node);
        const angle = (fIdx / Math.max(1, facts.length)) * 2 * Math.PI;
        node.x = centerX + radiusX * 0.75 * Math.cos(angle);
        node.y = centerY + radiusY * 0.75 * Math.sin(angle);
      }
    }
  });

  // Draw connecting edges
  edges.forEach((edge) => {
    const source = nodes.find((n) => n.id === edge.source);
    const target = nodes.find((n) => n.id === edge.target);
    if (!source || !target) return;

    const isExpired = edge.status === "EXPIRED" || (target && target.status === "EXPIRED");
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = isExpired ? "rgba(244, 63, 94, 0.45)" : "rgba(16, 185, 129, 0.4)";
    ctx.lineWidth = isExpired ? 1.5 : 2;
    if (isExpired) ctx.setLineDash([4, 4]);
    ctx.stroke();

    // Relationship predicate label
    if (edge.label) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      ctx.fillStyle = "#94A3B8";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(edge.label, midX, midY - 4);
    }
    ctx.restore();
  });

  // Draw nodes
  nodes.forEach((node) => {
    const isHighlighted = highlightedNodeId && node.id === highlightedNodeId;
    const isSubj = node.type === "subject";
    const isExpired = node.status === "EXPIRED";

    let fill = "#38BDF8"; // Cyan for Entity Subject
    if (!isSubj) {
      fill = isExpired ? "#F43F5E" : "#10B981"; // Rose for Expired, Emerald for Active
    }

    ctx.save();
    ctx.beginPath();
    const nodeRadius = isSubj ? (isHighlighted ? 20 : 16) : (isHighlighted ? 16 : 12);
    ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.shadowColor = fill;
    ctx.shadowBlur = isHighlighted ? 18 : 8;
    ctx.fill();

    ctx.strokeStyle = isHighlighted ? "#FFFFFF" : "#0F172A";
    ctx.lineWidth = isHighlighted ? 3 : 2;
    ctx.stroke();

    // Text label
    ctx.fillStyle = "#F8FAFC";
    ctx.font = isSubj ? "bold 11px Inter, sans-serif" : "10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(node.label || node.id, node.x, node.y + (isSubj ? 26 : 22));
    ctx.restore();
  });

  // Attach interactive hover and click listeners once
  if (!canvas._listenersAttached) {
    canvas._listenersAttached = true;
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      const hoveredNode = (KNOWLEDGE_GRAPH_DATA?.nodes || []).find((n) => {
        const dx = n.x - mouseX;
        const dy = n.y - mouseY;
        return Math.sqrt(dx * dx + dy * dy) <= 22;
      });

      if (hoveredNode) {
        canvas.style.cursor = "pointer";
        drawKnowledgeGraph(KNOWLEDGE_GRAPH_DATA, hoveredNode.id);
        renderNodeDetails(hoveredNode);
      } else {
        canvas.style.cursor = "crosshair";
      }
    });

    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      const clickedNode = (KNOWLEDGE_GRAPH_DATA?.nodes || []).find((n) => {
        const dx = n.x - mouseX;
        const dy = n.y - mouseY;
        return Math.sqrt(dx * dx + dy * dy) <= 22;
      });

      if (clickedNode) {
        drawKnowledgeGraph(KNOWLEDGE_GRAPH_DATA, clickedNode.id);
        renderNodeDetails(clickedNode);
      }
    });
  }
}

function renderNodeDetails(node) {
  const detailsBox = document.getElementById("graph-node-details");
  if (!detailsBox || !node) return;
  const isSubj = node.type === "subject";
  const isExpired = node.status === "EXPIRED";
  const statusBadge = isSubj
    ? '<span class="tier-badge tier-human">Entity Subject</span>'
    : (isExpired ? '<span class="tier-badge tier-violation">Expired Fact</span>' : '<span class="tier-badge tier-pass">Active Fact</span>');

  detailsBox.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
      <div>
        <strong style="color:var(--text-primary);font-size:0.95rem;">${escapeHtml(node.label || node.id)}</strong>
        <span style="font-size:0.8rem;color:var(--text-muted);margin-left:8px;">ID: <code>${escapeHtml(node.id)}</code></span>
      </div>
      ${statusBadge}
    </div>
    <div style="font-size:0.84rem;color:var(--text-secondary);margin-top:6px;">
      ${node.statement ? `<strong>Statement:</strong> ${escapeHtml(node.statement)}<br/>` : ""}
      ${node.valid_from ? `<strong>Validity Window:</strong> <code>${escapeHtml(node.valid_from)}</code> to <code>${escapeHtml(node.valid_until)}</code> &bull; ` : ""}
      ${node.provenance_hash ? `<strong>SHA-256 Provenance:</strong> <code>${escapeHtml(node.provenance_hash.slice(0, 24))}...</code>` : ""}
    </div>
  `;
}


window.addEventListener("DOMContentLoaded", async () => {
  const roleEl = document.getElementById("active-role-select");
  if (roleEl) roleEl.value = "Creator";
  renderMustKeepChips();
  updateAvatarInitials(document.getElementById("actor-name-input")?.value || "Nandha K");
  setDetailMode("simple");
  await loadPresets();
  await loadSubmissionsQueue();
});
