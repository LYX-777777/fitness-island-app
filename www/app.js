/*
[INPUT]: 依赖 index.html 的路线 DOM、plan.json 的 30 天训练路线、浏览器剪贴板能力、fetch/XMLHttpRequest、可选 localStorage 和 topMeta 打字机容器
[OUTPUT]: 对外提供由 plan.json 的 title/summary/type/phase/minutes 驱动的「动森训练岛」hero 文案、Animal Loading 启动状态、打字机日程行、游戏提示语、今日进度条、无文字状态标签的 7 日路线渲染、每日动作卡、黄色主按钮结算、奖励式每日完成弹窗、周复盘 Table 渲染、导出记录给 Agent、周复盘 Markdown 生成、plan.json 兜底加载和本地临时缓存
[POS]: fitness-island/assets 的静态行为目标，plan.json 是页面数据投影，本文件只做渲染与导出交接
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
*/

const STORAGE_KEY = "fitness-island-v1";
const DAY_MS = 24 * 60 * 60 * 1000;

function isNative() {
  return typeof window !== "undefined"
    && window.Capacitor
    && window.Capacitor.isNativePlatform();
}

const $ = (id) => document.querySelector(`#${id}`);

const nodes = {
  islandLoading: $("islandLoading"),
  islandLoadingText: $("islandLoadingText"),
  topMeta: $("topMeta"),
  topTitle: $("topTitle"),
  topSummary: $("topSummary"),
  heroProgressFill: $("heroProgressFill"),
  heroProgressText: $("heroProgressText"),
  weekPlant: $("weekPlant"),
  handoffTrigger: $("handoffTrigger"),
  weekLabel: $("weekLabel"),
  weekSignal: $("weekSignal"),
  weekRoute: $("weekRoute"),
  phaseLabel: $("phaseLabel"),
  sequenceTitle: $("sequenceTitle"),
  completionText: $("completionText"),
  exerciseList: $("exerciseList"),
  completeDay: $("completeDay"),
  reviewPanel: $("reviewPanel"),
  reviewAppear: $("reviewAppear"),
  reviewFull: $("reviewFull"),
  reviewMinimum: $("reviewMinimum"),
  reviewTable: $("reviewTable"),
  copyReview: $("copyReview"),
  toast: $("toast"),
  completeDialog: $("completeDialog"),
  closeComplete: $("closeComplete"),
  handoffDialog: $("handoffDialog"),
  painInput: $("painInput"),
  resistanceInput: $("resistanceInput"),
  cancelHandoff: $("cancelHandoff"),
  copyHandoff: $("copyHandoff"),
  openResetFromHandoff: $("openResetFromHandoff"),
  resetDialog: $("resetDialog"),
  cancelReset: $("cancelReset"),
  confirmReset: $("confirmReset"),
  navPrev: $("navPrev"),
  navComplete: $("navComplete"),
  navNext: $("navNext"),
  onboarding: $("onboarding"),
  onboardingSteps: $("onboardingSteps"),
  onboardingQuestion: $("onboardingQuestion"),
  onboardingHint: $("onboardingHint"),
  onboardingOptions: $("onboardingOptions"),
  onboardingTextWrap: $("onboardingTextWrap"),
  onboardingText: $("onboardingText"),
  onboardingPrev: $("onboardingPrev"),
  onboardingNext: $("onboardingNext"),
  floatingNav: $("floatingNav"),
  mineView: $("mineView"),
  mineStartDate: $("mineStartDate"),
  mineProfileGrid: $("mineProfileGrid"),
  mineCalendarGrid: $("mineCalendarGrid"),
  mineCustomizeBtn: $("mineCustomizeBtn"),
  mineResetBtn: $("mineResetBtn"),
  tabTrainingBtn: $("tabTrainingBtn"),
  tabMineBtn: $("tabMineBtn"),
  customizeDialog: $("customizeDialog"),
  customizeInput: $("customizeInput"),
  cancelCustomize: $("cancelCustomize"),
  copyCustomize: $("copyCustomize"),
  customizeHint: $("customizeHint"),
  previewDialog: $("previewDialog"),
  previewContent: $("previewContent"),
  closePreview: $("closePreview"),
  confirmPlan: $("confirmPlan")
};

let route = { weeks: [] };
let days = [];
let state = createState();
let toastTimer;
let heroTypeKey = "";
let heroTypeTimer;

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateKey, offset) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

const ONBOARDING_KEY = "fitness-island-onboarding-v1";

const onboardingQuestions = [
  {
    id: "place",
    title: "你主要在哪里运动？",
    hint: "这决定可用动作和路线设计。",
    type: "choice",
    options: [
      { value: "home", icon: "🏠", label: "家里", desc: "自重、弹力带、小器械" },
      { value: "gym", icon: "🏋️", label: "健身房", desc: "器械齐全" },
      { value: "outdoor", icon: "🌳", label: "户外 / 散步", desc: "走路、跑步、公园" },
      { value: "unknown", icon: "🤔", label: "不确定", desc: "先帮我想想" }
    ]
  },
  {
    id: "time",
    title: "每天最多能稳定拿出多久运动？",
    hint: "选真实可行的，不是理想状态。",
    type: "choice",
    options: [
      { value: "10-15", icon: "⏱️", label: "10–15 分钟" },
      { value: "20-30", icon: "⏱️", label: "20–30 分钟" },
      { value: "30-45", icon: "⏱️", label: "30–45 分钟" },
      { value: "45+", icon: "⏱️", label: "45 分钟以上" }
    ]
  },
  {
    id: "goal",
    title: "这轮运动岛，你最想达成什么？",
    hint: "单选最重要的那个。",
    type: "choice",
    options: [
      { value: "habit", icon: "📋", label: "建立运动习惯", desc: "每天出现就是胜利" },
      { value: "fatloss", icon: "🔥", label: "减脂", desc: "控制饮食 + 可持续消耗" },
      { value: "muscle", icon: "💪", label: "增肌", desc: "渐进负荷 + 蛋白质" },
      { value: "posture", icon: "🧘", label: "改善体态 / 缓解疼痛", desc: "稳定性 + 活动度优先" }
    ]
  },
  {
    id: "injury",
    title: "有没有需要避开的伤痛或旧伤？",
    hint: "这决定动作安全边界。没有就留空跳过。",
    type: "text",
    placeholder: "例如：腰椎间盘突出、右肩旧伤、膝盖怕负重…"
  }
];

let onboardingStep = 0;
let onboardingAnswers = {};

function isOnboardingDone() {
  try {
    if (isNative()) return false; // checked async in init
    return localStorage.getItem(ONBOARDING_KEY) === "done";
  } catch { return false; }
}

async function isOnboardingDoneAsync() {
  try {
    if (isNative()) {
      const { value } = await Capacitor.Preferences.get({ key: ONBOARDING_KEY });
      return value === "done";
    }
    return localStorage.getItem(ONBOARDING_KEY) === "done";
  } catch { return false; }
}

async function markOnboardingDone() {
  try {
    if (isNative()) {
      await Capacitor.Preferences.set({ key: ONBOARDING_KEY, value: "done" });
    } else {
      localStorage.setItem(ONBOARDING_KEY, "done");
    }
  } catch {}
}

function renderOnboarding() {
  const q = onboardingQuestions[onboardingStep];
  if (!q) return;

  // Update dots
  const dots = nodes.onboardingSteps.querySelectorAll(".onboarding-dot");
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === onboardingStep);
    dot.classList.toggle("done", i < onboardingStep);
  });

  // Update question
  nodes.onboardingQuestion.textContent = q.title;
  nodes.onboardingHint.textContent = q.hint;

  // Update options
  nodes.onboardingOptions.innerHTML = "";
  nodes.onboardingTextWrap.style.display = "none";
  nodes.onboardingOptions.style.display = "none";

  if (q.type === "choice") {
    nodes.onboardingOptions.style.display = "flex";
    q.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "onboarding-option";
      if (onboardingAnswers[q.id] === opt.value) btn.classList.add("selected");
      btn.innerHTML = `<span class="onboarding-option-icon">${opt.icon}</span><span class="onboarding-option-copy"><span class="onboarding-option-label">${opt.label}</span>${opt.desc ? `<span class="onboarding-option-desc">${opt.desc}</span>` : ""}</span>`;
      btn.addEventListener("click", () => {
        nodes.onboardingOptions.querySelectorAll(".onboarding-option").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        onboardingAnswers[q.id] = opt.value;
      });
      nodes.onboardingOptions.appendChild(btn);
    });
  } else if (q.type === "text") {
    nodes.onboardingTextWrap.style.display = "block";
    nodes.onboardingText.value = onboardingAnswers[q.id] || "";
    nodes.onboardingText.addEventListener("input", () => {
      onboardingAnswers[q.id] = nodes.onboardingText.value.trim();
    });
  }

  // Update buttons
  nodes.onboardingPrev.style.display = onboardingStep === 0 ? "none" : "";
  if (onboardingStep === onboardingQuestions.length - 1) {
    nodes.onboardingNext.textContent = "上岛 🌴";
    nodes.onboardingNext.classList.add("onboarding-btn-start");
  } else {
    nodes.onboardingNext.textContent = "下一题 ›";
    nodes.onboardingNext.classList.remove("onboarding-btn-start");
  }

  // Focus first option for choice questions
  if (q.type === "choice") {
    const first = nodes.onboardingOptions.querySelector(".onboarding-option");
    if (first) first.focus();
  }
}

async function finishOnboarding() {
  await markOnboardingDone();
  nodes.onboarding.classList.add("is-hidden");
  setTimeout(() => { nodes.onboarding.hidden = true; }, 300);
  render();
  scheduleDailyReminder();
}

// --- Tab Switching ---
let activeTab = "training";

function switchTab(tab) {
  activeTab = tab;
  const isTraining = tab === "training";

  // Toggle views
  nodes.floatingNav.style.display = isTraining ? "" : "none";
  nodes.mineView.style.display = isTraining ? "none" : "";
  document.querySelector(".app-shell").style.display = isTraining ? "" : "none";
  document.querySelector(".animal-footer-sea").style.display = isTraining ? "" : "none";

  // Toggle tab buttons
  nodes.tabTrainingBtn.classList.toggle("active", isTraining);
  nodes.tabTrainingBtn.setAttribute("aria-pressed", String(isTraining));
  nodes.tabMineBtn.classList.toggle("active", !isTraining);
  nodes.tabMineBtn.setAttribute("aria-pressed", String(!isTraining));

  if (!isTraining) renderMine();
}

// --- Mine View ---
function renderMine() {
  if (!days.length) return;
  renderMineProfile();
  renderMineCalendar();
}

function renderMineProfile() {
  const startDate = state.startDate || todayKey();
  const elapsed = Math.min(days.length, Math.max(1, currentPlanDay()));
  nodes.mineStartDate.textContent = `从 ${startDate} 开始 · 第 ${elapsed}/${days.length} 天`;

  const items = [];
  if (onboardingAnswers.place) {
    const label = { home: "🏠 家里", gym: "🏋️ 健身房", outdoor: "🌳 户外 / 散步", unknown: "🤔 不确定" }[onboardingAnswers.place] || onboardingAnswers.place;
    items.push({ label: "运动地点", value: label });
  }
  if (onboardingAnswers.time) {
    items.push({ label: "每天时间", value: onboardingAnswers.time + " 分钟" });
  }
  if (onboardingAnswers.goal) {
    const label = { habit: "📋 建立运动习惯", fatloss: "🔥 减脂", muscle: "💪 增肌", posture: "🧘 改善体态" }[onboardingAnswers.goal] || onboardingAnswers.goal;
    items.push({ label: "主要目标", value: label });
  }
  if (onboardingAnswers.injury) {
    items.push({ label: "需避开", value: onboardingAnswers.injury });
  }
  if (!items.length) {
    items.push({ label: "状态", value: "尚未填写个人档案" });
  }

  nodes.mineProfileGrid.innerHTML = items.map(i =>
    `<div class="mine-profile-item"><div class="mine-profile-item-label">${i.label}</div><div class="mine-profile-item-value">${i.value}</div></div>`
  ).join("");
}

function renderMineCalendar() {
  const current = currentPlanDay();
  const selected = state.selectedDay;
  nodes.mineCalendarGrid.innerHTML = days.map((plan, i) => {
    const day = i + 1;
    let cls = "mine-day-block";
    if (day === selected && day === current) cls += " today selected";
    else if (day === selected) cls += " selected";
    else if (day === current) cls += " today";
    if (isDayDone(day)) cls += " done";
    else if (dayAppeared(day)) cls += " appeared";
    else if (day < current) cls += " late";
    return `<button class="${cls}" type="button" aria-label="第 ${day} 天">${day}</button>`;
  }).join("");

  // Click to switch to training tab and select day
  nodes.mineCalendarGrid.querySelectorAll("button").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      state.selectedDay = i + 1;
      writeState();
      switchTab("training");
      transitionRender();
    });
  });
}

// --- Customize Plan ---
function openCustomizeDialog() {
  nodes.customizeDialog.hidden = false;
  nodes.customizeHint.style.display = "none";
  nodes.customizeInput.value = "";
  document.body.classList.add("modal-open");
  nodes.customizeInput.focus();
}

function closeCustomizeDialog() {
  nodes.customizeDialog.hidden = true;
  document.body.classList.remove("modal-open");
}

// --- Plan Generator ---
const PLAN_POOLS = {
  home: {
    intro: "一个 30 天的徒手家练打卡页",
    cardio: ["原地踏步", "5 分钟", "能完整说话"],
    strength: [
      ["深蹲", "15 次 × 2 组", "慢下快上"],
      ["臀桥", "15 次 × 2 组", "顶峰夹臀"],
      ["弓步蹲", "左右各 10 次 × 2 组", "膝盖不超脚尖"],
      ["跪姿俯卧撑", "10 次 × 2 组", "核心收紧"],
      ["平板支撑", "20-30 秒 × 2 组", "不塌腰"],
      ["死虫式", "左右各 8 次 × 2 组", "腰贴地"]
    ],
    finish: ["收尾拉伸", "2 分钟", "深呼吸"],
    minimum: ["原地踏步", "5 分钟", "盖个小章"]
  },
  gym: {
    intro: "一个 30 天的健身房入门打卡页",
    cardio: ["跑步机", "4.0 km/h，走 5 分钟", "能完整说话"],
    strength: [
      ["高位下拉", "20kg，2 组 × 10 次", "保留 3 次余力"],
      ["低位划船", "20kg，2 组 × 10 次", "背挺直"],
      ["肩推", "10kg，2 组 × 8 次", "不锁死肘"],
      ["侧平举", "5kg，2 组 × 12 次", "不耸肩"],
      ["腹部卷腹", "10kg，2 组 × 12 次", "慢一点"],
      ["坐姿划船", "15kg，2 组 × 10 次", "肩胛后收"]
    ],
    finish: ["跑步机", "4.0 km/h，走 5 分钟", "收尾"],
    minimum: ["跑步机", "4.0 km/h，走 5 分钟", "盖个小章"]
  },
  outdoor: {
    intro: "一个 30 天的户外运动打卡页",
    cardio: ["快走", "10 分钟", "能完整说话"],
    strength: [
      ["弓步走", "20 步 × 2 组", "保持平衡"],
      ["台阶上下", "15 次 × 2 组", "找公园台阶"],
      ["站立侧抬腿", "左右各 12 次 × 2 组", "扶墙保持稳定"],
      ["靠树静蹲", "30 秒 × 2 组", "背贴树"],
      ["长椅臂屈伸", "10 次 × 2 组", "找公园长椅"],
      ["草地平板支撑", "20-30 秒 × 2 组", "不塌腰"]
    ],
    finish: ["慢走放松", "3 分钟", "深呼吸"],
    minimum: ["快走", "5 分钟", "盖个小章"]
  }
};
PLAN_POOLS.unknown = PLAN_POOLS.home;

function parseRequest(text) {
  const t = text.toLowerCase();
  const changes = { overrides: [], exclusions: [], additions: [] };

  // Place changes
  if (t.includes("户外") || t.includes("公园") || t.includes("外面") || t.includes("室外")) changes.place = "outdoor";
  if (t.includes("健身房") || t.includes("器械") || t.includes("gym")) changes.place = "gym";
  if (t.includes("家里") || t.includes("在家") || t.includes("徒手") || t.includes("居家") || t.includes("自重")) changes.place = "home";

  // Time changes
  const timeMatch = t.match(/(\d+)\s*分/);
  if (timeMatch) {
    const m = parseInt(timeMatch[1]);
    if (m <= 12) changes.time = "10-15";
    else if (m <= 25) changes.time = "20-30";
    else if (m <= 40) changes.time = "30-45";
    else changes.time = "45+";
  }
  if (t.includes("时间短") || t.includes("快一点") || t.includes("赶时间")) changes.time = "10-15";
  if (t.includes("时间长") || t.includes("久一点") || t.includes("多练")) changes.time = "30-45";

  // Goal changes
  if (t.includes("减脂") || t.includes("减肥") || t.includes("瘦") || t.includes("燃脂") || t.includes("刷脂")) changes.goal = "fatloss";
  if (t.includes("增肌") || t.includes("长肌肉") || t.includes("变大") || t.includes("力量")) changes.goal = "muscle";
  if (t.includes("体态") || t.includes("驼背") || t.includes("骨盆") || t.includes("矫正") || t.includes("康复")) changes.goal = "posture";
  if (t.includes("习惯") || t.includes("坚持") || t.includes("入门") || t.includes("新手")) changes.goal = "habit";

  // Injury / body constraints (from request, adds to onboarding)
  if (t.includes("膝盖") || t.includes("knee")) { changes.injury = (changes.injury || "") + " 膝盖"; changes.exclusions.push("深蹲", "弓步蹲", "弓步走", "靠树静蹲"); }
  if (t.includes("腰") || t.includes("椎") || t.includes("back")) { changes.injury = (changes.injury || "") + " 腰椎"; changes.exclusions.push("硬拉"); }
  if (t.includes("肩") || t.includes("shoulder")) { changes.injury = (changes.injury || "") + " 肩"; changes.exclusions.push("肩推", "侧平举", "跪姿俯卧撑"); }
  if (t.includes("手腕") || t.includes("wrist")) { changes.exclusions.push("跪姿俯卧撑", "平板支撑", "长椅臂屈伸"); }

  // Specific exercise exclusions
  const exclKeywords = ["不要", "去掉", "删除", "不做", "换掉", "替换", "不想做", "别"];
  for (const kw of exclKeywords) {
    const idx = t.indexOf(kw);
    if (idx >= 0) {
      const after = t.slice(idx + kw.length, idx + kw.length + 20);
      const allMoves = [...PLAN_POOLS.home.strength, ...PLAN_POOLS.gym.strength, ...PLAN_POOLS.outdoor.strength];
      for (const m of allMoves) {
        if (after.includes(m[0].toLowerCase())) changes.exclusions.push(m[0]);
      }
    }
  }

  // Specific additions
  if (t.includes("开合跳")) changes.additions.push(["开合跳", "30 次 × 2 组", "落地缓冲"]);
  if (t.includes("波比")) changes.additions.push(["波比跳", "5 次 × 2 组", "简化版不跳"]);
  if (t.includes("拉伸") || t.includes("瑜伽")) changes.additions.push(["猫牛式", "10 次", "配合呼吸"]);
  if (t.includes("弹力带")) changes.overrides.push("已加入弹力带动作");

  // More/less volume
  if (t.includes("多练") || t.includes("加量") || t.includes("加强")) changes.moreVolume = true;
  if (t.includes("少练") || t.includes("减量") || t.includes("轻松") || t.includes("偷懒")) changes.lessVolume = true;

  return changes;
}

function buildPlan(requestText) {
  const changes = parseRequest(requestText || "");
  const place = changes.place || onboardingAnswers.place || "unknown";
  const time = changes.time || onboardingAnswers.time || "20-30";
  const goal = changes.goal || onboardingAnswers.goal || "habit";
  const injury = (onboardingAnswers.injury || "") + (changes.injury || "");

  const pool = PLAN_POOLS[place] || PLAN_POOLS.home;
  const baseMin = { "10-15": 8, "20-30": 12, "30-45": 18, "45+": 25 }[time] || 12;
  if (changes.lessVolume) { const v = { "10-15": 5, "20-30": 8, "30-45": 14, "45+": 20 }; changes._baseMin = v[time] || baseMin; }

  // Filter strength exercises
  let strengthPool = [...pool.strength];
  const allExclusions = [...changes.exclusions];

  const injuryLower = injury.toLowerCase();
  if (injuryLower.includes("膝") || injuryLower.includes("knee")) {
    allExclusions.push("深蹲", "弓步蹲", "弓步走", "靠树静蹲");
  }
  if (injuryLower.includes("腰") || injuryLower.includes("椎") || injuryLower.includes("back")) {
    allExclusions.push("硬拉");
    if (!strengthPool.find(e => e[0].includes("死虫式")) && !allExclusions.includes("死虫式")) {
      strengthPool.push(["死虫式", "左右各 8 次 × 2 组", "腰贴地，核心优先"]);
    }
  }
  if (injuryLower.includes("肩") || injuryLower.includes("shoulder")) {
    allExclusions.push("肩推", "侧平举", "跪姿俯卧撑");
  }

  strengthPool = strengthPool.filter(e => !allExclusions.includes(e[0]));
  if (strengthPool.length < 3) {
    // Universal safe fallback: core + stability
    strengthPool = [
      ["臀桥", "15 次 × 2 组", "顶峰夹臀"],
      ["平板支撑", "20 秒 × 2 组", "不塌腰"],
      ["死虫式", "左右各 8 次 × 2 组", "腰贴地"],
      ["站立侧抬腿", "左右各 12 次 × 2 组", "扶墙保持稳定"]
    ];
  }

  // Add user-requested exercises
  for (const add of changes.additions) {
    if (!strengthPool.find(e => e[0] === add[0])) strengthPool.push(add);
  }

  const goalProfiles = {
    habit: { walkMul: 1.0, strengthCount: [3, 3, 4, 4], signals: ["路线全灰，亮一颗。", "走路日变长一点。", "重量只记录，不硬加。", "路线尾端看见 next。"] },
    fatloss: { walkMul: 1.4, strengthCount: [3, 4, 4, 5], signals: ["先走起来。", "走路日加点量。", "循环密度再加一点。", "稳定消耗，不冲刺。"] },
    muscle: { walkMul: 0.8, strengthCount: [4, 4, 5, 5], signals: ["轻重量入门。", "加次数，不加重量。", "无痛才记录可加。", "身体会记住。"] },
    posture: { walkMul: 1.0, strengthCount: [3, 3, 4, 4], signals: ["动作干净优先。", "慢一点，再慢一点。", "稳定比用力更高级。", "这是系统，不是冲刺。"] }
  };
  const profile = goalProfiles[goal] || goalProfiles.habit;
  if (changes.moreVolume) profile.strengthCount = profile.strengthCount.map(c => Math.min(c + 1, 6));

  const themes = ["出现", "加入", "稳住", "巩固"];
  const plants = ["sprout", "leaf", "branch", "tree"];
  const finalBaseMin = changes._baseMin || baseMin;

  function makeDay(type, title, phase, summary, minutes, exs) {
    return { type, title, phase, summary, minutes, exercises: exs };
  }

  const weeks = themes.map((theme, wi) => {
    const wMin = finalBaseMin + wi * 3;
    const walkMin = Math.round(wMin * profile.walkMul);
    const sc = profile.strengthCount[wi];

    const lowerExs = strengthPool.filter((_, i) => i % 2 === 0).slice(0, sc);
    const upperExs = strengthPool.filter((_, i) => i % 2 === 1).slice(0, sc);
    const fullExs = strengthPool.slice(0, Math.min(sc + 1, strengthPool.length));

    const aDay = makeDay("A 训练", "下肢", "力量",
      "下肢日，先热身再做力量。", wMin,
      [[...pool.cardio], ...lowerExs, [...pool.finish]]);
    const bDay = makeDay("B 训练", "上肢 + 核心", "力量",
      "上肢和核心，动作干净比次数重要。", wMin,
      [[...pool.cardio], ...upperExs, [...pool.finish]]);
    const cDay = makeDay("C 训练", "全身循环", "轻循环",
      "每个动作只做 1 组，熟悉顺序。", wMin,
      [[...pool.cardio], ...fullExs, [...pool.finish]]);
    const walkDay = (phase) => makeDay("走路日", "走路日", phase,
      "今天只走路，不加力量，给身体留恢复空间。", walkMin,
      [[...pool.cardio], ["记录", "写下今天完成分钟数", "不断链"]]);
    const minDay = makeDay("最低承诺日", "最低承诺", "最低承诺",
      `哪天实在没空，${pool.minimum[0]} ${pool.minimum[1]}也能盖个章。不是失败，是习惯成功。`, 5,
      [[...pool.minimum]]);
    const minSummary = changes.overrides.length > 0 ? `已根据需求调整：${changes.overrides.join("；")}` : pool.intro.replace("一个 ", "").replace("打卡页", "");

    return {
      theme,
      signal: profile.signals[wi],
      sentence: theme === "出现" ? "今天来岛上走走。" : theme === "加入" ? "只加一点，不加压力。" : theme === "稳住" ? "稳定比用力更高级。" : "这是系统，不是冲刺。",
      plant: plants[wi],
      days: [
        aDay,
        walkDay("习惯加固"),
        bDay,
        walkDay("恢复"),
        cDay,
        walkDay(wi >= 2 ? "稳态心肺" : "心肺入门"),
        { ...minDay, review: true }
      ]
    };
  });

  return {
    contract: { INPUT: "依赖本地生成器和用户需求", OUTPUT: "对外提供 30 天训练路线", POS: "fitness-island-app 本地生成", PROTOCOL: "本地生成" },
    weeks,
    buffer: {
      theme: "缓冲", signal: "只走最低承诺。", sentence: "不补课，不惩罚。", plant: "seed",
      days: [
        makeDay("缓冲日", "缓冲", "缓冲", "只走最低承诺，给下个周期留入口。", 5, [[...pool.minimum]]),
        { ...makeDay("缓冲日", "缓冲", "缓冲", "最后一天，进入下一轮。", 5, [[...pool.minimum]]), review: true }
      ]
    }
  };
}

function makePlanPreview(plan, changes) {
  const lines = [];
  const firstDay = plan.weeks[0].days[0];
  const placeMatch = firstDay.exercises[0][0];
  const placeLabel = placeMatch.includes("跑步机") ? "gym" : placeMatch.includes("快走") ? "outdoor" : "home";
  const pool = PLAN_POOLS[placeLabel] || PLAN_POOLS.home;
  const avgMin = Math.round(plan.weeks.flatMap(w => w.days).reduce((s, d) => s + (d.minutes || 0), 0) / plan.weeks.flatMap(w => w.days).length);

  // Customization summary
  const diffs = [];
  const oa = onboardingAnswers || {};
  if (changes.place && changes.place !== oa.place) diffs.push(`场地：${oa.place||"未设置"} → ${changes.place}`);
  if (changes.time && changes.time !== oa.time) diffs.push(`时长：${oa.time||"未设置"} → ${changes.time}`);
  if (changes.goal && changes.goal !== oa.goal) {
    const gm = {habit:"建立习惯",fatloss:"减脂",muscle:"增肌",posture:"改善体态"};
    diffs.push(`目标：${gm[oa.goal]||oa.goal||"未设置"} → ${gm[changes.goal]||changes.goal}`);
  }
  if (changes.exclusions.length) diffs.push(`已移除：${changes.exclusions.join("、")}`);
  if (changes.additions.length) diffs.push(`已加入：${changes.additions.map(e=>e[0]).join("、")}`);
  if (changes.moreVolume) diffs.push("训练量：增加");
  if (changes.lessVolume) diffs.push("训练量：减少");
  if (changes.overrides.length) diffs.push(changes.overrides.join("；"));

  if (diffs.length) {
    lines.push(`<div class="preview-diff"><strong>根据你的需求已调整：</strong>${diffs.map(d => `<span class="preview-diff-tag">${d}</span>`).join("")}</div>`);
  }

  lines.push(`<p class="preview-intro">🏷️ ${pool.intro} · 日均可约 ${avgMin} 分钟</p>`);

  // Show first week in detail, rest in summary
  plan.weeks.forEach((w, wi) => {
    const dayExs = w.days.map(d => d.exercises.map(e => e[0]).join(" → "));
    const exSummary = [...new Set(w.days.flatMap(d => d.exercises.map(e => e[0])))].filter(e => e !== "记录").join(" · ");

    lines.push(`<div class="preview-week"><h4>第 ${wi + 1} 周 · ${w.theme} <span class="preview-plant">${w.plant === "sprout" ? "🌱" : w.plant === "leaf" ? "🍃" : w.plant === "branch" ? "🌿" : "🌳"}</span></h4>`);
    lines.push(`<p class="preview-signal">${w.signal}</p>`);

    const dayLabels = ["下肢", "走路", "上肢+核心", "走路", "全身循环", "走路", "最低承诺"];
    w.days.forEach((d, di) => {
      const names = d.exercises.map(e => e[0]).join(" → ");
      lines.push(`<div class="preview-day"><span class="preview-day-num">D${di + 1}</span> <span class="preview-day-type">${dayLabels[di] || d.type}</span> <span class="preview-day-exs">${names}</span> <span class="preview-day-min">${d.minutes}min</span></div>`);
    });
    lines.push("</div>");
  });

  lines.push(`<p class="preview-footer">💡 最低承诺：${pool.minimum[0]} ${pool.minimum[1]}也能不断链。</p>`);
  return lines.join("");
}

async function regeneratePlan() {
  const input = nodes.customizeInput.value.trim();
  if (!input) { showToast("请先描述你的新需求"); return; }

  let newPlan, changes;
  try {
    changes = parseRequest(input);
    newPlan = buildPlan(input);
  } catch (e) {
    showToast("生成失败，请重试");
    return;
  }

  closeCustomizeDialog();
  nodes.previewContent.innerHTML = makePlanPreview(newPlan, changes);
  nodes.previewDialog.hidden = false;
  document.body.classList.add("modal-open");
  window._pendingPlan = newPlan;
  window._pendingChanges = changes;
}

function closePreviewDialog() {
  nodes.previewDialog.hidden = true;
  document.body.classList.remove("modal-open");
  window._pendingPlan = null;
  window._pendingChanges = null;
}

async function confirmPlan() {
  if (!window._pendingPlan) return;
  const newPlan = window._pendingPlan;
  const changes = window._pendingChanges || {};
  window._pendingPlan = null;
  window._pendingChanges = null;

  // Sync onboardingAnswers
  if (changes.place) onboardingAnswers.place = changes.place;
  if (changes.time) onboardingAnswers.time = changes.time;
  if (changes.goal) onboardingAnswers.goal = changes.goal;
  if (changes.injury) {
    const existing = (onboardingAnswers.injury || "").trim();
    const added = changes.injury.trim();
    if (existing && !existing.includes(added)) onboardingAnswers.injury = existing + "；" + added;
    else if (!existing) onboardingAnswers.injury = added;
  }

  // Replace plan data
  days = loadDays(newPlan);
  route = newPlan;
  state = createState();

  await writeState();
  closePreviewDialog();
  switchTab("training");
  transitionRender({ toast: "新训练计划已生效" });
}

// --- Reset from Mine ---
async function resetFromMine() {
  if (!confirm("确定要清空所有完成记录，从第一天重新开始吗？")) return;
  state = createState();
  await writeState();
  switchTab("training");
  transitionRender({ toast: "路线已重置，从第一天重新开始" });
}

function createState() {
  return {
    startDate: todayKey(),
    lastSeen: todayKey(),
    selectedDay: 1,
    checks: {},
    days: {},
    settled: {}
  };
}

async function readState() {
  try {
    if (isNative()) {
      const { value } = await Capacitor.Preferences.get({ key: STORAGE_KEY });
      return value ? { ...createState(), ...JSON.parse(value) } : createState();
    }
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    return { ...createState(), ...saved };
  } catch {
    return createState();
  }
}

async function writeState() {
  try {
    if (isNative()) {
      await Capacitor.Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(state) });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Storage is cache, not truth source; keep session available on failure
  }
}

async function scheduleDailyReminder() {
  if (!isNative()) return;
  try {
    const perm = await Capacitor.Plugins.LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;

    await Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: 1 }] });
    await Capacitor.Plugins.LocalNotifications.schedule({
      notifications: [{
        id: 1,
        title: "动森训练岛",
        body: "今天来岛上走走？",
        schedule: { on: { hour: 18, minute: 0 }, every: "day" },
        sound: "default",
        extra: { type: "daily_reminder" }
      }]
    });
  } catch {
    // Notification is bonus feature; fail silently
  }
}

function loadJson(url) {
  if (typeof fetch === "function") {
    return fetch(url).then((response) => {
      if (!response.ok) throw new Error("plan.json load failed");
      return response.json();
    }).catch(() => loadJsonWithRequest(url));
  }

  return loadJsonWithRequest(url);
}

function loadJsonWithRequest(url) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = "json";
    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`HTTP ${request.status}`));
        return;
      }

      resolve(request.response || JSON.parse(request.responseText));
    });
    request.addEventListener("error", () => reject(new Error("plan load failed")));
    request.send();
  });
}

function loadDays(plan) {
  const weekDays = plan.weeks.flatMap((week, weekIndex) =>
    week.days.map((day, dayIndex) => normalizeDay(day, week, weekIndex, dayIndex))
  );
  const bufferDays = (plan.buffer?.days || []).map((day, dayIndex) =>
    normalizeDay(day, plan.buffer, plan.weeks.length, dayIndex)
  );

  return [...weekDays, ...bufferDays]
    .slice(0, 30)
    .map((day, index) => ({ ...day, planDay: index + 1 }));
}

function normalizeDay(day, group, weekIndex, dayIndex) {
  return {
    ...day,
    weekIndex,
    dayIndex,
    weekTheme: group.theme,
    weekSignal: group.signal,
    weekSentence: group.sentence,
    plant: group.plant
  };
}

function currentPlanDay() {
  const [startYear, startMonth, startDay] = state.startDate.split("-").map(Number);
  const [nowYear, nowMonth, nowDay] = todayKey().split("-").map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);
  const now = new Date(nowYear, nowMonth - 1, nowDay);
  const diff = Math.floor((now - start) / DAY_MS) + 1;
  return Math.min(days.length, Math.max(1, diff));
}

function planFor(day) {
  return days[Math.min(days.length, Math.max(1, day)) - 1];
}

function weekFor(day) {
  const plan = planFor(day);
  return {
    theme: plan.weekTheme,
    signal: plan.weekSignal,
    sentence: plan.weekSentence,
    plant: plan.plant
  };
}

function weekRangeFor(day) {
  const weekIndex = planFor(day).weekIndex;
  const sameWeek = days.filter((item) => item.weekIndex === weekIndex);
  const startDay = sameWeek[0].planDay;
  const endDay = sameWeek.at(-1).planDay;
  return { startDay, endDay };
}

function dayChecks(day) {
  return state.checks[day] || [];
}

function setDayChecks(day, checks) {
  state.checks[day] = checks;
}

function isDayDone(day) {
  return Boolean(state.days[day]);
}

function isDaySettled(day) {
  return Boolean(state.settled?.[day]);
}

function dayAppeared(day) {
  return isDayDone(day) || isDaySettled(day) || dayChecks(day).some(Boolean);
}

function checkedCount(day) {
  return dayChecks(day).filter(Boolean).length;
}

function dayStatus(day) {
  if (isDayDone(day)) return "完整";
  if (dayAppeared(day)) return "出现";
  return "待补";
}

function routeStatusLabel(day, current) {
  if (isDayDone(day)) return "完成";
  if (day === current) return dayAppeared(day) ? "进行" : "今天";
  if (day < current && !dayAppeared(day)) return "未完成";
  if (dayAppeared(day)) return "出现";
  return "待做";
}

function peakAppearedStreak(weekDays) {
  let peak = 0;
  let count = 0;

  weekDays.forEach((day) => {
    count = dayAppeared(day) ? count + 1 : 0;
    peak = Math.max(peak, count);
  });

  return peak;
}

function exerciseReviewStats(weekDays) {
  const stats = new Map();

  weekDays.forEach((day) => {
    const checks = dayChecks(day);
    planFor(day).exercises.forEach(([name], index) => {
      const stat = stats.get(name) || { name, done: 0, total: 0 };
      stat.total += 1;
      if (checks[index]) stat.done += 1;
      stats.set(name, stat);
    });
  });

  const list = [...stats.values()];
  const byRatio = (item) => item.done / item.total;
  const active = list.filter((item) => item.done > 0);
  const stable = active.sort((a, b) => byRatio(b) - byRatio(a) || b.done - a.done)[0];
  const weakest = list.sort((a, b) => byRatio(a) - byRatio(b) || a.done - b.done)[0];
  const format = (item) => item ? `${item.name} (${item.done}/${item.total})` : "待记录";

  return {
    stable: format(stable),
    weakest: format(weakest)
  };
}

function dayTrailItem(day) {
  if (isDayDone(day)) return { label: `D${day}`, status: "done", text: "✓" };
  if (dayAppeared(day)) return { label: `D${day}`, status: "appeared", text: "·" };
  return { label: `D${day}`, status: "missed", text: "x" };
}

function weeklyReview(day = state.selectedDay, input = {}) {
  const { startDay, endDay } = weekRangeFor(day);
  const weekDays = Array.from({ length: endDay - startDay + 1 }, (_, index) => startDay + index);
  const appeared = weekDays.filter(dayAppeared).length;
  const full = weekDays.filter(isDayDone).length;
  const minimum = weekDays.filter((item) => dayAppeared(item) && !isDayDone(item)).length;
  const weekNumber = planFor(day).weekIndex + 1;
  const startDate = addDays(state.startDate, startDay - 1);
  const endDate = addDays(state.startDate, endDay - 1);
  const stats = exerciseReviewStats(weekDays);
  const trailItems = weekDays.map(dayTrailItem);
  const trail = weekDays
    .map((item) => `Day ${item}${isDayDone(item) ? "✓" : dayAppeared(item) ? "·" : "x"}`)
    .join(" ");
  const lines = [
    `## Last Week (Week ${weekNumber}, ${startDate} ~ ${endDate})`,
    `完成: ${full}/${weekDays.length} (${trail})`,
    `最稳: ${stats.stable}`,
    `最弱: ${stats.weakest}`,
    `连续到场峰值: ${peakAppearedStreak(weekDays)} 天`
  ];

  const pain = input.pain?.trim();
  const resistance = input.resistance?.trim();
  if (pain) lines.push(`疼痛: ${pain}`);
  if (resistance) lines.push(`阻力: ${resistance}`);
  lines.push("", "→ 按 Next Week Rule 生成下周");

  return {
    appeared,
    full,
    minimum,
    trailItems,
    rows: [
      { key: "period", item: "周期", value: `第 ${weekNumber} 周`, note: `${startDate} ~ ${endDate}` },
      { key: "completion", item: "完成", value: `${full}/${weekDays.length}`, note: trailItems },
      { key: "stable", item: "最稳", value: stats.stable, note: "保持这个入口" },
      { key: "weakest", item: "最弱", value: stats.weakest, note: "下周别加码" },
      { key: "streak", item: "连续", value: `${peakAppearedStreak(weekDays)} 天`, note: "到场峰值" }
    ],
    text: lines.join("\n")
  };
}

function appendTextCell(row, text, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

function appendTrailCell(row, items) {
  const cell = document.createElement("td");
  cell.className = "review-trail-cell";
  const wrap = document.createElement("div");
  wrap.className = "review-trail";

  items.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = `review-day-chip ${item.status}`;
    chip.textContent = `${item.label}${item.text}`;
    wrap.appendChild(chip);
  });

  cell.appendChild(wrap);
  row.appendChild(cell);
}

function renderReviewTable(review) {
  nodes.reviewTable.replaceChildren();

  const table = document.createElement("table");
  table.className = "review-table";

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["项目", "结果", "记录"].forEach((title) => appendTextCell(headRow, title));
  head.appendChild(headRow);

  const body = document.createElement("tbody");
  review.rows.forEach((item, index) => {
    const row = document.createElement("tr");
    if (index % 2 === 1) row.className = "striped";
    appendTextCell(row, item.item, "review-item-cell");
    appendTextCell(row, item.value, "review-value-cell");
    if (Array.isArray(item.note)) appendTrailCell(row, item.note);
    else appendTextCell(row, item.note, "review-note-cell");
    body.appendChild(row);
  });

  table.append(head, body);
  nodes.reviewTable.appendChild(table);
}

function typewriterLine(node, text, key) {
  window.clearTimeout(heroTypeTimer);
  if (heroTypeKey === key || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.textContent = text;
    heroTypeKey = key;
    return;
  }

  heroTypeKey = key;
  node.textContent = "";
  let index = 0;
  const tick = () => {
    node.textContent = text.slice(0, index);
    index += 1;
    if (index <= text.length) heroTypeTimer = window.setTimeout(tick, 42);
  };
  tick();
}

function renderTop(day) {
  const plan = planFor(day);
  const weekName = plan.weekIndex >= route.weeks.length ? "缓冲" : `第 ${plan.weekIndex + 1} 周`;
  const week = weekFor(day);
  const done = isDayDone(day);
  const appeared = dayAppeared(day);
  const checked = checkedCount(day);
  const total = plan.exercises.length;
  const statusLine = done ? "锻炼啦！已盖章" : appeared ? (plan.summary || "锻炼啦！继续走") : (plan.summary || week.sentence || "锻炼啦！待盖章");
  const metaParts = [`${weekName} · 第 ${day} 天`];
  if (plan.minutes) metaParts.push(`${plan.minutes} 分钟`);
  nodes.topTitle.textContent = "动森训练岛";
  typewriterLine(nodes.topMeta, metaParts.join(" · "), `${day}:${weekName}:${plan.minutes || ""}`);
  nodes.topSummary.textContent = statusLine;
  nodes.heroProgressFill.style.width = `${Math.round((checked / total) * 100)}%`;
  nodes.heroProgressText.textContent = `${checked}/${total}`;
  nodes.weekLabel.textContent = `${weekName} · 第 ${day} 天`;
  nodes.weekSignal.textContent = done ? "今天已完成" : appeared ? "今天进行中" : (week.signal || "今天未完成");
  nodes.weekPlant.dataset.plant = week.plant || "sprout";
  nodes.phaseLabel.textContent = [plan.type, plan.phase].filter(Boolean).join(" · ");
  nodes.sequenceTitle.textContent = plan.title || "今日顺序";
}

function renderWeekRoute(day) {
  const current = currentPlanDay();
  const { startDay, endDay } = weekRangeFor(day);
  nodes.weekRoute.innerHTML = "";

  for (let item = startDay; item <= endDay; item += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "route-node";
    const label = routeStatusLabel(item, current);
    button.setAttribute("aria-label", `第 ${item} 天，${label}`);
    if (item === day) {
      button.classList.add("selected");
      button.setAttribute("aria-current", "true");
    }
    if (item === current) button.classList.add("today");
    if (isDayDone(item)) button.classList.add("done");
    if (dayAppeared(item) && !isDayDone(item)) button.classList.add("appeared");
    if (item < current && !dayAppeared(item)) button.classList.add("late");
    if (planFor(item).review) button.classList.add("review");
    button.innerHTML = `
      <span>${item}</span>
    `;
    button.addEventListener("click", async () => {
      state.selectedDay = item;
      await writeState();
      transitionRender();
    });
    nodes.weekRoute.appendChild(button);
  }
}

function renderExercises(day) {
  const plan = planFor(day);
  const checks = dayChecks(day);
  nodes.exerciseList.innerHTML = "";

  plan.exercises.forEach(([name, detail, note], index) => {
    const item = document.createElement("li");
    item.className = `exercise-item${checks[index] ? " done" : ""}`;
    item.innerHTML = `
      <button class="check-button" type="button" aria-label="切换 ${name} 完成状态" aria-pressed="${Boolean(checks[index])}">${checks[index] ? "✓" : ""}</button>
      <div class="exercise-copy">
        <h3 class="exercise-title-row">
          <span class="exercise-name">${name}</span>
        </h3>
        <p class="exercise-detail">${detail}</p>
        <small class="exercise-note">${note}</small>
      </div>
    `;

    item.querySelector("button").addEventListener("click", async () => {
      const wasDone = isDayDone(day);
      const next = [...dayChecks(day)];
      next[index] = !next[index];
      setDayChecks(day, next);
      state.days[day] = next.filter(Boolean).length === plan.exercises.length;
      await writeState();
      showToast(next[index] ? `${name} 已记录` : `${name} 已取消`);
      transitionRender();
      if (!wasDone && state.days[day]) openCompleteDialog();
    });

    nodes.exerciseList.appendChild(item);
  });
}

function renderReview(day) {
  const review = weeklyReview(day);
  nodes.reviewPanel.hidden = !planFor(day).review;
  nodes.reviewAppear.textContent = review.appeared;
  nodes.reviewFull.textContent = review.full;
  nodes.reviewMinimum.textContent = review.minimum;
  renderReviewTable(review);
}

async function render(options = {}) {
  const day = state.selectedDay || currentPlanDay();
  const plan = planFor(day);
  const done = isDayDone(day);
  const checked = checkedCount(day);

  renderTop(day);
  renderWeekRoute(day);
  renderExercises(day);
  renderReview(day);

  const actionText = completionActionText(day);
  nodes.completionText.textContent = `${checked}/${plan.exercises.length}`;
  nodes.completeDay.textContent = actionText;
  nodes.completeDay.classList.toggle("done", done);
  nodes.completeDay.setAttribute("aria-pressed", String(done));
  nodes.navComplete.setAttribute("aria-label", actionText);

  if (options.toast) showToast(options.toast);
  await writeState();
}

function transitionRender(options = {}) {
  const promise = render(options);
  if (document.startViewTransition) {
    document.startViewTransition(() => promise);
    return;
  }
  return promise;
}

function completionActionText(day) {
  const checked = checkedCount(day);
  const total = planFor(day).exercises.length;
  if (isDayDone(day)) return "今天已完成";
  if (checked > 0 && checked < total) return "今天到这";
  return "完成今天";
}

async function settleDay() {
  const day = state.selectedDay;
  state.settled = state.settled || {};
  state.settled[day] = true;
  state.selectedDay = Math.min(days.length, day + 1);
  await writeState();
  transitionRender({ toast: "已按当前进度收摊" });
}

async function completeDay() {
  const day = state.selectedDay;
  const checked = checkedCount(day);
  const total = planFor(day).exercises.length;
  if (isDayDone(day)) {
    openCompleteDialog();
    return;
  }
  if (checked > 0 && checked < total) {
    await settleDay();
    return;
  }

  setDayChecks(day, planFor(day).exercises.map(() => true));
  state.days[day] = true;
  await writeState();
  transitionRender();
  openCompleteDialog();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "-1000px";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

function showToast(message) {
  if (!nodes.toast) return;
  window.clearTimeout(toastTimer);
  nodes.toast.textContent = message;
  nodes.toast.classList.add("show");
  toastTimer = window.setTimeout(() => {
    nodes.toast.classList.remove("show");
  }, 2200);
}

function finishLoading() {
  if (!nodes.islandLoading) return;
  nodes.islandLoading.classList.add("is-hidden");
  nodes.islandLoading.setAttribute("aria-hidden", "true");
  window.setTimeout(() => {
    nodes.islandLoading.hidden = true;
  }, 280);
}

function showLoadingError() {
  if (nodes.islandLoadingText) nodes.islandLoadingText.textContent = "plan.json 加载失败";
  if (nodes.islandLoading) nodes.islandLoading.classList.add("is-error");
}

function openCompleteDialog() {
  nodes.completeDialog.hidden = false;
  document.body.classList.add("modal-open");
  nodes.closeComplete.focus();
}

function closeCompleteDialog() {
  nodes.completeDialog.hidden = true;
  document.body.classList.remove("modal-open");
  nodes.completeDay.focus();
}

function openHandoffDialog() {
  nodes.handoffDialog.hidden = false;
  document.body.classList.add("modal-open");
  nodes.painInput.focus();
}

function closeHandoffDialog() {
  nodes.handoffDialog.hidden = true;
  document.body.classList.remove("modal-open");
  nodes.handoffTrigger.focus();
}

async function copyHandoff() {
  const text = weeklyReview(state.selectedDay, {
    pain: nodes.painInput.value,
    resistance: nodes.resistanceInput.value
  }).text;

  await copyText(text);
  closeHandoffDialog();
  showToast("已复制，贴回对话给 Agent");
}

function openResetDialog() {
  nodes.handoffDialog.hidden = true;
  nodes.resetDialog.hidden = false;
  document.body.classList.add("modal-open");
  nodes.cancelReset.focus();
}

function closeResetDialog() {
  nodes.resetDialog.hidden = true;
  document.body.classList.remove("modal-open");
  nodes.handoffTrigger.focus();
}

async function resetPlan() {
  state = createState();
  await writeState();
  closeResetDialog();
  transitionRender({ toast: "路线已重置，从第一天重新开始" });
}

function bindEvents() {
  // Onboarding events
  nodes.onboardingPrev.addEventListener("click", () => {
    if (onboardingStep > 0) {
      onboardingStep -= 1;
      renderOnboarding();
    }
  });
  nodes.onboardingNext.addEventListener("click", async () => {
    const q = onboardingQuestions[onboardingStep];
    const hasAnswer = onboardingAnswers[q.id] !== undefined && onboardingAnswers[q.id] !== "";
    if (!hasAnswer && q.type === "choice") return; // must select

    if (onboardingStep < onboardingQuestions.length - 1) {
      onboardingStep += 1;
      renderOnboarding();
    } else {
      await finishOnboarding();
    }
  });

  nodes.completeDay.addEventListener("click", async () => { await completeDay(); });
  nodes.navComplete.addEventListener("click", async () => { await completeDay(); });
  nodes.navPrev.addEventListener("click", async () => {
    state.selectedDay = Math.max(1, state.selectedDay - 1);
    transitionRender();
  });
  nodes.navNext.addEventListener("click", async () => {
    state.selectedDay = Math.min(days.length, state.selectedDay + 1);
    transitionRender();
  });
  nodes.handoffTrigger.addEventListener("click", () => openHandoffDialog());
  nodes.closeComplete.addEventListener("click", () => closeCompleteDialog());
  nodes.completeDialog.addEventListener("click", (event) => {
    if (event.target === nodes.completeDialog) closeCompleteDialog();
  });
  nodes.copyReview.addEventListener("click", () => openHandoffDialog());
  nodes.cancelHandoff.addEventListener("click", () => closeHandoffDialog());
  nodes.copyHandoff.addEventListener("click", async () => {
    try {
      await copyHandoff();
    } catch {
      showToast("复制失败，请手动选中复盘文本");
    }
  });
  nodes.handoffDialog.addEventListener("click", (event) => {
    if (event.target === nodes.handoffDialog) closeHandoffDialog();
  });
  nodes.openResetFromHandoff.addEventListener("click", () => openResetDialog());
  nodes.cancelReset.addEventListener("click", () => closeResetDialog());
  nodes.confirmReset.addEventListener("click", async () => { await resetPlan(); });
  nodes.resetDialog.addEventListener("click", (event) => {
    if (event.target === nodes.resetDialog) closeResetDialog();
  });
  // Tab bar
  nodes.tabTrainingBtn.addEventListener("click", () => switchTab("training"));
  nodes.tabMineBtn.addEventListener("click", () => switchTab("mine"));

  // Mine page
  nodes.mineCustomizeBtn.addEventListener("click", () => openCustomizeDialog());
  nodes.mineResetBtn.addEventListener("click", async () => { await resetFromMine(); });

  // Customize dialog
  nodes.cancelCustomize.addEventListener("click", () => closeCustomizeDialog());
  nodes.copyCustomize.addEventListener("click", async () => { await regeneratePlan(); });
  nodes.customizeDialog.addEventListener("click", (event) => {
    if (event.target === nodes.customizeDialog) closeCustomizeDialog();
  });
  nodes.closePreview.addEventListener("click", () => closePreviewDialog());
  nodes.confirmPlan.addEventListener("click", async () => { await confirmPlan(); });
  nodes.previewDialog.addEventListener("click", (event) => {
    if (event.target === nodes.previewDialog) closePreviewDialog();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !nodes.completeDialog.hidden) closeCompleteDialog();
    if (event.key === "Escape" && !nodes.handoffDialog.hidden) closeHandoffDialog();
    if (event.key === "Escape" && !nodes.resetDialog.hidden) closeResetDialog();
    if (event.key === "Escape" && !nodes.customizeDialog.hidden) closeCustomizeDialog();
    if (event.key === "Escape" && !nodes.previewDialog.hidden) closePreviewDialog();
  });
}

async function init() {
  route = await loadJson("./plan.json?v=20260524-route");
  days = loadDays(route);
  state = await readState();

  if (state.lastSeen !== todayKey()) {
    state.selectedDay = currentPlanDay();
    state.lastSeen = todayKey();
  }

  state.selectedDay = Math.min(days.length, Math.max(1, state.selectedDay || currentPlanDay()));
  bindEvents();
  finishLoading();

  const onboardingDone = await isOnboardingDoneAsync();
  if (!onboardingDone) {
    nodes.onboarding.hidden = false;
    renderOnboarding();
  } else {
    render();
    scheduleDailyReminder();
  }
}

init().catch(() => {
  showLoadingError();
});
