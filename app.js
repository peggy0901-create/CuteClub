const STORAGE_KEY = "moverank-state-v1";
const GROUP_GOAL = 1200;
const MAX_DAILY_MINUTES = 1440;
const SUPABASE_URL = "https://irxaturxkrahouwsjzbe.supabase.co";
const SUPABASE_KEY = "sb_publishable_xh73MVaLxZYOU-atalZsUg_h1Od5bgE";
const SUPABASE_TABLE = "moverank_state";
const SUPABASE_STATE_ID = "cuteclub-main";

const DEFAULT_MEMBERS = [
  { id: "大秉", name: "大秉" },
  { id: "秀朱", name: "秀朱" },
  { id: "呂欣", name: "呂欣" },
  { id: "Celia", name: "Celia" },
  { id: "Anki", name: "Anki" },
  { id: "春蘭", name: "春蘭" },
  { id: "Ray", name: "Ray" },
  { id: "Jessica", name: "Jessica" },
  { id: "Peggy", name: "Peggy" },
  { id: "Maggie", name: "Maggie" },
  { id: "Joyce", name: "Joyce" },
  { id: "Julia", name: "Julia" },
  { id: "Thomas", name: "Thomas" },
  { id: "Jennifer", name: "Jennifer" },
  { id: "康廷", name: "康廷" },
  { id: "銳泉", name: "銳泉" },
  { id: "智慧", name: "智慧" },
  { id: "雅云", name: "雅云" },
  { id: "小瑜", name: "小瑜" },
];
const MEMBER_ALIASES = {
  秀朵: "秀朱",
  岳欣: "呂欣",
  銳兵: "銳泉",
};
const MEMBER_COLORS = ["#18a999", "#3169d8", "#f26d5b", "#7c5cff", "#f3b33f", "#0ea5e9", "#db2777", "#16a34a", "#ea580c", "#475569"];

const state = loadState();
let members = normalizeMembers(DEFAULT_MEMBERS);
state.members = members;
sanitizeStateForMembers();
saveState({ remote: false });
let currentBoard = "week";
let toastTimer;
let syncTimer;
let syncWarningTimer = 0;
let editingEntryId = null;
let activeDetailMemberId = null;

const els = {
  memberSelect: document.querySelector("#memberSelect"),
  entryMemberSelect: document.querySelector("#entryMemberSelect"),
  importBtn: document.querySelector("#importBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  syncBtn: document.querySelector("#syncBtn"),
  syncStatus: document.querySelector("#syncStatus"),
  importFile: document.querySelector("#importFile"),
  resetBtn: document.querySelector("#resetBtn"),
  entryForm: document.querySelector("#entryForm"),
  entryDate: document.querySelector("#entryDate"),
  activityType: document.querySelector("#activityType"),
  minutes: document.querySelector("#minutes"),
  intensity: document.querySelector("#intensity"),
  note: document.querySelector("#note"),
  editingState: document.querySelector("#editingState"),
  todayLabel: document.querySelector("#todayLabel"),
  todayMinutes: document.querySelector("#todayMinutes"),
  weekMinutes: document.querySelector("#weekMinutes"),
  checkedInCount: document.querySelector("#checkedInCount"),
  bestStreak: document.querySelector("#bestStreak"),
  groupGoalText: document.querySelector("#groupGoalText"),
  goalProgress: document.querySelector("#goalProgress"),
  leaderboardList: document.querySelector("#leaderboardList"),
  feedList: document.querySelector("#feedList"),
  memberModal: document.querySelector("#memberModal"),
  memberModalTitle: document.querySelector("#memberModalTitle"),
  memberModalSummary: document.querySelector("#memberModalSummary"),
  memberModalList: document.querySelector("#memberModalList"),
  closeMemberModal: document.querySelector("#closeMemberModal"),
  toast: document.querySelector("#toast"),
};

init();

async function init() {
  hydrateMemberSelect();
  els.entryDate.value = formatDate(new Date());
  els.todayLabel.textContent = formatDisplayDate(new Date());
  els.memberSelect.value = state.currentMemberId;
  els.entryMemberSelect.value = state.currentMemberId;
  bindEvents();
  syncFormWithEntry();
  render();
  await loadRemoteState({ silent: true });
  window.addEventListener("focus", () => loadRemoteState({ silent: true }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadRemoteState({ silent: true });
  });
  window.setInterval(() => loadRemoteState({ silent: true }), 60000);
}

function bindEvents() {
  els.memberSelect.addEventListener("change", () => {
    setCurrentMember(els.memberSelect.value);
  });

  els.entryMemberSelect.addEventListener("change", () => {
    setCurrentMember(els.entryMemberSelect.value);
  });

  els.entryDate.addEventListener("change", syncFormWithEntry);

  els.entryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const entry = {
      id: `${state.currentMemberId}-${els.entryDate.value}`,
      memberId: state.currentMemberId,
      date: els.entryDate.value,
      type: els.activityType.value,
      minutes: clamp(Number(els.minutes.value), 1, MAX_DAILY_MINUTES),
      intensity: els.intensity.value,
      note: els.note.value.trim(),
      reactions: {},
    };

    const existingIndex = state.entries.findIndex(
      (item) => item.memberId === entry.memberId && item.date === entry.date,
    );
    const editingIndex = editingEntryId
      ? state.entries.findIndex((item) => item.id === editingEntryId)
      : -1;

    if (editingIndex >= 0) {
      entry.reactions = state.entries[editingIndex].reactions || {};
      state.entries[editingIndex] = entry;

      if (existingIndex >= 0 && existingIndex !== editingIndex) {
        entry.reactions = state.entries[existingIndex].reactions || entry.reactions;
        state.entries[existingIndex] = entry;
        state.entries.splice(editingIndex, 1);
      }

      editingEntryId = entry.id;
      showToast("已更新既有紀錄");
    } else if (existingIndex >= 0) {
      entry.reactions = state.entries[existingIndex].reactions || {};
      state.entries[existingIndex] = entry;
      editingEntryId = entry.id;
      showToast("已更新今日紀錄");
    } else {
      state.entries.push(entry);
      editingEntryId = entry.id;
      showToast("已新增運動紀錄");
    }

    saveState();
    await flushRemoteSave();
    syncFormWithEntry();
    render();
  });

  els.exportBtn.addEventListener("click", exportData);

  els.syncBtn.addEventListener("click", async () => {
    const reloaded = await loadRemoteState({ silent: false });
    if (reloaded) showToast("已同步最新線上資料");
  });

  els.importBtn.addEventListener("click", () => {
    els.importFile.click();
  });

  els.importFile.addEventListener("change", async () => {
    const [file] = els.importFile.files || [];
    if (!file) return;

    try {
      const imported = normalizeImportedState(parseCsv(await file.text()));
      localStorage.removeItem(STORAGE_KEY);
      members = imported.members;
      Object.assign(state, imported);
      hydrateMemberSelect();
      els.memberSelect.value = state.currentMemberId;
      els.entryMemberSelect.value = state.currentMemberId;
      els.entryDate.value = latestEntryDate(state.entries) || formatDate(new Date());
      saveState();
      const synced = await flushRemoteSave();
      syncFormWithEntry();
      setActiveBoard("month");
      render();
      showToast(
        synced
          ? `已匯入並同步 ${state.entries.length} 筆 CSV 紀錄`
          : `已匯入 ${state.entries.length} 筆，線上同步失敗`,
      );
    } catch (error) {
      showToast("匯入失敗，請確認 CSV 格式");
    } finally {
      els.importFile.value = "";
    }
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveBoard(button.dataset.board);
      renderLeaderboard();
    });
  });

  els.leaderboardList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-member-detail]");
    if (!button) return;
    openMemberDetail(button.dataset.memberDetail);
  });

  els.feedList.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-entry]");
    if (editButton) {
      editEntry(editButton.dataset.editEntry);
      return;
    }

    const detailButton = event.target.closest("[data-member-detail]");
    if (detailButton) {
      openMemberDetail(detailButton.dataset.memberDetail);
      return;
    }

    const button = event.target.closest("[data-reaction]");
    if (!button) return;

    const entry = state.entries.find((item) => item.id === button.dataset.entryId);
    if (!entry) return;

    entry.reactions ||= {};
    const reaction = button.dataset.reaction;
    entry.reactions[reaction] ||= [];

    const index = entry.reactions[reaction].indexOf(state.currentMemberId);
    if (index >= 0) {
      entry.reactions[reaction].splice(index, 1);
    } else {
      entry.reactions[reaction].push(state.currentMemberId);
    }

    saveState();
    flushRemoteSave();
    renderFeed();
  });

  els.resetBtn?.addEventListener("click", async () => {
    localStorage.removeItem(STORAGE_KEY);
    const reloaded = await loadRemoteState({ silent: false });
    if (reloaded) showToast("已重新載入線上資料");
  });

  els.memberModal.addEventListener("click", (event) => {
    if (event.target === els.memberModal) closeMemberDetail();
  });

  els.closeMemberModal.addEventListener("click", closeMemberDetail);

  els.memberModalList.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-entry]");
    if (!editButton) return;
    closeMemberDetail();
    editEntry(editButton.dataset.editEntry);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.memberModal.hidden) closeMemberDetail();
  });

}

function hydrateMemberSelect() {
  const options = members
    .map((member) => `<option value="${member.id}">${member.name}</option>`)
    .join("");
  els.memberSelect.innerHTML = options;
  els.entryMemberSelect.innerHTML = options;
}

function render() {
  renderStats();
  renderLeaderboard();
  renderFeed();
  if (activeDetailMemberId && !els.memberModal.hidden) renderMemberDetail(activeDetailMemberId);
}

function renderStats() {
  const today = formatDate(new Date());
  const weekStart = startOfWeek(new Date());
  const todayEntries = state.entries.filter((entry) => entry.date === today);
  const weekEntries = state.entries.filter((entry) => isSameOrAfter(entry.date, weekStart));
  const todayMinutes = sumMinutes(todayEntries);
  const weekMinutes = sumMinutes(weekEntries);
  const best = Math.max(...members.map((member) => getStreak(member.id)), 0);
  const goalPct = Math.min(100, Math.round((weekMinutes / GROUP_GOAL) * 100));

  els.todayMinutes.textContent = todayMinutes;
  els.weekMinutes.textContent = weekMinutes;
  els.checkedInCount.textContent = `${new Set(todayEntries.map((entry) => entry.memberId)).size}/${members.length}`;
  els.bestStreak.textContent = `${best} 天`;
  els.groupGoalText.textContent = `${weekMinutes} / ${GROUP_GOAL} 分鐘`;
  els.goalProgress.style.width = `${goalPct}%`;
}

function renderLeaderboard() {
  const rows = getLeaderboardRows(currentBoard);
  els.leaderboardList.innerHTML = rows
    .map((row, index) => {
      const member = getMember(row.memberId);
      const label = currentBoard === "streak" ? "天" : "分鐘";
      const summary = currentBoard === "streak" ? row.summary : `${row.sessions} 次紀錄`;
      return `
        <article class="rank-row ${index === 0 ? "top" : ""}">
          <div class="rank-number">${index + 1}</div>
          <div class="person-line">
            <div class="avatar" style="background:${member.color}">${initials(member.name)}</div>
            <div class="person-copy">
              <button class="member-name-btn" type="button" data-member-detail="${member.id}">${member.name}</button>
              <span>${summary}</span>
            </div>
          </div>
          <div class="rank-score">
            <strong>${row.score}</strong>
            <span>${label}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderFeed() {
  const recentEntries = [...state.entries]
    .sort((a, b) => b.date.localeCompare(a.date) || b.minutes - a.minutes)
    .slice(0, 8);

  els.feedList.innerHTML = recentEntries
    .map((entry) => {
      const member = getMember(entry.memberId);
      const reactions = entry.reactions || {};
      const cheerCount = reactions.cheer?.length || 0;
      const fireCount = reactions.fire?.length || 0;
      const currentCheered = reactions.cheer?.includes(state.currentMemberId);
      const currentFired = reactions.fire?.includes(state.currentMemberId);
      const note = entry.note ? `<span class="feed-note">「${escapeHtml(entry.note)}」</span>` : "";
      const cheerNames = reactionNames(reactions.cheer);
      const fireNames = reactionNames(reactions.fire);

      return `
        <article class="feed-card">
          <div class="avatar" style="background:${member.color}">${initials(member.name)}</div>
          <div class="feed-content">
            <div class="feed-meta">
              <button class="member-name-btn" type="button" data-member-detail="${member.id}">${member.name}</button>
              <div class="feed-actions">
                <span>${shortDate(entry.date)}</span>
                <button class="edit-entry-btn" type="button" data-edit-entry="${entry.id}" aria-label="編輯 ${member.name} ${shortDate(entry.date)} 紀錄" title="編輯紀錄">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
                    <path d="m13.5 7.5 3 3" />
                  </svg>
                </button>
              </div>
            </div>
            <p class="feed-main">
              完成 <b>${entry.minutes} 分鐘</b> ${entry.type}，${entry.intensity}。${note}
            </p>
            <div class="reaction-row">
              <button class="reaction-icon-btn ${currentCheered ? "active" : ""}" type="button" data-entry-id="${entry.id}" data-reaction="cheer" aria-label="加油 ${cheerCount}" title="加油">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7.5 11.5 11 15l6-7" />
                  <path d="M21 12a9 9 0 1 1-4.2-7.6" />
                </svg>
                <span>${cheerCount}</span>
              </button>
              <button class="reaction-icon-btn ${currentFired ? "active" : ""}" type="button" data-entry-id="${entry.id}" data-reaction="fire" aria-label="很強 ${fireCount}" title="很強">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3c1.2 3.1-.8 4.5-.8 6.4 0 1.2.7 2.1 1.9 2.1 1.7 0 3-1.5 2.4-4.1C18 9.3 20 12 20 15.3 20 19 17 22 12.5 22S5 19.1 5 15.1c0-3.6 2.4-5.8 4.2-7.7C10.4 6.1 11.1 4.8 12 3Z" />
                </svg>
                <span>${fireCount}</span>
              </button>
            </div>
            <div class="reaction-people">
              <span><b>加油</b>：${cheerNames}</span>
              <span><b>很強</b>：${fireNames}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function syncFormWithEntry() {
  els.memberSelect.value = state.currentMemberId;
  els.entryMemberSelect.value = state.currentMemberId;
  const entry = state.entries.find(
    (item) => item.memberId === state.currentMemberId && item.date === els.entryDate.value,
  );

  if (entry) {
    editingEntryId = entry.id;
    els.activityType.value = entry.type;
    els.minutes.value = entry.minutes;
    els.intensity.value = entry.intensity;
    els.note.value = entry.note;
    els.editingState.textContent = "可修改既有紀錄";
  } else {
    els.activityType.value = "跑步";
    els.minutes.value = 30;
    els.intensity.value = "中等";
    els.note.value = "";
    editingEntryId = null;
    els.editingState.textContent = "今天尚未登錄";
  }
}

function editEntry(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) return;

  editingEntryId = entry.id;
  state.currentMemberId = entry.memberId;
  els.entryDate.value = entry.date;
  saveState({ remote: false });
  syncFormWithEntry();
  render();
  document.querySelector("#checkin")?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.location.hash = "checkin";
  els.minutes.focus();
  showToast("已載入紀錄，可直接修改");
}

function openMemberDetail(memberId) {
  if (!members.some((member) => member.id === memberId)) return;
  activeDetailMemberId = memberId;
  renderMemberDetail(memberId);
  els.memberModal.hidden = false;
  document.body.classList.add("modal-open");
  els.closeMemberModal.focus();
}

function closeMemberDetail() {
  els.memberModal.hidden = true;
  activeDetailMemberId = null;
  document.body.classList.remove("modal-open");
}

function renderMemberDetail(memberId) {
  const member = getMember(memberId);
  const entries = getMemberEntries(memberId);
  const totalMinutes = sumMinutes(entries);
  const monthStart = `${formatDate(new Date()).slice(0, 8)}01`;
  const monthMinutes = sumMinutes(entries.filter((entry) => isSameOrAfter(entry.date, monthStart)));
  const latestEntry = entries[0];

  els.memberModalTitle.textContent = member.name;
  els.memberModalSummary.innerHTML = `
    <article>
      <span>總分鐘</span>
      <strong>${totalMinutes}</strong>
    </article>
    <article>
      <span>本月分鐘</span>
      <strong>${monthMinutes}</strong>
    </article>
    <article>
      <span>紀錄筆數</span>
      <strong>${entries.length}</strong>
    </article>
    <article>
      <span>連續天數</span>
      <strong>${getStreak(memberId)}</strong>
    </article>
  `;

  if (!entries.length) {
    els.memberModalList.innerHTML = `<div class="empty-detail">尚無登錄紀錄</div>`;
    return;
  }

  els.memberModalList.innerHTML = entries
    .map((entry) => {
      const note = entry.note ? `<span class="detail-note">「${escapeHtml(entry.note)}」</span>` : "";
      const latestClass = latestEntry?.id === entry.id ? " latest" : "";
      return `
        <article class="member-detail-row${latestClass}">
          <div>
            <strong>${formatDisplayDate(new Date(`${entry.date}T00:00:00`))}</strong>
            <span>${escapeHtml(entry.type)} · ${escapeHtml(entry.intensity)} ${note}</span>
          </div>
          <div class="detail-row-actions">
            <b>${entry.minutes} 分鐘</b>
            <button class="edit-entry-btn" type="button" data-edit-entry="${entry.id}" aria-label="編輯 ${member.name} ${entry.date} 紀錄" title="編輯紀錄">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
                <path d="m13.5 7.5 3 3" />
              </svg>
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function getMemberEntries(memberId) {
  return state.entries
    .filter((entry) => entry.memberId === memberId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.minutes - a.minutes);
}

function setCurrentMember(memberId) {
  if (!members.some((member) => member.id === memberId)) return;
  state.currentMemberId = memberId;
  saveState({ remote: false });
  syncFormWithEntry();
  render();
}

function setActiveBoard(board) {
  currentBoard = board;
  document.querySelectorAll(".segment").forEach((item) => {
    item.classList.toggle("active", item.dataset.board === board);
  });
}

function latestEntryDate(entries) {
  return [...entries].map((entry) => entry.date).sort((a, b) => b.localeCompare(a))[0] || "";
}

function getLeaderboardRows(board) {
  const today = formatDate(new Date());
  const weekStart = startOfWeek(new Date());
  const monthStart = `${today.slice(0, 8)}01`;

  return members
    .map((member) => {
      if (board === "streak") {
        const streak = getStreak(member.id);
        return {
          memberId: member.id,
          score: streak,
          sessions: 0,
          summary: getLastActivity(member.id) || "尚未打卡",
        };
      }

      const entries = state.entries.filter((entry) => {
        if (entry.memberId !== member.id) return false;
        if (board === "today") return entry.date === today;
        if (board === "month") return isSameOrAfter(entry.date, monthStart);
        return isSameOrAfter(entry.date, weekStart);
      });

      return {
        memberId: member.id,
        score: sumMinutes(entries),
        sessions: entries.length,
      };
    })
    .sort((a, b) => b.score - a.score || a.memberId.localeCompare(b.memberId));
}

function getStreak(memberId) {
  const dates = new Set(
    state.entries
      .filter((entry) => entry.memberId === memberId && entry.minutes > 0)
      .map((entry) => entry.date),
  );
  let cursor = new Date();
  let streak = 0;

  for (let i = 0; i < 60; i += 1) {
    const date = formatDate(cursor);
    if (!dates.has(date)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getLastActivity(memberId) {
  const entry = state.entries
    .filter((item) => item.memberId === memberId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return entry ? `${entry.type} ${entry.minutes} 分鐘` : "";
}

function createSeedState() {
  const today = new Date();
  const entries = [
    seedEntry("大秉", today, "跑步", 45, "中等", "河堤配速穩"),
    seedEntry("秀朱", today, "健身", 60, "高強度", "腿日完成"),
    seedEntry("呂欣", today, "瑜伽", 35, "輕鬆", "肩頸舒服很多"),
    seedEntry("Celia", addDays(today, -1), "騎車", 75, "中等", "晚風剛好"),
    seedEntry("Anki", addDays(today, -1), "走路", 50, "輕鬆", "飯後散步"),
    seedEntry("大秉", addDays(today, -1), "健身", 40, "中等", ""),
    seedEntry("秀朱", addDays(today, -1), "跑步", 30, "中等", ""),
    seedEntry("春蘭", addDays(today, -2), "球類", 90, "高強度", "三對三"),
    seedEntry("Ray", addDays(today, -2), "跑步", 25, "中等", ""),
    seedEntry("Jessica", addDays(today, -2), "瑜伽", 30, "輕鬆", ""),
  ];

  entries[0].reactions = { cheer: ["秀朱", "呂欣"], fire: ["Celia"] };
  entries[1].reactions = { cheer: ["大秉"], fire: ["呂欣", "Anki"] };
  entries[2].reactions = { cheer: ["Ray"], fire: [] };

  return {
    currentMemberId: "大秉",
    members: normalizeMembers(DEFAULT_MEMBERS),
    entries,
  };
}

function seedEntry(memberId, date, type, minutes, intensity, note) {
  const dateText = formatDate(date);
  return {
    id: `${memberId}-${dateText}`,
    memberId,
    date: dateText,
    type,
    minutes,
    intensity,
    note,
    reactions: {},
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createSeedState();
}

function sanitizeStateForMembers() {
  const validMemberIds = new Set(members.map((member) => member.id));
  state.currentMemberId = canonicalMemberId(state.currentMemberId);
  if (!validMemberIds.has(state.currentMemberId)) {
    state.currentMemberId = members[0].id;
  }
  state.entries = (state.entries || [])
    .map((entry) => ({
      ...entry,
      memberId: canonicalMemberId(entry.memberId),
    }))
    .filter((entry) => validMemberIds.has(entry.memberId))
    .map((entry) => ({
      ...entry,
      reactions: normalizeReactions(entry.reactions, validMemberIds, members),
    }));
}

function saveState(options = {}) {
  state.members = members;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (options.remote !== false) queueRemoteSave();
}

function queueRemoteSave() {
  if (!hasRemoteConfig()) return false;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    flushRemoteSave();
  }, 250);
}

async function flushRemoteSave() {
  if (!hasRemoteConfig()) return false;
  window.clearTimeout(syncTimer);
  try {
    await saveRemoteState();
    setSyncStatus("已同步", "ok");
    return true;
  } catch (error) {
    warnRemoteSync(error);
    return false;
  }
}

function hasRemoteConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function loadRemoteState({ silent = false } = {}) {
  if (!hasRemoteConfig()) return false;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(SUPABASE_STATE_ID)}&select=data&limit=1`,
      { headers: supabaseHeaders() },
    );

    if (!response.ok) {
      throw new Error(`Load failed: ${response.status}`);
    }

    const [remoteRow] = await response.json();
    if (!remoteRow?.data) {
      await saveRemoteState();
      setSyncStatus("已同步", "ok");
      return true;
    }

    applySharedState(remoteRow.data);
    setSyncStatus("已同步", "ok");
    if (!silent) showToast("已載入線上資料");
    return true;
  } catch (error) {
    warnRemoteSync(error);
    if (!silent) showToast("線上同步失敗，先使用此裝置資料");
    return false;
  }
}

async function saveRemoteState() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: supabaseHeaders({
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      id: SUPABASE_STATE_ID,
      data: getSharedState(),
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Save failed: ${response.status}`);
  }
}

function getSharedState() {
  return {
    members,
    entries: state.entries,
  };
}

function applySharedState(data) {
  const sharedState = normalizeSharedState(data);
  members = sharedState.members;
  Object.assign(state, sharedState);
  hydrateMemberSelect();
  els.memberSelect.value = state.currentMemberId;
  els.entryMemberSelect.value = state.currentMemberId;
  els.entryDate.value = latestEntryDate(state.entries) || els.entryDate.value || formatDate(new Date());
  saveState({ remote: false });
  syncFormWithEntry();
  render();
}

function normalizeSharedState(data) {
  const memberList = normalizeMembers(DEFAULT_MEMBERS);
  const validMemberIds = new Set(memberList.map((member) => member.id));
  const entries = (Array.isArray(data?.entries) ? data.entries : [])
    .map((entry, index) => {
      const memberId = coerceMemberId(entry.memberId, validMemberIds, memberList);
      if (!memberId) return null;
      const date = normalizeDate(entry.date) || formatDate(new Date());
      return {
        id: entry.id || `${memberId}-${date}-${index}`,
        memberId,
        date,
        type: String(entry.type || "其他").slice(0, 12),
        minutes: clamp(Number(entry.minutes || 0), 1, MAX_DAILY_MINUTES),
        intensity: String(entry.intensity || "中等").slice(0, 12),
        note: String(entry.note || "").slice(0, 32),
        reactions: normalizeReactions(entry.reactions, validMemberIds, memberList),
      };
    })
    .filter(Boolean);

  return {
    currentMemberId: coerceMemberId(state.currentMemberId, validMemberIds, memberList) || memberList[0].id,
    members: memberList,
    entries,
  };
}

function warnRemoteSync(error) {
  console.warn("Supabase sync failed", error);
  setSyncStatus("同步失敗", "error");
  if (Date.now() - syncWarningTimer < 5000) return;
  syncWarningTimer = Date.now();
  showToast("線上同步失敗，已先存在此裝置");
}

function setSyncStatus(message, status = "") {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = message;
  els.syncStatus.dataset.status = status;
}

function exportData() {
  const rows = state.entries.map((entry) => ({
    currentMemberId: state.currentMemberId,
    memberId: entry.memberId,
    date: entry.date,
    type: entry.type,
    minutes: entry.minutes,
    intensity: entry.intensity,
    note: entry.note,
    cheer: (entry.reactions?.cheer || []).join(";"),
    fire: (entry.reactions?.fire || []).join(";"),
  }));
  const blob = new Blob([toCsv(rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `moverank-${formatDate(new Date())}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("已匯出 CSV 備份");
}

function normalizeImportedState(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Missing entries");
  }

  const importedMembers = normalizeMembers(DEFAULT_MEMBERS);
  const validMemberIds = new Set(importedMembers.map((member) => member.id));
  const entries = rows.map((entry, index) => {
    const memberId = coerceMemberId(entry.memberId, validMemberIds, importedMembers) || importedMembers[0].id;
    if (!coerceMemberId(entry.memberId, validMemberIds, importedMembers)) return null;
    const date = normalizeDate(entry.date) || formatDate(new Date());
    const id = `${memberId}-${date}-${index}`;
    return {
      id: entry.id || id,
      memberId,
      date,
      type: String(entry.type || "其他").slice(0, 12),
      minutes: clamp(Number(entry.minutes || 0), 1, MAX_DAILY_MINUTES),
      intensity: String(entry.intensity || "中等").slice(0, 12),
      note: String(entry.note || "").slice(0, 32),
      reactions: normalizeReactions({ cheer: splitMemberList(entry.cheer), fire: splitMemberList(entry.fire) }, validMemberIds, importedMembers),
    };
  }).filter(Boolean);

  const currentMemberId =
    coerceMemberId(rows[0].currentMemberId, validMemberIds, importedMembers) ||
    coerceMemberId(rows[0].memberId, validMemberIds, importedMembers) ||
    importedMembers[0].id;

  return {
    currentMemberId,
    members: importedMembers,
    entries,
  };
}

function normalizeReactions(reactions = {}, validMemberIds, memberList = members) {
  return {
    cheer: uniqueValidMembers(reactions.cheer, validMemberIds, memberList),
    fire: uniqueValidMembers(reactions.fire, validMemberIds, memberList),
  };
}

function uniqueValidMembers(memberIds = [], validMemberIds, memberList = members) {
  if (!Array.isArray(memberIds)) return [];
  return [...new Set(memberIds.map((memberId) => coerceMemberId(memberId, validMemberIds, memberList)).filter(Boolean))];
}

function coerceMemberId(value, validMemberIds, memberList = members) {
  const text = canonicalMemberId(value);
  if (validMemberIds.has(text)) return text;
  const byName = memberList.find((member) => member.name.toLowerCase() === text.toLowerCase());
  return byName?.id || "";
}

function canonicalMemberId(value) {
  const text = String(value || "").trim();
  return MEMBER_ALIASES[text] || text;
}

function membersFromCsvRows(rows) {
  const names = [];
  const addName = (value) => {
    const text = String(value || "").trim();
    if (text && !names.some((name) => name.toLowerCase() === text.toLowerCase())) {
      names.push(text);
    }
  };

  rows.forEach((row) => {
    addName(row.memberId);
    addName(row.currentMemberId);
    splitMemberList(row.cheer).forEach(addName);
    splitMemberList(row.fire).forEach(addName);
  });

  return normalizeMembers(names.length ? names.map((name) => ({ id: name, name })) : DEFAULT_MEMBERS);
}

function normalizeMembers(memberList) {
  const seen = new Set();
  return memberList
    .map((member, index) => {
      const name = String(member.name || member.id || "").trim();
      const id = String(member.id || name).trim();
      if (!id || seen.has(id.toLowerCase())) return null;
      seen.add(id.toLowerCase());
      return {
        id,
        name: name || id,
        color: member.color || MEMBER_COLORS[index % MEMBER_COLORS.length],
      };
    })
    .filter(Boolean);
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function splitMemberList(value = "") {
  return String(value)
    .split(/[;、|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toCsv(rows) {
  const headers = ["currentMemberId", "memberId", "date", "type", "minutes", "intensity", "note", "cheer", "fire"];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

function csvEscape(value = "") {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseCsv(csvText) {
  const text = String(csvText || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  row.push(value);
  rows.push(row);

  const nonEmptyRows = rows.filter((csvRow) => csvRow.some((cell) => String(cell).trim()));
  const [headers, ...body] = nonEmptyRows;
  if (!headers?.length) return [];

  const normalizedHeaders = headers.map((header) => header.trim());
  return body.map((csvRow) =>
    Object.fromEntries(normalizedHeaders.map((header, index) => [header, csvRow[index] ?? ""])),
  );
}

function getMember(memberId) {
  return members.find((member) => member.id === memberId) || members[0];
}

function sumMinutes(entries) {
  return entries.reduce((total, entry) => total + Number(entry.minutes || 0), 0);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date) {
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function shortDate(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return formatDate(copy);
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function isSameOrAfter(dateText, floorDateText) {
  return dateText >= floorDateText;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function initials(name) {
  return name.slice(0, 2).toUpperCase();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}

function reactionNames(memberIds = []) {
  if (!memberIds.length) return "尚無互動";
  return memberIds.map((memberId) => escapeHtml(getMember(memberId).name)).join("、");
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 1800);
}
