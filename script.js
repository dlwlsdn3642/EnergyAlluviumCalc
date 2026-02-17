import {
  loadGameData,
  loadIncludeFourStarFromCookie,
  loadShowUnownedOnlyFromCookie,
  loadShowSignatureWeaponFromCookie,
  loadExcludedWeaponsFromCookie,
  saveIncludeFourStarToCookie,
  saveShowUnownedOnlyToCookie,
  saveShowSignatureWeaponToCookie,
  saveExcludedWeaponsToCookie,
} from "./data.js";
import {
  filterOptionsByExcludedWeapons,
  findPlansByDungeon,
  findBestPlanWithoutSelection,
} from "./planner.js";

document.addEventListener("DOMContentLoaded", async () => {
  const statBoxes = document.querySelectorAll(".stat-box");
  const calculateBtn = document.getElementById("calculate-btn");
  const calculateCanyonBtn = document.getElementById("calculate-canyon-btn");
  const resultContent = document.getElementById("result-content");
  const weaponList = document.getElementById("weapon-list");
  const fourStarToggleBtn = document.getElementById("fourstar-toggle-btn");
  const unownedFilterBtn = document.getElementById("unowned-filter-btn");
  const signatureWeaponToggleBtn = document.getElementById(
    "signature-weapon-toggle-btn",
  );
  const weaponSelectedCount = document.getElementById("weapon-selected-count");

  let dungeonData = [];
  let optionData = [];
  let commonBasics = [];
  let weaponMetaByName = {};
  let isDataLoaded = false;
  let persistedExcludedWeapons = loadExcludedWeaponsFromCookie();
  let includeFourStarOptions = loadIncludeFourStarFromCookie();
  let showUnownedOnly = loadShowUnownedOnlyFromCookie();
  let showSignatureWeapon = loadShowSignatureWeaponFromCookie();

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
  applyUnownedFilterToggleState(unownedFilterBtn, showUnownedOnly);
  applySignatureWeaponToggleState(signatureWeaponToggleBtn, showSignatureWeapon);
  applySignatureWeaponVisibility(showSignatureWeapon);

  async function refreshGameData() {
    const loadedData = await loadGameData(includeFourStarOptions);
    if (!loadedData) {
      isDataLoaded = false;
      return false;
    }

    dungeonData = loadedData.dungeonData;
    optionData = loadedData.optionData;
    commonBasics = loadedData.commonBasics;
    weaponMetaByName = loadedData.weaponMetaByName || {};
    isDataLoaded = true;

    renderWeaponFilter({
      weaponList,
      weaponSelectedCount,
      optionRows: optionData,
      weaponMetaByName,
      previouslySelected: persistedExcludedWeapons,
      onSelectionChanged: syncWeaponSelectionState,
    });
    return true;
  }

  const initialLoaded = await refreshGameData();
  if (!initialLoaded) {
    renderLoadFailure(resultContent, weaponList);
  }

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

  unownedFilterBtn.addEventListener("click", () => {
    showUnownedOnly = !showUnownedOnly;
    applyUnownedFilterToggleState(unownedFilterBtn, showUnownedOnly);
    saveShowUnownedOnlyToCookie(showUnownedOnly);
    updateWeaponVisibility();
  });

  signatureWeaponToggleBtn.addEventListener("click", () => {
    showSignatureWeapon = !showSignatureWeapon;
    applySignatureWeaponToggleState(signatureWeaponToggleBtn, showSignatureWeapon);
    saveShowSignatureWeaponToCookie(showSignatureWeapon);
    applySignatureWeaponVisibility(showSignatureWeapon);
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

    if (hasNoSelected) {
      const bestPlan = findBestPlanWithoutSelection({
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

      renderBestPlan(
        resultContent,
        bestPlan,
        excludedWeapons.size,
        weaponMetaByName,
      );
      return;
    }

    const plansByDungeon = findPlansByDungeon({
      selected,
      dungeonData,
      optionData: filteredOptions,
      commonBasics,
      maxDungeonId,
    });

    if (plansByDungeon.length === 0) {
      resultContent.innerHTML = `
        <p>선택한 3옵 조합이 나오는 던전을 찾지 못했습니다.</p>
        <p>제외된 무기: ${excludedWeapons.size}개</p>
        <p>다른 옵션 조합으로 다시 계산해보세요.</p>
      `;
      return;
    }

    renderBestPlanList(
      resultContent,
      plansByDungeon,
      excludedWeapons.size,
      weaponMetaByName,
    );
  }

  function getExcludedWeapons() {
    const selectedItems = weaponList.querySelectorAll(".weapon-item.is-excluded");
    return new Set(
      [...selectedItems]
        .map((item) => item.dataset.weaponName || "")
        .filter((name) => name),
    );
  }

  function syncWeaponSelectionState() {
    const excludedWeapons = getExcludedWeapons();
    persistedExcludedWeapons = excludedWeapons;
    saveExcludedWeaponsToCookie(excludedWeapons);
    weaponSelectedCount.textContent = `${excludedWeapons.size}개 선택`;
    updateWeaponVisibility();
  }

  function updateWeaponVisibility() {
    const items = weaponList.querySelectorAll(".weapon-item");
    items.forEach((item) => {
      const shouldHide =
        showUnownedOnly && item.classList.contains("is-excluded");
      item.classList.toggle("is-hidden-by-filter", shouldHide);
    });
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

function applyUnownedFilterToggleState(button, isEnabled) {
  button.classList.toggle("is-active", isEnabled);
  button.setAttribute("aria-pressed", isEnabled ? "true" : "false");
}

function applySignatureWeaponToggleState(button, isEnabled) {
  button.classList.toggle("is-active", isEnabled);
  button.setAttribute("aria-pressed", isEnabled ? "true" : "false");
}

function applySignatureWeaponVisibility(isEnabled) {
  document.body.classList.toggle("show-signature-weapon", isEnabled);
}

function renderWeaponFilter({
  weaponList,
  weaponSelectedCount,
  optionRows,
  weaponMetaByName = {},
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
    const item = document.createElement("div");
    item.className = "weapon-item";
    item.dataset.weaponName = weaponName;
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    if (previouslySelected.has(weaponName)) {
      item.classList.add("is-excluded");
    }

    const attributeText =
      weaponMetaByName[weaponName]?.options?.[0]?.text || "속성 정보 없음";
    item.innerHTML = renderWeaponCard({
      weaponName,
      attributeText,
      imageName: weaponMetaByName[weaponName]?.imageName,
      signatureImageName: weaponMetaByName[weaponName]?.signatureImageName,
    });

    const weaponCard = item.firstElementChild;
    if (weaponCard) {
      weaponCard.classList.add("weapon-card--compact");
    }

    item.addEventListener("click", () => {
      item.classList.toggle("is-excluded");
      onSelectionChanged();
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      item.classList.toggle("is-excluded");
      onSelectionChanged();
    });

    weaponList.appendChild(item);
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

function renderBestPlan(
  target,
  bestPlan,
  excludedWeaponCount = 0,
  weaponMetaByName = {},
) {
  target.innerHTML = createPlanResultMarkup({
    bestPlan,
    excludedWeaponCount,
    weaponMetaByName,
  });
}

function renderBestPlanList(
  target,
  plans,
  excludedWeaponCount = 0,
  weaponMetaByName = {},
) {
  const listHtml = plans
    .map(
      (plan, index) => `
        <div class="result-list-item">
          <div class="result-list-rank">#${index + 1}</div>
          ${createPlanResultMarkup({
            bestPlan: plan,
            excludedWeaponCount,
            weaponMetaByName,
          })}
        </div>
      `,
    )
    .join("");

  target.innerHTML = `
    <p class="result-list-summary">
      선택한 3옵이 나오는 던전 ${plans.length}개를 중첩 유효옵 순으로 정렬했습니다.
    </p>
    <div class="result-list">
      ${listHtml}
    </div>
  `;
}

function createPlanResultMarkup({
  bestPlan,
  excludedWeaponCount = 0,
  weaponMetaByName = {},
}) {
  const fixedLabel =
    bestPlan.fixedType === "additional" ? "추가 속성 고정" : "스킬 속성 고정";

  const matchedOptionItems = bestPlan.matchedOptions
    .map((option) => {
      const optionAttributeText =
        `${option.basic} / ${option.additional} / ${option.skill}`;
      const weaponCards = option.weapons
        .map((weapon) =>
          renderWeaponCard({
            weaponName: weapon,
            attributeText: optionAttributeText,
            imageName: weaponMetaByName[weapon]?.imageName,
            signatureImageName: weaponMetaByName[weapon]?.signatureImageName,
          }),
        )
        .join("");
      return `
        <li>
          <span class="option-line">[${escapeHtml(option.basic)} / ${escapeHtml(option.additional)} / ${escapeHtml(option.skill)}]</span>
          <div class="weapon-card-list">${weaponCards || '<span class="weapon-empty">없음</span>'}</div>
        </li>
      `;
    })
    .join("");

  return `
    <div class="result-card">
      <div class="dungeon-box">
        <img src="data/dungeon_images/${escapeHtml(bestPlan.dungeon.image_name)}" alt="${escapeHtml(bestPlan.dungeon.name)}" class="dungeon-image">
        <div class="dungeon-title">${escapeHtml(bestPlan.dungeon.name)}</div>
      </div>
      <div class="result-summary">
        <p><strong>추천 기본 3옵:</strong> ${bestPlan.basicSet.map((value) => escapeHtml(value)).join(", ")}</p>
        <p><strong>추천 고정:</strong> ${fixedLabel} - ${escapeHtml(bestPlan.fixedValue)}</p>
        <p><strong>중첩 유효옵:</strong> ${bestPlan.overlapCount}개</p>
        <p><strong>제외한 무기:</strong> ${excludedWeaponCount}개</p>
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

function renderWeaponCard({
  weaponName,
  attributeText,
  imageName,
  signatureImageName,
}) {
  const imageHtml = imageName
    ? `<img src="data/weapon_images/${escapeHtml(imageName)}" alt="${escapeHtml(weaponName)}" class="weapon-card-image">`
    : '<div class="weapon-card-image weapon-card-image--placeholder" aria-hidden="true"></div>';

  const characterIconHtml = signatureImageName
    ? `<img src="data/characters/${escapeHtml(signatureImageName)}" alt="" aria-hidden="true" class="weapon-card-character-icon">`
    : "";

  return `
    <div class="weapon-card">
      ${imageHtml}
      ${characterIconHtml}
      <div class="weapon-card-text">
        <div class="weapon-card-name">${escapeHtml(weaponName)}</div>
        <div class="weapon-card-attrs">${escapeHtml(attributeText)}</div>
      </div>
    </div>
  `;
}
