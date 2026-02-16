import {
  loadGameData,
  loadIncludeFourStarFromCookie,
  loadExcludedWeaponsFromCookie,
  saveIncludeFourStarToCookie,
  saveExcludedWeaponsToCookie,
} from "./data.js";
import {
  filterOptionsByExcludedWeapons,
  findBestPlan,
  findBestPlanWithoutSelection,
} from "./planner.js";

document.addEventListener("DOMContentLoaded", async () => {
  const statBoxes = document.querySelectorAll(".stat-box");
  const calculateBtn = document.getElementById("calculate-btn");
  const calculateCanyonBtn = document.getElementById("calculate-canyon-btn");
  const resultContent = document.getElementById("result-content");
  const weaponList = document.getElementById("weapon-list");
  const weaponClearBtn = document.getElementById("weapon-clear-btn");
  const fourStarToggleBtn = document.getElementById("fourstar-toggle-btn");
  const weaponSelectedCount = document.getElementById("weapon-selected-count");

  let dungeonData = [];
  let optionData = [];
  let commonBasics = [];
  let isDataLoaded = false;
  let persistedExcludedWeapons = loadExcludedWeaponsFromCookie();
  let includeFourStarOptions = loadIncludeFourStarFromCookie();

  statBoxes.forEach((box) => {
    box.addEventListener("click", function () {
      const currentGroup = this.getAttribute("data-group");

      if (this.classList.contains("selected")) {
        this.classList.remove("selected");
        return;
      }

      const sameGroupSelected = document.querySelectorAll(
        `.stat-box[data-group="${currentGroup}"].selected`,
      );
      sameGroupSelected.forEach((selectedBox) => {
        selectedBox.classList.remove("selected");
      });

      this.classList.add("selected");
    });
  });

  applyFourStarToggleState(fourStarToggleBtn, includeFourStarOptions);

  async function refreshGameData() {
    const loadedData = await loadGameData(includeFourStarOptions);
    if (!loadedData) {
      isDataLoaded = false;
      return false;
    }

    dungeonData = loadedData.dungeonData;
    optionData = loadedData.optionData;
    commonBasics = loadedData.commonBasics;
    isDataLoaded = true;

    renderWeaponFilter({
      weaponList,
      weaponSelectedCount,
      optionRows: optionData,
      previouslySelected: persistedExcludedWeapons,
      onSelectionChanged: syncWeaponSelectionState,
    });
    return true;
  }

  const initialLoaded = await refreshGameData();
  if (!initialLoaded) {
    renderLoadFailure(resultContent, weaponList);
  }

  weaponClearBtn.addEventListener("click", () => {
    const checked = document.querySelectorAll(".weapon-checkbox:checked");
    checked.forEach((input) => {
      input.checked = false;
    });
    syncWeaponSelectionState();
  });

  fourStarToggleBtn.addEventListener("click", async () => {
    includeFourStarOptions = !includeFourStarOptions;
    applyFourStarToggleState(fourStarToggleBtn, includeFourStarOptions);
    saveIncludeFourStarToCookie(includeFourStarOptions);

    const loaded = await refreshGameData();
    if (!loaded) {
      renderLoadFailure(resultContent, weaponList);
      return;
    }

    resultContent.textContent = includeFourStarOptions
      ? "4성 옵션을 포함했습니다. 계산을 눌러 결과를 확인하세요."
      : "4성 옵션을 제외했습니다. 계산을 눌러 결과를 확인하세요.";
  });

  calculateBtn.addEventListener("click", async () => {
    await runCalculation(5);
  });

  calculateCanyonBtn.addEventListener("click", async () => {
    await runCalculation(4);
  });

  async function runCalculation(maxDungeonId) {
    if (!isDataLoaded) {
      const loaded = await refreshGameData();
      if (!loaded) {
        renderLoadFailure(resultContent, weaponList);
        return;
      }
    }

    const selected = {
      basic: getSelectedOption("basic"),
      additional: getSelectedOption("additional"),
      skill: getSelectedOption("skill"),
    };
    const hasAllSelected =
      Boolean(selected.basic) &&
      Boolean(selected.additional) &&
      Boolean(selected.skill);
    const hasNoSelected =
      !selected.basic && !selected.additional && !selected.skill;

    if (!hasAllSelected && !hasNoSelected) {
      resultContent.textContent =
        "기초/추가/스킬 속성은 3개를 모두 선택하거나, 모두 선택하지 않은 상태로 계산해주세요.";
      return;
    }

    const excludedWeapons = getExcludedWeapons();
    const filteredOptions = filterOptionsByExcludedWeapons(
      optionData,
      excludedWeapons,
    );

    const bestPlan = hasNoSelected
      ? findBestPlanWithoutSelection({
          dungeonData,
          optionData: filteredOptions,
          commonBasics,
          maxDungeonId,
        })
      : findBestPlan({
          selected,
          dungeonData,
          optionData: filteredOptions,
          commonBasics,
          maxDungeonId,
        });

    if (!bestPlan || bestPlan.overlapCount === 0) {
      resultContent.innerHTML = `
        <p>선택한 옵션을 포함해 중첩되는 유효옵을 찾지 못했습니다.</p>
        <p>제외된 무기: ${excludedWeapons.size}개</p>
        <p>다른 옵션 조합으로 다시 계산해보세요.</p>
      `;
      return;
    }

    renderBestPlan(resultContent, bestPlan, excludedWeapons.size);
  }

  function getExcludedWeapons() {
    const checked = document.querySelectorAll(".weapon-checkbox:checked");
    return new Set([...checked].map((input) => input.value));
  }

  function syncWeaponSelectionState() {
    const excludedWeapons = getExcludedWeapons();
    persistedExcludedWeapons = excludedWeapons;
    saveExcludedWeaponsToCookie(excludedWeapons);
    weaponSelectedCount.textContent = `${excludedWeapons.size}개 선택`;
  }
});

function renderLoadFailure(resultContent, weaponList) {
  resultContent.innerHTML = `
    <p>데이터를 불러오지 못했습니다.</p>
    <p>로컬 서버(예: VSCode Live Server)로 페이지를 실행한 뒤 다시 시도해주세요.</p>
  `;
  weaponList.textContent = "무기 데이터를 불러오지 못했습니다.";
}

function applyFourStarToggleState(button, isIncluded) {
  button.classList.toggle("is-active", isIncluded);
  button.setAttribute("aria-pressed", isIncluded ? "true" : "false");
}

function renderWeaponFilter({
  weaponList,
  weaponSelectedCount,
  optionRows,
  previouslySelected = new Set(),
  onSelectionChanged,
}) {
  const allWeapons = [...new Set(optionRows.flatMap((row) => row.weapons))]
    .filter((weapon) => String(weapon).trim())
    .sort((a, b) => a.localeCompare(b, "ko"));

  if (allWeapons.length === 0) {
    weaponList.textContent = "표시할 무기 목록이 없습니다.";
    weaponSelectedCount.textContent = "0개 선택";
    onSelectionChanged();
    return;
  }

  weaponList.innerHTML = "";

  allWeapons.forEach((weaponName) => {
    const label = document.createElement("label");
    label.className = "weapon-item";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "weapon-checkbox";
    input.value = weaponName;
    input.checked = previouslySelected.has(weaponName);
    input.addEventListener("change", onSelectionChanged);

    const text = document.createElement("span");
    text.textContent = weaponName;

    label.append(input, text);
    weaponList.appendChild(label);
  });

  onSelectionChanged();
}

function getSelectedOption(group) {
  const selected = document.querySelector(
    `.stat-box[data-group="${group}"].selected`,
  );
  return selected ? selected.textContent.trim() : null;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderBestPlan(target, bestPlan, excludedWeaponCount = 0) {
  const fixedLabel =
    bestPlan.fixedType === "additional" ? "추가 속성 고정" : "스킬 속성 고정";
  const matchedWeaponText = bestPlan.weapons
    .map((weapon) => escapeHtml(weapon))
    .join(", ");

  const matchedOptionItems = bestPlan.matchedOptions
    .map((option) => {
      const weapons = option.weapons
        .map((weapon) => escapeHtml(weapon))
        .join(", ");
      return `
        <li>
          <span class="option-line">[${escapeHtml(option.basic)} / ${escapeHtml(option.additional)} / ${escapeHtml(option.skill)}]</span>
          <span class="weapon-line">${weapons}</span>
        </li>
      `;
    })
    .join("");

  target.innerHTML = `
    <div class="result-card">
      <div class="dungeon-box">
        <img src="data/${escapeHtml(bestPlan.dungeon.image_name)}" alt="${escapeHtml(bestPlan.dungeon.name)}" class="dungeon-image">
        <div class="dungeon-title">${escapeHtml(bestPlan.dungeon.name)}</div>
      </div>
      <div class="result-summary">
        <p><strong>추천 기본 3옵:</strong> ${bestPlan.basicSet.map((value) => escapeHtml(value)).join(", ")}</p>
        <p><strong>추천 고정:</strong> ${fixedLabel} - ${escapeHtml(bestPlan.fixedValue)}</p>
        <p><strong>중첩 유효옵:</strong> ${bestPlan.overlapCount}개</p>
        <p><strong>제외한 무기:</strong> ${excludedWeaponCount}개</p>
        <p><strong>해당 무기:</strong> ${matchedWeaponText || "없음"}</p>
      </div>
    </div>
    <div class="matched-options">
      <div class="matched-title">중첩 유효옵 상세</div>
      <ul>
        ${matchedOptionItems}
      </ul>
    </div>
  `;
}
