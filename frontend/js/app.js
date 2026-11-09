/* VeriLoom Round 2 MVP Reviewer Workbench Controller (v18.0) */
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

function showStatusMessage(msg, isError = false) {
  const banner = document.getElementById("status-banner");
  if (!banner) return;
  banner.classList.remove("hidden");
  banner.style.borderLeftColor = isError ? "#ef4444" : "#E8D59E";
  banner.style.background = isError ? "rgba(239, 68, 68, 0.14)" : "#333333";
  banner.style.color = isError ? "#fca5a5" : "#FFFFFF";
  banner.textContent = msg;
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
            ${isCreatorRole ? `<div class="rbac-lock-notice">&#128274; Switch Role to Brand Manager or Legal Reviewer to grant waivers</div>` : ""}
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
/* TAB 2: VISUAL & CONTRAST INSPECTOR (WITH HOVER SYNC & CUSTOM UPLOAD)      */
/* ========================================================================= */
function drawVisualCanvas(highlightedBoxId = null) {
  const canvas = document.getElementById("visual-inspector-canvas");
  if (!canvas || !LAST_VISUAL_DATA || !LAST_VISUAL_IMG) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(LAST_VISUAL_IMG, 0, 0, canvas.width, canvas.height);

  // Safe-Zone Clearance Overlay (0.5x Logo Height Margin)
  const sz = LAST_VISUAL_DATA.safe_zone_audit;
  if (sz && sz.safe_zone_bbox) {
    const scaleX = canvas.width / (LAST_VISUAL_DATA.image_dimensions?.width || 1200);
    const scaleY = canvas.height / (LAST_VISUAL_DATA.image_dimensions?.height || 630);
    const sb = sz.safe_zone_bbox;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2.5;
    const isSzPass = sz.safe_zone_pass !== false && sz.passes_safe_zone !== false;
    ctx.strokeStyle = isSzPass ? "#10B981" : "#F43F5E";
    ctx.fillStyle = isSzPass ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.16)";
    ctx.strokeRect(sb.x * scaleX, sb.y * scaleY, sb.width * scaleX, sb.height * scaleY);
    ctx.fillRect(sb.x * scaleX, sb.y * scaleY, sb.width * scaleX, sb.height * scaleY);
    ctx.fillStyle = isSzPass ? "#10B981" : "#F43F5E";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText(
      `SAFE ZONE (${sz.required_padding_px}px buffer: ${isSzPass ? "PASS" : "FAIL"})`,
      sb.x * scaleX + 4,
      Math.max(12, sb.y * scaleY - 4)
    );
    ctx.restore();
  }

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
    html += `<h4 style="margin:14px 0 6px 0;color:var(--text-primary);">4. Logo Safe-Zone Clearance &amp; Whitespace Auditor <span class="dev-only-el">[VIS-03 &bull; 0.5&times; Padding Rule]</span></h4>`;
    html += `<div class="diff-box" style="border-left: 3px solid ${isSzPass ? '#10B981' : '#F43F5E'}; background: rgba(255,255,255,0.02);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span>Required Margin: <strong>${sz.required_padding_px}px</strong> (${Math.round((sz.clearance_ratio || 0.5) * 100)}% of logo height)</span>
        <span>${isSzPass ? '<span class="tier-badge tier-pass">Clearance Pass</span>' : '<span class="tier-badge tier-violation">Safe-Zone Encroached</span>'}</span>
      </div>
      <div style="font-size:0.84rem;color:var(--text-muted);">
        Left: ${sz.edge_clearance ? sz.edge_clearance.left_px : 0}px &bull; Top: ${sz.edge_clearance ? sz.edge_clearance.top_px : 0}px &bull; Right: ${sz.edge_clearance ? sz.edge_clearance.right_px : 0}px &bull; Bottom: ${sz.edge_clearance ? sz.edge_clearance.bottom_px : 0}px
      </div>
      ${sz.edge_violations && sz.edge_violations.length > 0 ? `<div style="color:#f87171;font-size:0.8rem;margin-top:4px;">⚠️ ${sz.edge_violations.join(", ")}</div>` : ''}
      ${sz.encroaching_elements && sz.encroaching_elements.length > 0 ? `<div style="color:#f87171;font-size:0.8rem;margin-top:4px;">⚠️ ${sz.encroaching_elements.length} text box(es) encroach within ${sz.required_padding_px}px logo buffer.</div>` : ''}
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
      let hHtml = '<table class="data-table"><thead><tr><th>ID</th><th>Hypothesis (Section 7.4)</th><th>Target</th><th>Measured Round 2 Result</th><th>Status</th></tr></thead><tbody>';
      for (const h of data.hypotheses || []) {
        hHtml += `<tr>
          <td style="white-space:nowrap;"><strong>${escapeHtml(h.id)}</strong></td>
          <td>${escapeHtml(h.hypothesis)}</td>
          <td style="white-space:nowrap;"><code>${escapeHtml(h.target)}</code></td>
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
/* ROUND 3 INNOVATION HANDLERS (Improvements 1, 2, and 3)                    */
/* ========================================================================= */

function onGlobalJurisdictionChanged(jur) {
  const compJur = document.getElementById("sub-jurisdiction");
  if (compJur) compJur.value = jur;
  const topJur = document.getElementById("active-jurisdiction-select");
  if (topJur) topJur.value = jur;
  showStatusMessage(`Switched active regulatory regime to ${jur}. Any new or re-verified draft will be evaluated under these statutes.`);
}

function onJurisdictionChanged() {
  const compJur = document.getElementById("sub-jurisdiction");
  const topJur = document.getElementById("active-jurisdiction-select");
  if (compJur && topJur) {
    topJur.value = compJur.value;
  }
}

async function applyRegulatoryDisclosure(findingId, ruleId, disclosureText, btnEl = null) {
  if (!CURRENT_ASSET) return;
  const actor = getActiveActor();
  const restoreBtn = setButtonLoading(btnEl, "Injecting Disclosure...", false);
  try {
    await pauseForVisualFeedback(220);
    const res = await fetch(`/api/submissions/${encodeURIComponent(CURRENT_ASSET.asset_id)}/apply-disclosure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_id: CURRENT_ASSET.asset_id,
        rule_id: ruleId,
        disclosure_text: disclosureText,
        placement: "append",
        actor_name: actor.name,
        actor_role: actor.role,
      }),
    });
    const updated = await res.json();
    if (!res.ok) {
      showStatusMessage(updated.detail || "Failed to inject disclosure.", true);
      return;
    }
    showStatusMessage(`Appended statutory legal disclosure complying with ${ruleId}. Headline copy preserved intact.`);
    await selectSubmission(CURRENT_ASSET.asset_id);
    await loadSubmissionsQueue();
  } catch (err) {
    showStatusMessage(`Error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function downloadComplianceCertificate(btnEl = null) {
  if (!CURRENT_ASSET) {
    showStatusMessage("Please select an asset from the queue to download its certificate.", true);
    return;
  }
  const actor = getActiveActor();
  const restoreBtn = setButtonLoading(btnEl, "Generating Certificate...", false);
  try {
    await pauseForVisualFeedback(200);
    const res = await fetch(`/api/submissions/${encodeURIComponent(CURRENT_ASSET.asset_id)}/certificate?signer_name=${encodeURIComponent(actor.name)}&signer_role=${encodeURIComponent(actor.role)}`);
    const cert = await res.json();
    if (!res.ok) {
      showStatusMessage(cert.detail || "Certificate generation failed.", true);
      return;
    }

    const blob = new Blob([JSON.stringify(cert, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VeriLoom-Certificate-${CURRENT_ASSET.asset_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatusMessage(`Downloaded cryptographically signed Compliance Proof Certificate (${cert.certificate_id}). Digital Signature: ${cert.cryptographic_proof.digital_signature_sha256.slice(0, 16)}...`);
  } catch (err) {
    showStatusMessage(`Certificate error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

function toggleEnterpriseSyncDrawer() {
  const d = document.getElementById("enterprise-sync-drawer");
  if (d) d.classList.toggle("hidden");
}

function loadPresetEnterpriseDoc(type) {
  const ta = document.getElementById("sync-document-text");
  const title = document.getElementById("sync-source-name");
  if (!ta) return;
  if (type === "confluence") {
    if (title) title.value = "Q4 2026 Enterprise Release Memo";
    ta.value = `Northwind Academy offers a 30% discount for all enterprise partners in Q4 2026.
Data Foundations takes 16 weeks to complete.
AWS Cohort achieved a 94% job placement rate according to the internal auditor.
Cohort size is capped at 30 students per session.`;
  } else if (type === "notion") {
    if (title) title.value = "Notion 2026 Curriculum Guide v2.4";
    ta.value = `Curriculum Update 2026:
Data Foundations duration is 16 weeks with mandatory capstone.
Advanced Cloud Architecture takes 12 weeks.
All active enrollments qualify for the audited 94% job placement rate guarantee.`;
  } else if (type === "jira") {
    if (title) title.value = "Jira Annual Outcomes Audit Report 2026";
    ta.value = `Audit Verification Ticket #NW-9921:
Northwind Academy verified tuition discount is 30% for Q4 2026.
Class sizes are capped at 30 learners per cohort.`;
  }
}

async function executeEnterpriseKnowledgeSync(btnEl = null) {
  const restoreBtn = setButtonLoading(btnEl, "Syncing Truth & Blast Radius...", false);
  const textEl = document.getElementById("sync-document-text");
  const nameEl = document.getElementById("sync-source-name");
  const typeEl = document.getElementById("sync-source-type");
  const blastBox = document.getElementById("sync-blast-radius-box");
  if (!textEl || !textEl.value.trim()) {
    showStatusMessage("Please provide enterprise documentation text to sync.", true);
    restoreBtn();
    return;
  }
  if (blastBox) blastBox.innerHTML = renderAreaLoader("Extracting atomic facts, SHA-256 provenance & calculating queue blast radius...");

  try {
    await pauseForVisualFeedback(260);
    const res = await fetch("/api/facts/sync-enterprise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_name: nameEl ? nameEl.value.trim() : "Enterprise Memo",
        source_type: typeEl ? typeEl.value : "confluence",
        document_text: textEl.value.trim(),
        tenant: "northwind_academy",
        auto_import_facts: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (blastBox) blastBox.innerHTML = `<div class="diff-box" style="color:#f87171;">Error: ${escapeHtml(data.detail || "Sync failed")}</div>`;
      return;
    }

    const blast = data.blast_radius || {};
    const isHigh = blast.blast_radius_risk === "HIGH";
    let bHtml = `
    <div class="diff-box" style="margin-top:12px;border-left: 3px solid ${isHigh ? '#ef4444' : '#10B981'};background:rgba(255,255,255,0.03);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>Enterprise Sync Result: ${data.extracted_count} Facts Extracted (${data.imported_count} Saved to Fact Vault)</strong>
        <span class="tier-badge ${isHigh ? 'tier-violation' : 'tier-pass'}">Queue Blast-Radius: ${blast.blast_radius_risk || 'LOW'} RISK</span>
      </div>
      <div style="font-size:0.84rem;color:var(--text-muted);margin-bottom:6px;">
        Provenance Digest: <code>${(data.facts?.[0]?.source_sha256 || "verified").slice(0, 24)}...</code> &bull; Pending Submissions Analyzed: ${blast.pending_submissions_analyzed || 0}
      </div>
      ${blast.impacted_assets_count > 0 ? `
        <div style="margin-top:8px;">
          <strong style="color:#fca5a5;font-size:0.86rem;">⚠️ Submissions Impacted by Truth Update (${blast.impacted_assets_count}):</strong>
          <ul style="margin:4px 0;padding-left:20px;font-size:0.84rem;color:var(--text-secondary);">
            ${(blast.impacted_assets || []).map(a => `<li><strong>${escapeHtml(a.asset_id)}</strong> (${escapeHtml(a.title)}): ${a.conflict_count} conflict(s) detected &rarr; Action: <code>${a.action_required}</code></li>`).join("")}
          </ul>
        </div>
      ` : `<div style="color:#86efac;font-size:0.84rem;">✓ Zero pending submissions invalidated by this update.</div>`}
    </div>`;
    if (blastBox) blastBox.innerHTML = bHtml;
    showStatusMessage(`Synced ${data.extracted_count} facts from "${data.source_name}". Blast radius: ${blast.blast_radius_risk} risk.`);

    await loadFactVault();
    if (!document.getElementById("knowledge-graph-container")?.classList.contains("hidden")) {
      renderFactKnowledgeGraph();
    }
  } catch (err) {
    showStatusMessage(`Sync error: ${err.message}`, true);
  } finally {
    restoreBtn();
  }
}

async function toggleKnowledgeGraphView() {
  const container = document.getElementById("knowledge-graph-container");
  if (!container) return;
  const isHidden = container.classList.contains("hidden");
  if (isHidden) {
    container.classList.remove("hidden");
    await renderFactKnowledgeGraph();
  } else {
    container.classList.add("hidden");
  }
}

async function renderFactKnowledgeGraph() {
  const svg = document.getElementById("fact-graph-svg");
  if (!svg) return;
  svg.innerHTML = `<text x="450" y="160" text-anchor="middle" fill="#B3B3B3" font-size="14">Loading Knowledge Graph...</text>`;
  try {
    const res = await fetch("/api/facts/graph");
    const data = await res.json();
    const nodes = data.nodes || [];
    const edges = data.edges || [];

    if (nodes.length === 0) {
      svg.innerHTML = `<text x="450" y="160" text-anchor="middle" fill="#B3B3B3" font-size="14">No facts in vault.</text>`;
      return;
    }

    const subjects = nodes.filter(n => n.type === "subject");
    const facts = nodes.filter(n => n.type === "fact");

    const width = 900;
    const height = 320;
    const subjX = 180;
    const factX = 680;

    let svgHtml = `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#AD9C8E" />
        </marker>
      </defs>
    `;

    const posMap = new Map();
    subjects.forEach((s, idx) => {
      const y = subjects.length === 1 ? height / 2 : 50 + (idx * (height - 100)) / (subjects.length - 1);
      posMap.set(s.id, { x: subjX, y, node: s });
    });
    facts.forEach((f, idx) => {
      const y = facts.length === 1 ? height / 2 : 40 + (idx * (height - 80)) / (facts.length - 1);
      posMap.set(f.id, { x: factX, y, node: f });
    });

    for (const e of edges) {
      const p1 = posMap.get(e.source);
      const p2 = posMap.get(e.target);
      if (p1 && p2) {
        const isExpired = e.status === "EXPIRED";
        const strokeColor = isExpired ? "#ef4444" : "#10B981";
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        svgHtml += `
          <path d="M ${p1.x} ${p1.y} C ${midX} ${p1.y}, ${midX} ${p2.y}, ${p2.x} ${p2.y}" fill="none" stroke="${strokeColor}" stroke-width="1.8" stroke-dasharray="${isExpired ? '4,4' : 'none'}" marker-end="url(#arrow)" opacity="0.75" />
          <text x="${midX}" y="${midY - 4}" fill="#D4D4D4" font-size="11" text-anchor="middle" font-family="sans-serif">${escapeHtml(e.label)}</text>
        `;
      }
    }

    posMap.forEach((pos, id) => {
      const n = pos.node;
      const isSubj = n.type === "subject";
      const isExpired = n.status === "EXPIRED";
      const fill = isSubj ? "#E8D59E" : (isExpired ? "#ef4444" : "#10B981");

      svgHtml += `
        <g style="cursor:pointer;" transform="translate(${pos.x}, ${pos.y})">
          <circle r="${isSubj ? 18 : 14}" fill="${fill}" stroke="#2B2B2B" stroke-width="3" />
          <text x="${isSubj ? -26 : 22}" y="4" fill="#FFFFFF" font-size="12" font-weight="${isSubj ? '700' : '500'}" text-anchor="${isSubj ? 'end' : 'start'}" font-family="sans-serif">${escapeHtml(n.label)}</text>
        </g>
      `;
    });

    svg.innerHTML = svgHtml;
  } catch (err) {
    svg.innerHTML = `<text x="450" y="160" text-anchor="middle" fill="#ef4444" font-size="13">Failed to load graph: ${escapeHtml(err.message)}</text>`;
  }
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
