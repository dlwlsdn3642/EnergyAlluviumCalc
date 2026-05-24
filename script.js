import {
  loadGameData,
  loadIncludeFourStar,
  loadShowUnownedOnly,
  loadShowSignature,
  loadExcludedWeapons,
  saveIncludeFourStar,
  saveShowUnownedOnly,
  saveShowSignature,
  saveExcludedWeapons,
} from "./data.js";
import {
  filterOptionsByExcludedWeapons,
  findPlans,
} from "./planner.js";

const state = {
  data: {
    dungeonData: [],
    optionData: [],
    commonBasics: [],
    weaponMetaByName: {},
  },
  isLoaded: false,
  excluded: loadExcludedWeapons(),
  fourStar: loadIncludeFourStar(),
  unownedOnly: loadShowUnownedOnly(),
  showSignature: loadShowSignature(),
};

const DOM = {};

document.addEventListener("DOMContentLoaded", async () => {
  [
    "calculate-btn",
    "calculate-canyon-btn",
    "result-content",
    "weapon-list",
  ].forEach((id) => (DOM[id] = document.getElementById(id)));

  initStatBoxes();
  initToggle(
    "fourstar-toggle-btn",
    "fourStar",
    saveIncludeFourStar,
    async () => {
      if (await refreshData()) {
        DOM["result-content"].textContent =
          `4성 옵션을 ${state.fourStar ? "포함" : "제외"}했습니다. 계산을 눌러주세요.`;
      }
    },
  );
  initToggle(
    "unowned-filter-btn",
    "unownedOnly",
    saveShowUnownedOnly,
    updateWeaponVisibility,
  );
  initToggle(
    "signature-weapon-toggle-btn",
    "showSignature",
    saveShowSignature,
    () => {
      document.body.classList.toggle(
        "show-signature-weapon",
        state.showSignature,
      );
    },
  );
  document.body.classList.toggle("show-signature-weapon", state.showSignature);

  DOM["calculate-btn"].addEventListener("click", () =>
    runCalculation(Math.max(...state.data.dungeonData.map((d) => d.id))),
  );
  // "4번 협곡" 버튼은 id 1~4 던전 그룹만 대상으로 계산한다.
  DOM["calculate-canyon-btn"].addEventListener("click", () =>
    runCalculation(4),
  );

  setupWeaponListDelegation();
  setupResultToggleDelegation();

  if (!(await refreshData())) renderLoadFailure();
});

async function refreshData() {
  const loaded = await loadGameData(state.fourStar);
  if (!loaded) {
    state.isLoaded = false;
    return false;
  }
  state.data = loaded;
  state.isLoaded = true;
  renderWeaponFilter();
  return true;
}

async function runCalculation(maxDungeonId) {
  if (!state.isLoaded && !(await refreshData())) {
    renderLoadFailure();
    return;
  }

  const selection = getAttributeSelection();
  const selectedCount = countSelectedAttributes(selection);

  if (selectedCount !== 3 && selectedCount !== 0) {
    DOM["result-content"].textContent =
      "기초/추가/스킬 속성은 3개를 모두 선택하거나, 모두 선택하지 않아야 합니다.";
    return;
  }

  const { dungeonData, optionData, commonBasics, weaponMetaByName } =
    state.data;
  const filteredOptions = filterOptionsByExcludedWeapons(
    optionData,
    state.excluded,
  );
  const commonArgs = {
    dungeonData,
    optionData: filteredOptions,
    commonBasics,
    maxDungeonId,
  };

  const plans = findPlans({
    selected: selectedCount ? selection : null,
    ...commonArgs,
  });
  if (!plans.length) return renderEmptyResult();

  DOM["result-content"].innerHTML = createPlanListMarkup(
    plans,
    weaponMetaByName,
    createResultSummary(plans.length, selectedCount),
  );
}

function getAttributeSelection() {
  return {
    basic: getSelected("basic"),
    additional: getSelected("additional"),
    skill: getSelected("skill"),
  };
}

const countSelectedAttributes = (selection) =>
  Object.values(selection).filter(Boolean).length;

function createResultSummary(planCount, selectedCount) {
  return selectedCount
    ? `선택한 3옵이 나오는 후보 ${planCount}개를 중첩 효율 순으로 정렬했습니다.`
    : `선택한 속성 없이 후보 ${planCount}개를 중첩 효율 순으로 정렬했습니다.`;
}

function createPlanListMarkup(plans, weaponMetaByName, summary) {
  const groups = groupPlansByDungeon(plans);
  return `
    <p class="result-list-summary">${escapeHtml(summary)} 같은 던전 후보는 묶어서 표시합니다.</p>
    <div class="result-list">
      ${groups.map((g, i) => `<div class="result-list-item"><div class="result-list-rank">#${i + 1}</div>${createDungeonGroupMarkup(g, weaponMetaByName)}</div>`).join("")}
    </div>
  `;
}

function groupPlansByDungeon(plans) {
  const groups = [];
  const groupByDungeonId = new Map();

  plans.forEach((plan) => {
    const key = plan.dungeon.id;
    if (!groupByDungeonId.has(key)) {
      const group = { dungeon: plan.dungeon, plans: [] };
      groupByDungeonId.set(key, group);
      groups.push(group);
    }
    groupByDungeonId.get(key).plans.push(plan);
  });

  return groups;
}

function initStatBoxes() {
  document.querySelectorAll(".stat-box").forEach((box) => {
    box.addEventListener("click", () => {
      const isSelected = box.classList.contains("selected");
      document
        .querySelectorAll(`.stat-box[data-group="${box.dataset.group}"]`)
        .forEach((b) => b.classList.remove("selected"));
      if (!isSelected) box.classList.add("selected");
    });
  });
}

function initToggle(id, stateKey, saveFn, callback) {
  const btn = document.getElementById(id);
  const applyState = () => {
    btn.classList.toggle("is-active", state[stateKey]);
    btn.setAttribute("aria-pressed", state[stateKey]);
  };
  applyState();
  btn.addEventListener("click", () => {
    state[stateKey] = !state[stateKey];
    applyState();
    saveFn(state[stateKey]);
    if (callback) callback();
  });
}

function setupWeaponListDelegation() {
  const toggleItem = (target) => {
    const item = target.closest(".weapon-item");
    if (!item) return;
    item.classList.toggle("is-excluded");
    syncSelections();
  };

  DOM["weapon-list"].addEventListener("click", (e) => toggleItem(e.target));
  DOM["weapon-list"].addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleItem(e.target);
    }
  });
}

function setupResultToggleDelegation() {
  const toggleDetails = (card) => {
    const details = card.nextElementSibling;
    if (!details?.classList.contains("matched-options")) return;
    const isCollapsed = details.classList.toggle("is-collapsed");
    details.hidden = isCollapsed;
    card.classList.toggle("is-collapsed", isCollapsed);
    card.setAttribute("aria-expanded", String(!isCollapsed));
  };

  DOM["result-content"].addEventListener("click", (e) => {
    const card = e.target.closest(".result-card");
    if (card && DOM["result-content"].contains(card)) toggleDetails(card);
  });

  DOM["result-content"].addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".result-card");
    if (!card || !DOM["result-content"].contains(card)) return;
    e.preventDefault();
    toggleDetails(card);
  });
}

function renderWeaponFilter() {
  const { optionData, weaponMetaByName } = state.data;
  const allWeapons = [...new Set(optionData.flatMap((r) => r.weapons))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));

  if (!allWeapons.length) {
    DOM["weapon-list"].textContent = "표시할 무기 목록이 없습니다.";
    return;
  }

  DOM["weapon-list"].innerHTML = allWeapons
    .map((w) => {
      const isExcluded = state.excluded.has(w);
      const meta = weaponMetaByName[w] || {};
      return `
      <div class="weapon-item ${isExcluded ? "is-excluded" : ""}" data-name="${w}" role="button" tabindex="0">
        ${renderWeaponCard(w, meta.options?.[0]?.text || "속성 정보 없음", meta.imageName, meta.signatureImageName, true)}
      </div>
    `;
    })
    .join("");

  syncSelections();
}

function syncSelections() {
  const items = Array.from(DOM["weapon-list"].querySelectorAll(".weapon-item"));
  const currentExcluded = new Set(
    items
      .filter((i) => i.classList.contains("is-excluded"))
      .map((i) => i.dataset.name),
  );
  const renderedNames = new Set(items.map((i) => i.dataset.name));

  const hiddenExcluded = [...state.excluded].filter(
    (w) => !renderedNames.has(w),
  );
  state.excluded = new Set([...hiddenExcluded, ...currentExcluded]);

  saveExcludedWeapons(state.excluded);
  updateWeaponVisibility();
}

function updateWeaponVisibility() {
  DOM["weapon-list"].querySelectorAll(".weapon-item").forEach((item) => {
    item.classList.toggle(
      "is-hidden-by-filter",
      state.unownedOnly && item.classList.contains("is-excluded"),
    );
  });
}

function createMatchedOptionItems(plan, weaponMeta) {
  return plan.matchedOptions
    .map(
      (o) => `
    <li>
      <span class="option-line">[${escapeHtml(o.basic)} / ${escapeHtml(o.additional)} / ${escapeHtml(o.skill)}]</span>
      <div class="weapon-card-list">
        ${
          o.weapons
            .map((w) =>
              renderWeaponCard(
                w,
                `${o.basic} / ${o.additional} / ${o.skill}`,
                weaponMeta[w]?.imageName,
                weaponMeta[w]?.signatureImageName,
              ),
            )
            .join("") || '<span class="weapon-empty">없음</span>'
        }
      </div>
    </li>
  `,
    )
    .join("");
}

function createPlanDetailMarkup(plan, weaponMeta) {
  return `
    <li>
      <div class="grouped-plan-summary">
        <span><strong>기본 3옵:</strong> ${plan.basicSet.map(escapeHtml).join(", ")}</span>
        <span><strong>고정:</strong> ${plan.fixedType === "additional" ? "추가" : "스킬"} 속성 고정 - ${escapeHtml(plan.fixedValue)}</span>
        <span><strong>개수:</strong> ${plan.overlapCount}개</span>
      </div>
      <ul class="grouped-plan-options">${createMatchedOptionItems(plan, weaponMeta)}</ul>
    </li>
  `;
}

function createDungeonGroupMarkup(group, weaponMeta) {
  if (group.plans.length === 1) {
    return createPlanResultMarkup(group.plans[0], weaponMeta);
  }

  const maxOverlapCount = Math.max(...group.plans.map((p) => p.overlapCount));
  const maxWeaponCount = Math.max(...group.plans.map((p) => p.weaponCount));
  return `
    <div class="result-card" role="button" tabindex="0" aria-expanded="true">
      <div class="dungeon-box">
        <img src="data/dungeon_images/${escapeHtml(group.dungeon.image_name)}" alt="${escapeHtml(group.dungeon.name)}" class="dungeon-image">
        <div class="dungeon-title">${escapeHtml(group.dungeon.name)}</div>
      </div>
      <div class="result-summary">
        <p><strong>파밍 후보:</strong> ${group.plans.length}개</p>
        <p><strong>최대 동시 파밍:</strong> ${maxWeaponCount}개 무기</p>
        <p><strong>최대 중첩 유효옵:</strong> ${maxOverlapCount}개</p>
        <p><strong>제외한 무기:</strong> ${state.excluded.size}개</p>
      </div>
    </div>
    <div class="matched-options"><ul>${group.plans.map((plan) => createPlanDetailMarkup(plan, weaponMeta)).join("")}</ul></div>
  `;
}

function createPlanResultMarkup(plan, weaponMeta) {
  const matchHtml = createMatchedOptionItems(plan, weaponMeta);
  return `
    <div class="result-card" role="button" tabindex="0" aria-expanded="true">
      <div class="dungeon-box">
        <img src="data/dungeon_images/${escapeHtml(plan.dungeon.image_name)}" alt="${escapeHtml(plan.dungeon.name)}" class="dungeon-image">
        <div class="dungeon-title">${escapeHtml(plan.dungeon.name)}</div>
      </div>
      <div class="result-summary">
        <p><strong>추천 기본 3옵:</strong> ${plan.basicSet.map(escapeHtml).join(", ")}</p>
        <p><strong>추천 고정:</strong> ${plan.fixedType === "additional" ? "추가" : "스킬"} 속성 고정 - ${escapeHtml(plan.fixedValue)}</p>
        <p><strong>중첩 유효옵:</strong> ${plan.overlapCount}개</p>
        <p><strong>제외한 무기:</strong> ${state.excluded.size}개</p>
      </div>
    </div>
    <div class="matched-options"><div class="matched-title">중첩 유효옵: ${plan.overlapCount}개</div><ul>${matchHtml}</ul></div>
  `;
}

function renderWeaponCard(name, attrs, img, sigImg, compact = false) {
  return `
    <div class="weapon-card ${compact ? "weapon-card--compact" : ""}">
      ${
        img
          ? `<img src="data/weapon_images/${escapeHtml(img)}" alt="${escapeHtml(name)}" class="weapon-card-image">`
          : '<div class="weapon-card-image weapon-card-image--placeholder" aria-hidden="true"></div>'
      }
      ${sigImg ? `<img src="data/characters/${escapeHtml(sigImg)}" aria-hidden="true" class="weapon-card-character-icon">` : ""}
      <div class="weapon-card-text">
        <div class="weapon-card-name">${escapeHtml(name)}</div>
        <div class="weapon-card-attrs">${escapeHtml(attrs)}</div>
      </div>
    </div>
  `;
}

function renderEmptyResult() {
  DOM["result-content"].innerHTML =
    `<p>조건에 맞는 던전이나 유효옵을 찾지 못했습니다.</p><p>제외된 무기: ${state.excluded.size}개</p><p>옵션을 변경해보세요.</p>`;
}

function renderLoadFailure() {
  DOM["result-content"].innerHTML =
    `<p>데이터 로드 실패. 로컬 서버 환경인지 확인해주세요.</p>`;
  DOM["weapon-list"].textContent = "데이터를 불러오지 못했습니다.";
}

const getSelected = (group) =>
  document
    .querySelector(`.stat-box[data-group="${group}"].selected`)
    ?.textContent.trim() || null;
const escapeHtml = (t) =>
  String(t ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
