/* VeriLoom AI Copilot v2.0: 25-Key Groq Reasoning, Voice STT, Memory, Cross-Page Connectivity & CUA */
(function () {
  const SESSION_STORAGE_KEY = "veriloom_copilot_session_id";

  function generateUniqueSessionId() {
    const rand = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).substring(2, 12);
    return `vl_${Date.now().toString(36)}_${rand}`;
  }

  function getOrInitSessionId() {
    try {
      let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!sid || sid === "veriloom-default" || sid === "default") {
        sid = generateUniqueSessionId();
        sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
      }
      return sid;
    } catch {
      return generateUniqueSessionId();
    }
  }

  const STATE = {
    sessionId: getOrInitSessionId(),
    isOpen: false,
    isSending: false,
    autoAct: true,
    memoryOpen: false,
    attachmentPopoverOpen: false,
    stagedAttachment: null,
    stagedImage: null,
    isRecording: false,
    mediaRecorder: null,
    mediaStream: null,
    audioChunks: [],
    memoryProfile: null,
    workflowLinks: [],
    workflowSnapshot: null,
    messages: [],
  };

  const $ = (id) => document.getElementById(id);

  function esc(val) {
    if (typeof escapeHtml === "function") return escapeHtml(val);
    return String(val || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function notifyToast(msg, isError = false) {
    if (typeof showStatusMessage === "function") {
      showStatusMessage(msg, isError);
    }
  }

  function getActiveTabKey() {
    const tabs = ["workbench", "visual", "guidelines", "facts", "insights", "audit"];
    for (const t of tabs) {
      const btn = $(`tab-btn-${t}`);
      if (btn && btn.getAttribute("aria-selected") === "true") return t;
    }
    return "workbench";
  }

  function getSelectedModelConfig() {
    const sel = $("copilot-model-select");
    const raw = sel ? sel.value : "auto|low";
    const parts = String(raw || "auto|low").split("|");
    return {
      model_preference: parts[0] || "auto",
      reasoning_effort: parts[1] || "low",
    };
  }

  function getLiveClientContext() {
    const actorNameEl = $("actor-name-input");
    const roleEl = $("active-role-select");
    const titleEl = $("sub-title");
    const contentEl = $("sub-content");
    return {
      active_tab: getActiveTabKey(),
      active_asset_id:
        typeof CURRENT_ASSET !== "undefined" && CURRENT_ASSET
          ? CURRENT_ASSET.asset_id
          : "",
      actor_name: actorNameEl ? actorNameEl.value.trim() || "Nandha K" : "Nandha K",
      actor_role: roleEl ? roleEl.value || "Creator" : "Creator",
      detail_mode: typeof DETAIL_MODE !== "undefined" ? DETAIL_MODE : "simple",
      draft_title: titleEl ? titleEl.value.trim() : "",
      draft_content: contentEl ? contentEl.value.trim().slice(0, 600) : "",
      must_keep_points:
        typeof MUST_KEEP_TAGS !== "undefined" && Array.isArray(MUST_KEEP_TAGS)
          ? MUST_KEEP_TAGS
          : [],
    };
  }

  function syncDockMetaSelects() {
    const ctx = getLiveClientContext();
    const tabSelect = $("copilot-tab-select");
    if (tabSelect && tabSelect.value !== ctx.active_tab) {
      tabSelect.value = ctx.active_tab;
    }
    const roleSelect = $("copilot-role-select");
    if (roleSelect && roleSelect.value !== ctx.actor_role) {
      roleSelect.value = ctx.actor_role;
    }
  }

  function renderMarkdownToSafeHtml(mdText) {
    const lines = String(mdText || "").split(/\r?\n/);
    const chunks = [];
    let inList = false;

    const formatInline = (rawLine) => {
      let s = esc(rawLine);
      s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      return s;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) {
          chunks.push("</ul>");
          inList = false;
        }
        continue;
      }
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList) {
          chunks.push("<ul>");
          inList = true;
        }
        chunks.push(`<li>${formatInline(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      } else {
        if (inList) {
          chunks.push("</ul>");
          inList = false;
        }
        chunks.push(`<p>${formatInline(trimmed)}</p>`);
      }
    }
    if (inList) chunks.push("</ul>");
    return chunks.join("");
  }

  function chevronSvg() {
    return `<svg class="copilot-shimmer-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
  }

  function timelineCheckSvg() {
    return `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  }

  function copyIconSvg() {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  }

  function updateContextBadge() {
    const ctx = getLiveClientContext();
    const labelMap = {
      workbench: "Workbench",
      visual: "Banner",
      guidelines: "Guidelines",
      facts: "Fact Vault",
      insights: "Metrics",
      audit: "Audit",
    };
    const ctxLabel = $("copilot-context-label");
    if (ctxLabel) {
      const activeId = ctx.active_asset_id ? ` · ${ctx.active_asset_id}` : "";
      ctxLabel.textContent = `${labelMap[ctx.active_tab] || ctx.active_tab} · ${ctx.actor_role}${activeId}`;
    }
    syncDockMetaSelects();
  }

  function renderMemoryPopover() {
    const pop = $("copilot-memory-popover");
    const countEl = $("copilot-memory-count");
    const memBtn = $("copilot-memory-btn");
    const profile = STATE.memoryProfile;
    const facts = (profile && profile.remembered_facts) || [];

    if (countEl) countEl.textContent = String(facts.length);
    if (memBtn) memBtn.classList.toggle("is-active", STATE.memoryOpen);
    if (!pop) return;

    if (!STATE.memoryOpen) {
      pop.classList.add("hidden");
      return;
    }
    pop.classList.remove("hidden");

    const chipsHtml = facts.length
      ? facts
          .map(
            (fact) => `<span class="copilot-memory-chip">
              <span>${esc(fact)}</span>
              <button type="button" data-forget="${esc(fact)}" title="Forget this item">&times;</button>
            </span>`
          )
          .join("")
      : `<span style="color:rgba(203,213,225,0.68);">No custom notes saved yet. Say "remember that..." anytime across any tab.</span>`;

    pop.innerHTML = `
      <div class="copilot-memory-header-row">
        <span><strong>Persistent Memory</strong> &middot; ${esc(profile ? profile.actor_name : "Nandha K")} (${esc(profile ? profile.preferred_role : "Creator")})</span>
        ${facts.length ? '<button type="button" id="copilot-forget-all" class="copilot-link-btn">Forget all</button>' : ""}
      </div>
      <div class="copilot-memory-chips">${chipsHtml}</div>
    `;

    pop.querySelectorAll("[data-forget]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await updateMemoryState({ forget_fact: btn.getAttribute("data-forget") });
      });
    });
    const forgetAll = $("copilot-forget-all");
    if (forgetAll) {
      forgetAll.addEventListener("click", async () => {
        await updateMemoryState({ clear_all_memories: true });
      });
    }
  }

  function renderWelcomeHero(hasPriorMemory = false) {
    const hero = document.createElement("div");
    hero.className = "copilot-welcome-hero";

    const subtext = hasPriorMemory
      ? "Memory active across Review, Brand Rules, Fact Vault & Audit Ledger."
      : "Ask about active findings, Brand Rules, Fact Vault, or live actions.";

    hero.innerHTML = `
      <div class="copilot-welcome-center">
        <h2 class="copilot-welcome-heading">Get help from<br>VeriLoom Support</h2>
        <p class="copilot-welcome-subtext">${esc(subtext)}</p>
      </div>
    `;

    return hero;
  }

  function buildTimelineStages(reasoningSteps, isLoading = false, liveStageIdx = 0) {
    if (isLoading) {
      const activeList = [
        { title: "Checking the request.", page: "", detail: "" },
        { title: "Syncing workspace, Brand Rules & Fact Vault.", page: "", detail: "" },
        { title: "Refining reply wording.", page: "", detail: "" },
      ];
      return activeList.slice(0, Math.min(liveStageIdx + 1, activeList.length)).map((st, idx, arr) => ({
        ...st,
        state: idx === arr.length - 1 ? "active" : "done",
      }));
    }

    const stages = [{ title: "Checking the request.", page: "", detail: "", state: "done" }];
    for (const st of reasoningSteps || []) {
      const rawTitle = typeof st === "object" && st !== null ? st.title : st;
      const title = String(rawTitle || "").trim();
      if (!title || /^checking the request\.?$/i.test(title) || /^done$/i.test(title)) continue;
      stages.push({
        title,
        page: (typeof st === "object" && st !== null ? st.page : "") || "",
        detail: (typeof st === "object" && st !== null ? st.detail : "") || "",
        state: "done",
      });
    }
    stages.push({ title: "Refining reply wording.", page: "", detail: "", state: "done" });
    stages.push({ title: "Done", page: "", detail: "", state: "done" });
    return stages;
  }

  function renderReasoningDrawerInner(
    reasoningSteps,
    workflowLinks,
    actions,
    actionStatuses = [],
    showRunStaged = false,
    isLoading = false,
    liveStageIdx = 0
  ) {
    const stages = buildTimelineStages(reasoningSteps, isLoading, liveStageIdx);
    const stepsHtml = `<div class="copilot-timeline">
      ${stages
        .map((st) => {
          const dotInner = st.state === "done" ? timelineCheckSvg() : "";
          const stateCls = st.state === "active" ? "is-active" : "is-done";
          return `<div class="copilot-timeline-item ${stateCls}">
            <div class="copilot-timeline-rail">
              <span class="copilot-timeline-dot">${dotInner}</span>
            </div>
            <div class="copilot-timeline-body">
              <div class="copilot-timeline-title">
                <span>${esc(st.title)}</span>
                ${st.page ? `<span class="copilot-reason-page">${esc(st.page)}</span>` : ""}
              </div>
              ${st.detail ? `<div class="copilot-timeline-detail">${esc(st.detail)}</div>` : ""}
            </div>
          </div>`;
        })
        .join("")}
    </div>`;

    const linksHtml = (workflowLinks || []).some((w) => w.touched)
      ? `<div style="display:flex;flex-wrap:wrap;gap:5px;padding-top:6px;border-top:1px dashed rgba(255,255,255,0.12);">
          ${workflowLinks
            .filter((w) => w.touched)
            .map(
              (w) => `<button type="button" class="copilot-reason-page" data-jump-tab="${esc(w.tab)}" style="margin:0;padding:2px 7px;cursor:pointer;">${esc(w.label)}: ${esc(w.detail)}</button>`
            )
            .join("")}
        </div>`
      : "";

    let actionsHtml = "";
    if (actions && actions.length > 0) {
      const items = actions
        .map((act, idx) => {
          const st = actionStatuses[idx] || (showRunStaged ? "staged" : "done");
          return `<div class="copilot-cua-step" data-action-idx="${idx}">
            <span>${esc(act.label)}</span>
            <span class="copilot-cua-badge ${esc(st)}">${esc(st)}</span>
          </div>`;
        })
        .join("");
      actionsHtml = `<div class="copilot-cua-list">
        ${items}
        ${showRunStaged ? '<button type="button" class="copilot-run-staged-btn">Run Planned Actions Live</button>' : ""}
      </div>`;
    }

    return `${stepsHtml}${linksHtml}${actionsHtml}`;
  }

  function attachThinkingToggle(msgEl, rawContent = "", openByDefault = false) {
    const toggleBtn = msgEl.querySelector(".copilot-thinking-shimmer");
    const drawer = msgEl.querySelector(".copilot-reasoning-drawer");
    if (toggleBtn && drawer) {
      const setOpen = (isOpen) => {
        toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        drawer.classList.toggle("hidden", !isOpen);
      };
      setOpen(openByDefault);

      toggleBtn.addEventListener("click", () => {
        const currentlyOpen = toggleBtn.getAttribute("aria-expanded") === "true";
        setOpen(!currentlyOpen);
      });

      drawer.querySelectorAll("[data-jump-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetTab = btn.getAttribute("data-jump-tab");
          if (targetTab && typeof switchTab === "function") {
            switchTab(targetTab);
            updateContextBadge();
          }
        });
      });
    }

    const copyBtn = msgEl.querySelector(".copilot-copy-btn");
    if (copyBtn && rawContent) {
      copyBtn.addEventListener("click", async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(rawContent);
          }
          copyBtn.classList.add("is-copied");
          copyBtn.innerHTML = timelineCheckSvg();
          setTimeout(() => {
            copyBtn.classList.remove("is-copied");
            copyBtn.innerHTML = copyIconSvg();
          }, 1400);
        } catch (err) {
          console.error("Clipboard copy failed:", err);
        }
      });
    }
  }

  function computeElapsedSeconds(elapsedSec, providerMeta) {
    if (typeof elapsedSec === "number" && elapsedSec > 0) return Math.round(elapsedSec);
    if (providerMeta && typeof providerMeta.latency_ms === "number" && providerMeta.latency_ms > 0) {
      return Math.max(1, Math.round(providerMeta.latency_ms / 1000));
    }
    return 1;
  }

  function buildShimmerLabel(isLoading, elapsedSec, providerMeta) {
    if (isLoading) {
      const sec = Math.max(0, Math.floor(elapsedSec || 0));
      return `Thinking · ${sec}s`;
    }
    const sec = computeElapsedSeconds(elapsedSec, providerMeta);
    return `Thought for ${sec}s`;
  }

  function createAssistantMessageNode(opts) {
    const {
      content = "",
      reasoningSteps = [],
      workflowLinks = [],
      actions = [],
      actionStatuses = [],
      providerMeta = null,
      elapsedSec = 0,
      liveStageIdx = 0,
      isLoading = false,
      showRunStaged = false,
      openReasoning = false,
    } = opts;

    const wrap = document.createElement("div");
    wrap.className = "copilot-msg copilot-msg-assistant";

    const shimmerLabel = buildShimmerLabel(isLoading, elapsedSec, providerMeta);
    const copyBarHtml = !isLoading && content
      ? `<div class="copilot-assistant-actions">
          <button type="button" class="copilot-copy-btn" title="Copy reply" aria-label="Copy reply">${copyIconSvg()}</button>
        </div>`
      : "";

    wrap.innerHTML = `
      <button type="button" class="copilot-thinking-shimmer ${isLoading ? "is-loading" : ""}" aria-expanded="${openReasoning ? "true" : "false"}">
        <span class="copilot-shimmer-left">
          <span class="copilot-shimmer-label">${esc(shimmerLabel)}</span>
        </span>
        ${chevronSvg()}
      </button>
      <div class="copilot-reasoning-drawer ${openReasoning ? "" : "hidden"}">
        ${renderReasoningDrawerInner(reasoningSteps, workflowLinks, actions, actionStatuses, showRunStaged, isLoading, liveStageIdx)}
      </div>
      <div class="copilot-assistant-prose">${content ? renderMarkdownToSafeHtml(content) : ""}</div>
      ${copyBarHtml}
    `;

    attachThinkingToggle(wrap, content, openReasoning);
    return wrap;
  }

  function createUserMessageNode(text, attachmentInfo = null) {
    const wrap = document.createElement("div");
    wrap.className = "copilot-msg copilot-msg-user";
    let attachHtml = "";
    if (attachmentInfo && (attachmentInfo.dataUrl || attachmentInfo.name)) {
      if (attachmentInfo.kind === "document" || attachmentInfo.ext === "pdf" || attachmentInfo.ext === "docx" || attachmentInfo.ext === "txt" || attachmentInfo.ext === "md") {
        const ext = (attachmentInfo.ext || "doc").toLowerCase();
        attachHtml = `
          <div class="copilot-user-doc-chip">
            <span class="copilot-doc-badge is-${esc(ext)}">${esc(ext.toUpperCase())}</span>
            <span class="copilot-user-doc-name" title="${esc(attachmentInfo.name || 'Document')}">${esc(attachmentInfo.name || 'Document')}</span>
            <span class="copilot-user-doc-size">${formatFileSize(attachmentInfo.size)}</span>
          </div>
        `;
      } else if (attachmentInfo.dataUrl) {
        attachHtml = `
          <div class="copilot-user-img-box">
            <img src="${esc(attachmentInfo.dataUrl)}" alt="${esc(attachmentInfo.name || 'Uploaded visual')}" class="copilot-user-img-thumb" />
            ${attachmentInfo.name ? `<div class="copilot-user-img-tag">${esc(attachmentInfo.name)}</div>` : ""}
          </div>
        `;
      }
    }
    wrap.innerHTML = `<div class="copilot-user-bubble">${attachHtml}<div class="copilot-user-text">${esc(text)}</div></div>`;
    return wrap;
  }

  function renderMessagesList() {
    const container = $("copilot-messages");
    if (!container) return;
    container.innerHTML = "";

    const hasPriorMemory = Boolean(
      STATE.memoryProfile && (STATE.memoryProfile.suppress_templates || STATE.memoryProfile.has_memory)
    );

    // Always render centered support greeting when chat stream is empty (hides starter rows when memory exists)
    if (STATE.messages.length === 0) {
      container.appendChild(renderWelcomeHero(hasPriorMemory));
    }

    for (const m of STATE.messages) {
      if (m.role === "user") {
        container.appendChild(
          createUserMessageNode(
            m.content,
            m.image_info || (m.image_data_url ? { dataUrl: m.image_data_url } : null)
          )
        );
      } else {
        const node = createAssistantMessageNode({
          content: m.content,
          reasoningSteps: m.reasoning_steps || [],
          workflowLinks: m.workflow_links || [],
          actions: m.actions || [],
          actionStatuses: (m.actions || []).map(() => "done"),
          providerMeta: m.provider_meta || null,
          elapsedSec: m.elapsed_sec || 0,
          isLoading: false,
          openReasoning: false,
        });
        container.appendChild(node);
      }
    }
    container.scrollTop = container.scrollHeight;
  }

  function highlightElementForCua(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.remove("cua-live-highlight");
    void el.offsetWidth;
    el.classList.add("cua-live-highlight");
    setTimeout(() => el.classList.remove("cua-live-highlight"), 1200);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runSingleCuaAction(act) {
    switch (act.type) {
      case "switch_role": {
        if (typeof switchToRole === "function") switchToRole(act.role);
        highlightElementForCua("#active-role-select");
        break;
      }
      case "set_detail_mode": {
        if (typeof setDetailMode === "function") setDetailMode(act.mode);
        highlightElementForCua("#footer-mode-label");
        break;
      }
      case "switch_tab": {
        if (typeof switchTab === "function") switchTab(act.tab);
        highlightElementForCua(`#tab-btn-${act.tab}`);
        break;
      }
      case "select_asset": {
        if (typeof switchTab === "function") switchTab("workbench", { skipScroll: true });
        if (typeof selectSubmission === "function") await selectSubmission(act.asset_id);
        highlightElementForCua("#active-findings-list");
        break;
      }
      case "filter_queue": {
        if (typeof switchTab === "function") switchTab("workbench", { skipScroll: true });
        if (typeof setQueueFilter === "function") setQueueFilter(act.filter);
        highlightElementForCua("#queue-filter-bar");
        break;
      }
      case "load_preset": {
        if (typeof switchTab === "function") switchTab("workbench", { skipScroll: true });
        const sel = $("preset-select");
        if (sel) {
          sel.value = act.preset_id;
          if (typeof applySelectedPreset === "function") applySelectedPreset();
          highlightElementForCua("#sub-content");
        }
        break;
      }
      case "fill_and_verify_draft": {
        if (typeof switchTab === "function") switchTab("workbench", { skipScroll: true });
        const tEl = $("sub-title");
        const cEl = $("sub-content");
        if (tEl) tEl.value = act.title || "Copilot Verified Draft";
        if (cEl) cEl.value = act.content || "";
        highlightElementForCua("#btn-verify-draft");
        if (typeof submitContentForVerification === "function") await submitContentForVerification();
        break;
      }
      case "verify_current_draft": {
        if (typeof switchTab === "function") switchTab("workbench", { skipScroll: true });
        highlightElementForCua("#btn-verify-draft");
        if (typeof submitContentForVerification === "function") await submitContentForVerification();
        break;
      }
      case "creator_action": {
        if (typeof switchTab === "function") switchTab("workbench", { skipScroll: true });
        if (typeof handleCreatorFindingAction === "function") {
          await handleCreatorFindingAction(act.finding_id, act.action);
        }
        highlightElementForCua("#active-findings-list");
        break;
      }
      case "reviewer_action": {
        if (typeof switchTab === "function") switchTab("workbench", { skipScroll: true });
        if (typeof handleReviewerFindingDecision === "function") {
          await handleReviewerFindingDecision(act.finding_id, act.action);
        }
        highlightElementForCua("#active-findings-list");
        break;
      }
      case "asset_decision": {
        if (typeof switchTab === "function") switchTab("workbench", { skipScroll: true });
        if (typeof selectSubmission === "function" && (!CURRENT_ASSET || CURRENT_ASSET.asset_id !== act.asset_id)) {
          await selectSubmission(act.asset_id);
        }
        if (typeof submitAssetDecision === "function") await submitAssetDecision(act.decision);
        highlightElementForCua("#submissions-queue-list");
        break;
      }
      case "run_visual_audit": {
        if (typeof switchTab === "function") switchTab("visual");
        highlightElementForCua("#visual-audit-results");
        if (typeof runVisualAuditDemo === "function") await runVisualAuditDemo(act.preset || "non_compliant_demo");
        break;
      }
      case "run_guideline_linter": {
        if (typeof switchTab === "function") switchTab("guidelines");
        highlightElementForCua("#linter-results-box");
        if (typeof runGuidelineLinter === "function") await runGuidelineLinter(true);
        break;
      }
      case "run_policy_replay": {
        if (typeof switchTab === "function") switchTab("guidelines");
        if (typeof loadRuleIntoReplaySimulator === "function") loadRuleIntoReplaySimulator(act.rule_id || "TERM-01");
        if (typeof executePolicyReplay === "function") await executePolicyReplay();
        highlightElementForCua("#policy-replay-results");
        break;
      }
      case "toggle_fact_status": {
        if (typeof switchTab === "function") switchTab("facts");
        if (typeof toggleFactStatus === "function") await toggleFactStatus(act.fact_id);
        highlightElementForCua("#facts-table-container");
        break;
      }
      case "reset_demo_queue": {
        if (typeof resetDemoQueue === "function") await resetDemoQueue();
        break;
      }
      case "simulate_tamper": {
        if (typeof switchTab === "function") switchTab("audit");
        if (typeof triggerTamperSimulation === "function") await triggerTamperSimulation();
        highlightElementForCua("#chain-status-badge");
        break;
      }
      case "restore_chain": {
        if (typeof switchTab === "function") switchTab("audit");
        if (typeof restoreTamperedChain === "function") await restoreTamperedChain();
        highlightElementForCua("#chain-status-badge");
        break;
      }
      default:
        break;
    }
  }

  async function executeCuaActions(actions, msgNode) {
    if (!actions || actions.length === 0) return;
    const stepNodes = msgNode ? msgNode.querySelectorAll(".copilot-cua-step") : [];
    for (let i = 0; i < actions.length; i += 1) {
      const badge = stepNodes[i] ? stepNodes[i].querySelector(".copilot-cua-badge") : null;
      if (badge) {
        badge.className = "copilot-cua-badge running";
        badge.textContent = "running";
      }
      try {
        await runSingleCuaAction(actions[i]);
        if (badge) {
          badge.className = "copilot-cua-badge done";
          badge.textContent = "done";
        }
      } catch (err) {
        console.error("Copilot action error:", err);
        if (badge) {
          badge.className = "copilot-cua-badge staged";
          badge.textContent = "failed";
        }
      }
      updateContextBadge();
      await sleep(220);
    }
    if (typeof syncTopChainBadge === "function") syncTopChainBadge();
    await refreshCopilotSession(false);
  }

  function applyAutoActUi(isOn) {
    STATE.autoAct = Boolean(isOn);
    const btn = $("copilot-auto-act-btn");
    if (!btn) return;
    btn.classList.toggle("is-on", STATE.autoAct);
    btn.setAttribute("aria-pressed", STATE.autoAct ? "true" : "false");
  }

  async function updateMemoryState(patch) {
    try {
      const res = await fetch("/api/chat/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: STATE.sessionId, ...patch }),
      });
      if (!res.ok) return;
      const data = await res.json();
      STATE.memoryProfile = data.memory_profile;
      if (typeof STATE.memoryProfile.auto_execute_cua === "boolean") {
        applyAutoActUi(STATE.memoryProfile.auto_execute_cua);
      }
      renderMemoryPopover();
      updateContextBadge();
      if (STATE.messages.length === 0) {
        renderMessagesList();
      }
    } catch (err) {
      console.error("Failed updating Copilot memory:", err);
    }
  }

  async function refreshCopilotSession(renderFeed = true) {
    const ctx = getLiveClientContext();
    const qs = new URLSearchParams({
      session_id: STATE.sessionId,
      active_tab: ctx.active_tab,
      active_asset_id: ctx.active_asset_id,
      actor_name: ctx.actor_name,
      actor_role: ctx.actor_role,
      detail_mode: ctx.detail_mode,
    });
    try {
      const res = await fetch(`/api/chat/session?${qs.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      STATE.memoryProfile = data.memory_profile;
      STATE.workflowLinks = data.workflow_links || [];
      STATE.workflowSnapshot = data.workflow_snapshot || null;
      STATE.messages = data.messages || [];
      if (STATE.memoryProfile && typeof STATE.memoryProfile.auto_execute_cua === "boolean") {
        applyAutoActUi(STATE.memoryProfile.auto_execute_cua);
      }
      renderMemoryPopover();
      updateContextBadge();
      if (renderFeed) renderMessagesList();
    } catch (err) {
      console.error("Failed loading Copilot session:", err);
    }
  }

  function stopMicStream() {
    if (STATE.mediaStream) {
      STATE.mediaStream.getTracks().forEach((track) => track.stop());
      STATE.mediaStream = null;
    }
    STATE.mediaRecorder = null;
    STATE.isRecording = false;
    const micBtn = $("copilot-mic-btn");
    if (micBtn) {
      micBtn.classList.remove("is-recording");
      micBtn.setAttribute("aria-pressed", "false");
      micBtn.title = "Voice prompt (Whisper STT)";
    }
  }

  async function transcribeRecordedAudio(blob) {
    const inputEl = $("copilot-input");
    const micBtn = $("copilot-mic-btn");
    if (!blob || blob.size === 0) {
      notifyToast("No audio captured. Please try speaking again.", true);
      return;
    }
    if (micBtn) micBtn.disabled = true;
    try {
      const fd = new FormData();
      fd.append("file", blob, "voice-prompt.webm");
      const res = await fetch("/api/chat/transcribe", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Voice transcription failed");
      }
      const transcript = String(data.text || "").trim();
      if (!transcript) {
        notifyToast("No speech detected in audio recording.", true);
        return;
      }
      if (inputEl) {
        const existing = inputEl.value.trim();
        inputEl.value = existing ? `${existing} ${transcript}` : transcript;
        inputEl.style.height = "auto";
        inputEl.style.height = Math.min(inputEl.scrollHeight, 110) + "px";
        inputEl.focus();
      }
      notifyToast(`Transcribed via ${data.model || "whisper-large-v3-turbo"}`);
    } catch (err) {
      notifyToast(`Voice transcription error: ${err.message}`, true);
    } finally {
      if (micBtn) micBtn.disabled = false;
    }
  }

  async function toggleMicRecording() {
    const micBtn = $("copilot-mic-btn");
    if (STATE.isRecording && STATE.mediaRecorder) {
      try {
        STATE.mediaRecorder.stop();
      } catch (err) {
        console.error("Error stopping recorder:", err);
        stopMicStream();
      }
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      notifyToast("Voice input requires microphone & MediaRecorder support in this browser.", true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      let chosenType = "";
      if (typeof MediaRecorder.isTypeSupported === "function") {
        chosenType = candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
      }
      const recorder = chosenType ? new MediaRecorder(stream, { mimeType: chosenType }) : new MediaRecorder(stream);

      STATE.mediaStream = stream;
      STATE.mediaRecorder = recorder;
      STATE.audioChunks = [];
      STATE.isRecording = true;

      if (micBtn) {
        micBtn.classList.add("is-recording");
        micBtn.setAttribute("aria-pressed", "true");
        micBtn.title = "Stop recording & transcribe";
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          STATE.audioChunks.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = STATE.audioChunks.slice();
        const mimeType = recorder.mimeType || "audio/webm";
        stopMicStream();
        const audioBlob = new Blob(chunks, { type: mimeType });
        await transcribeRecordedAudio(audioBlob);
      };

      recorder.onerror = () => {
        stopMicStream();
        notifyToast("Microphone recording failed.", true);
      };

      recorder.start();
      notifyToast("Listening... click mic again to transcribe.");
    } catch (err) {
      stopMicStream();
      notifyToast(`Microphone access denied: ${err.message}`, true);
    }
  }

  function attachCurrentContextToInput() {
    const inputEl = $("copilot-input");
    if (!inputEl) return;
    const ctx = getLiveClientContext();
    const parts = [`tab=${ctx.active_tab}`, `role=${ctx.actor_role}`];
    if (ctx.active_asset_id) parts.push(`asset=${ctx.active_asset_id}`);
    if (ctx.draft_title) parts.push(`draft="${ctx.draft_title.slice(0, 48)}"`);
    const tag = `[${parts.join(", ")}]`;

    const cleanVal = inputEl.value.replace(/^\[[^\]]*tab=[^\]]*\]\s*/, "").trim();
    inputEl.value = cleanVal ? `${tag} ${cleanVal}` : `${tag} `;
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 110) + "px";
    inputEl.focus();
    notifyToast(`Attached live context: ${tag}`);
  }

  async function streamMarkdownText(proseEl, fullText, scrollContainer) {
    if (!proseEl || !fullText) return;
    const tokens = fullText.split(/(\s+)/);
    let accumulated = "";
    proseEl.innerHTML = '<span class="copilot-streaming-cursor"></span>';

    for (let i = 0; i < tokens.length; i++) {
      accumulated += tokens[i];
      proseEl.innerHTML = renderMarkdownToSafeHtml(accumulated) + '<span class="copilot-streaming-cursor"></span>';
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
      const tok = tokens[i];
      if (tok.trim() === "") {
        await sleep(3);
      } else if (/[.,:;!?\n]/.test(tok)) {
        await sleep(28);
      } else {
        await sleep(15);
      }
    }

    proseEl.innerHTML = renderMarkdownToSafeHtml(fullText);
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB safe limit for Render cloud memory
  const MAX_DOC_BYTES = 10 * 1024 * 1024;  // 10MB safe limit for Render cloud memory

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "0 KB";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function renderStagedAttachmentPreview() {
    const bar = $("copilot-image-preview-bar");
    if (!bar) return;
    const item = STATE.stagedAttachment;
    if (!item) {
      bar.innerHTML = "";
      bar.classList.add("hidden");
      return;
    }
    const { kind, dataUrl, name, size, ext } = item;
    if (kind === "document") {
      const extUpper = (ext || "doc").toUpperCase();
      bar.innerHTML = `
        <div class="copilot-preview-thumb-wrap">
          <span class="copilot-doc-badge is-${esc(ext)}">${esc(extUpper)}</span>
          <div class="copilot-preview-meta">
            <span class="copilot-preview-name">${esc(name)}</span>
            <span class="copilot-preview-size">${formatFileSize(size)} · 9-Layer AST & Fact Vault ready</span>
          </div>
        </div>
        <button type="button" class="copilot-preview-remove-btn" id="copilot-remove-staged-attachment" title="Remove attached document" aria-label="Remove attached document">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
    } else {
      bar.innerHTML = `
        <div class="copilot-preview-thumb-wrap">
          <img src="${esc(dataUrl)}" alt="${esc(name)}" class="copilot-preview-thumb" />
          <div class="copilot-preview-meta">
            <span class="copilot-preview-name">${esc(name)}</span>
            <span class="copilot-preview-size">${formatFileSize(size)} · Multimodal vision audit ready</span>
          </div>
        </div>
        <button type="button" class="copilot-preview-remove-btn" id="copilot-remove-staged-attachment" title="Remove attached image" aria-label="Remove attached image">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
    }
    bar.classList.remove("hidden");
    const removeBtn = $("copilot-remove-staged-attachment");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        clearStagedAttachment();
        const input = $("copilot-input");
        if (input) input.focus();
      });
    }
  }

  function clearStagedAttachment() {
    STATE.stagedAttachment = null;
    STATE.stagedImage = null;
    const imgInput = $("copilot-image-file-input");
    if (imgInput) imgInput.value = "";
    const docInput = $("copilot-doc-file-input");
    if (docInput) docInput.value = "";
    renderStagedAttachmentPreview();
  }

  // Alias for backward compatibility
  function renderStagedImagePreview() {
    renderStagedAttachmentPreview();
  }
  function clearStagedImage() {
    clearStagedAttachment();
  }

  function toggleAttachmentPopover(show = null) {
    const popover = $("copilot-attachment-popover");
    const plusBtn = $("copilot-plus-btn");
    const next = show !== null ? Boolean(show) : !STATE.attachmentPopoverOpen;
    STATE.attachmentPopoverOpen = next;
    if (popover) {
      if (next) popover.classList.remove("hidden");
      else popover.classList.add("hidden");
    }
    if (plusBtn) {
      plusBtn.setAttribute("aria-expanded", next ? "true" : "false");
      if (next) plusBtn.classList.add("is-active");
      else plusBtn.classList.remove("is-active");
    }
  }

  function handleImageFileSelected(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      notifyToast("Please select a valid image file (PNG, JPEG, WebP, SVG).", true);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      notifyToast("Image exceeds safe cloud limit of 5MB for rapid analysis. Please choose an image under 5MB.", true);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      STATE.stagedAttachment = {
        kind: "image",
        dataUrl: ev.target.result,
        name: file.name,
        size: file.size,
        ext,
      };
      STATE.stagedImage = STATE.stagedAttachment;
      renderStagedAttachmentPreview();
      const input = $("copilot-input");
      if (input) {
        input.focus();
        if (!input.value.trim()) {
          input.placeholder = "Ask about this visual or press Enter to audit...";
        }
      }
      notifyToast(`Attached ${file.name} (Max 5MB safe) for multimodal vision audit.`);
    };
    reader.onerror = () => {
      notifyToast("Failed to read image file.", true);
    };
    reader.readAsDataURL(file);
  }

  function handleDocFileSelected(file) {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const validExts = ["pdf", "docx", "txt", "md"];
    if (!validExts.includes(ext)) {
      notifyToast("Please select a supported document file (PDF, DOCX, TXT, MD).", true);
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      notifyToast("Document exceeds safe cloud limit of 10MB for rapid analysis. Please choose a document under 10MB.", true);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      STATE.stagedAttachment = {
        kind: "document",
        dataUrl: ev.target.result,
        name: file.name,
        size: file.size,
        ext,
      };
      STATE.stagedImage = null;
      renderStagedAttachmentPreview();
      const input = $("copilot-input");
      if (input) {
        input.focus();
        if (!input.value.trim()) {
          input.placeholder = "Ask about this document or press Enter to audit...";
        }
      }
      notifyToast(`Attached ${file.name} (Max 10MB safe) for 9-layer compliance audit.`);
    };
    reader.onerror = () => {
      notifyToast("Failed to read document file.", true);
    };
    reader.readAsDataURL(file);
  }

  async function sendCopilotMessage(rawText) {
    let text = String(rawText || "").trim();
    const staged = STATE.stagedAttachment;

    // If text is empty but attachment is staged, provide a high-quality audit prompt
    if (!text && staged) {
      if (staged.kind === "image") {
        text = "Please analyze and audit this uploaded image for brand compliance, WCAG contrast, CIEDE2000 color fidelity, and regulatory safety.";
      } else {
        text = `Please analyze and audit this uploaded document (${staged.name || "document"}) for brand compliance, AST regulatory rules, prohibited claims, and Fact Vault verification.`;
      }
    }

    if (!text || STATE.isSending) return;

    const messagesEl = $("copilot-messages");
    const inputEl = $("copilot-input");
    const sendBtn = $("copilot-send-btn");
    if (!messagesEl) return;

    const hero = messagesEl.querySelector(".copilot-welcome-hero");
    if (hero) hero.remove();
    const initCard = messagesEl.querySelector(".copilot-session-status-card");
    if (initCard) initCard.remove();

    STATE.isSending = true;
    if (sendBtn) sendBtn.disabled = true;
    if (inputEl) {
      inputEl.value = "";
      inputEl.style.height = "auto";
      inputEl.placeholder = "Do anything";
    }

    // Capture attachment to send and clear staging
    const sendingAttachment = staged;
    clearStagedAttachment();

    messagesEl.appendChild(createUserMessageNode(text, sendingAttachment));
    const startedAt = performance.now();
    let lastStageIdx = 0;
    const pendingNode = createAssistantMessageNode({
      isLoading: true,
      elapsedSec: 0,
      liveStageIdx: 0,
      openReasoning: false,
    });
    messagesEl.appendChild(pendingNode);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const timerInterval = setInterval(() => {
      const elapsedMs = performance.now() - startedAt;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const labelEl = pendingNode.querySelector(".copilot-shimmer-label");
      if (labelEl) {
        labelEl.textContent = `Thinking · ${elapsedSec}s`;
      }
      const nextStageIdx = elapsedMs < 650 ? 0 : elapsedMs < 1550 ? 1 : 2;
      if (nextStageIdx !== lastStageIdx) {
        lastStageIdx = nextStageIdx;
        const drawerEl = pendingNode.querySelector(".copilot-reasoning-drawer");
        if (drawerEl) {
          drawerEl.innerHTML = renderReasoningDrawerInner([], [], [], [], false, true, nextStageIdx);
        }
      }
    }, 250);

    const { model_preference, reasoning_effort } = getSelectedModelConfig();
    const minShimmerDelay = sleep(950);
    try {
      const [res] = await Promise.all([
        fetch("/api/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: STATE.sessionId,
            message: text,
            allow_actions: STATE.autoAct,
            model_preference,
            reasoning_effort,
            client_context: getLiveClientContext(),
            image_data_url: sendingAttachment && sendingAttachment.kind === "image" ? sendingAttachment.dataUrl : null,
            document_data_url: sendingAttachment && sendingAttachment.kind === "document" ? sendingAttachment.dataUrl : null,
            document_filename: sendingAttachment && sendingAttachment.kind === "document" ? sendingAttachment.name : null,
          }),
        }),
        minShimmerDelay,
      ]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Copilot request failed");

      clearInterval(timerInterval);
      const finalElapsedSec = Math.max(1, Math.round((performance.now() - startedAt) / 1000));

      STATE.memoryProfile = data.memory_profile;
      STATE.workflowLinks = data.workflow_links || [];
      STATE.workflowSnapshot = data.workflow_snapshot || STATE.workflowSnapshot;
      STATE.messages.push({
        role: "user",
        content: text,
        attachment_info: sendingAttachment,
      });
      STATE.messages.push({
        id: data.message_id,
        role: "assistant",
        content: data.reply,
        reasoning_steps: data.reasoning_steps || [],
        workflow_links: data.workflow_links || [],
        actions: data.actions || [],
        provider_meta: data.provider_meta || null,
        elapsed_sec: finalElapsedSec,
      });

      const hasPendingStaged = Boolean(data.pending_actions && data.pending_actions.length > 0);
      const displayedActions = (data.actions && data.actions.length ? data.actions : data.pending_actions) || [];
      const initStatuses = displayedActions.map(() =>
        hasPendingStaged ? "staged" : "running"
      );

      const wasOpen = pendingNode.querySelector(".copilot-thinking-shimmer")?.getAttribute("aria-expanded") === "true";
      const settledNode = createAssistantMessageNode({
        content: data.reply,
        reasoningSteps: data.reasoning_steps || [],
        workflowLinks: data.workflow_links || [],
        actions: displayedActions,
        actionStatuses: initStatuses,
        providerMeta: data.provider_meta || null,
        elapsedSec: finalElapsedSec,
        isLoading: false,
        showRunStaged: hasPendingStaged,
        openReasoning: wasOpen || displayedActions.length > 0,
      });

      const proseEl = settledNode.querySelector(".copilot-assistant-prose");
      if (proseEl && data.reply) {
        proseEl.innerHTML = '<span class="copilot-streaming-cursor"></span>';
      }

      pendingNode.replaceWith(settledNode);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      renderMemoryPopover();
      updateContextBadge();

      if (proseEl && data.reply) {
        await streamMarkdownText(proseEl, data.reply, messagesEl);
      }

      const runStagedBtn = settledNode.querySelector(".copilot-run-staged-btn");
      if (runStagedBtn && data.pending_actions) {
        runStagedBtn.addEventListener("click", async () => {
          runStagedBtn.remove();
          await executeCuaActions(data.pending_actions, settledNode);
        });
      }

      if (data.actions && data.actions.length > 0 && STATE.autoAct) {
        await executeCuaActions(data.actions, settledNode);
      }
    } catch (err) {
      clearInterval(timerInterval);
      const finalElapsedSec = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
      const errNode = createAssistantMessageNode({
        content: `Error reaching Copilot backend: \`${err.message}\``,
        reasoningSteps: [{ step: 1, title: "Request Error", detail: err.message, page: "Copilot" }],
        elapsedSec: finalElapsedSec,
        isLoading: false,
      });
      pendingNode.replaceWith(errNode);
    } finally {
      clearInterval(timerInterval);
      STATE.isSending = false;
      if (sendBtn) sendBtn.disabled = false;
      if (inputEl) inputEl.focus();
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function setOverlayOpen(nextOpen) {
    STATE.isOpen = Boolean(nextOpen);
    const overlay = $("chatbox-overlay");
    const launcher = $("chatbox-launcher");
    if (overlay) {
      overlay.classList.toggle("hidden", !STATE.isOpen);
      overlay.style.display = STATE.isOpen ? "block" : "none";
    }
    if (launcher) {
      launcher.classList.toggle("is-open", STATE.isOpen);
      launcher.setAttribute("aria-expanded", STATE.isOpen ? "true" : "false");
    }
    if (STATE.isOpen) {
      syncDockMetaSelects();
      refreshCopilotSession(true).then(() => {
        const inp = $("copilot-input");
        if (inp) inp.focus();
      });
    } else if (STATE.isRecording) {
      stopMicStream();
    }
  }

  function bindCopilotEvents() {
    const launcher = $("chatbox-launcher");
    const overlay = $("chatbox-overlay");
    const panel = $("chatbox-panel");
    const closeBtn = $("copilot-close-btn");
    const memBtn = $("copilot-memory-btn");
    const clearBtn = $("copilot-clear-btn");
    const autoActBtn = $("copilot-auto-act-btn");
    const tabSelect = $("copilot-tab-select");
    const copilotRoleSelect = $("copilot-role-select");
    const plusBtn = $("copilot-plus-btn");
    const addImgAction = $("copilot-action-add-image");
    const addDocAction = $("copilot-action-add-doc");
    const imageFileInput = $("copilot-image-file-input");
    const docFileInput = $("copilot-doc-file-input");
    const micBtn = $("copilot-mic-btn");
    const form = $("copilot-form");
    const input = $("copilot-input");

    if (launcher) {
      launcher.addEventListener("click", () => setOverlayOpen(!STATE.isOpen));
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", () => setOverlayOpen(false));
    }
    if (overlay && panel) {
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) setOverlayOpen(false);
      });
    }
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && STATE.isOpen) setOverlayOpen(false);
    });

    if (memBtn) {
      memBtn.addEventListener("click", () => {
        STATE.memoryOpen = !STATE.memoryOpen;
        renderMemoryPopover();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        const oldSid = STATE.sessionId;
        try {
          await fetch(`/api/chat/session?session_id=${encodeURIComponent(oldSid)}&keep_memory=true`, {
            method: "DELETE",
          });
        } catch {}

        // Assign brand-new unique session ID for Option 2
        const nextSid = generateUniqueSessionId();
        STATE.sessionId = nextSid;
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, nextSid);
        } catch {}

        // Reset composer & attachments
        STATE.messages = [];
        clearStagedAttachment();
        const input = $("copilot-input");
        if (input) {
          input.value = "";
          input.style.height = "auto";
          input.placeholder = "Do anything";
        }

        // Reload clean conversation state
        await refreshCopilotSession(true);
        notifyToast("Started fresh conversation session.");
      });
    }
    if (autoActBtn) {
      autoActBtn.addEventListener("click", async () => {
        const next = !STATE.autoAct;
        applyAutoActUi(next);
        await updateMemoryState({ auto_execute_cua: next });
      });
    }
    if (tabSelect) {
      tabSelect.addEventListener("change", () => {
        if (typeof switchTab === "function") {
          switchTab(tabSelect.value);
        }
        updateContextBadge();
        if (STATE.isOpen) refreshCopilotSession(false);
      });
    }
    if (copilotRoleSelect) {
      copilotRoleSelect.addEventListener("change", () => {
        if (typeof switchToRole === "function") {
          switchToRole(copilotRoleSelect.value);
        } else {
          const mainRole = $("active-role-select");
          if (mainRole) {
            mainRole.value = copilotRoleSelect.value;
            mainRole.dispatchEvent(new Event("change"));
          }
        }
        updateContextBadge();
        if (STATE.isOpen) refreshCopilotSession(false);
      });
    }
    if (plusBtn) {
      plusBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggleAttachmentPopover();
      });
    }
    if (addImgAction && imageFileInput) {
      addImgAction.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggleAttachmentPopover(false);
        imageFileInput.click();
      });
    }
    if (addDocAction && docFileInput) {
      addDocAction.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggleAttachmentPopover(false);
        docFileInput.click();
      });
    }
    if (imageFileInput) {
      imageFileInput.addEventListener("change", (ev) => {
        if (ev.target.files && ev.target.files[0]) {
          handleImageFileSelected(ev.target.files[0]);
        }
      });
    }
    if (docFileInput) {
      docFileInput.addEventListener("change", (ev) => {
        if (ev.target.files && ev.target.files[0]) {
          handleDocFileSelected(ev.target.files[0]);
        }
      });
    }

    document.addEventListener("click", (ev) => {
      if (STATE.attachmentPopoverOpen) {
        const composerLeft = ev.target && ev.target.closest && ev.target.closest(".copilot-composer-left");
        if (!composerLeft) {
          toggleAttachmentPopover(false);
        }
      }
    });
    if (micBtn) {
      micBtn.addEventListener("click", toggleMicRecording);
    }

    if (input) {
      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 110) + "px";
      });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          sendCopilotMessage(input.value);
        }
      });
    }
    if (form) {
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        if (input) sendCopilotMessage(input.value);
      });
    }

    // Stay synced across every tab click & role switch in the main app
    document.addEventListener("click", (ev) => {
      if (ev.target && ev.target.closest(".tab-btn")) {
        setTimeout(() => {
          updateContextBadge();
          if (STATE.isOpen) refreshCopilotSession(false);
        }, 60);
      }
    });
    const roleEl = $("active-role-select");
    if (roleEl) {
      roleEl.addEventListener("change", () => {
        updateContextBadge();
        if (STATE.isOpen) refreshCopilotSession(false);
      });
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    bindCopilotEvents();
    refreshCopilotSession(true);
  });
})();
