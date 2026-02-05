document.addEventListener("DOMContentLoaded", async () => {
  const WEAPON_FILTER_COOKIE = "excluded_weapons";
  const COOKIE_EXPIRE_DAYS = 365;

  const statBoxes = document.querySelectorAll(".stat-box");
  const calculateBtn = document.getElementById("calculate-btn");
  const resultContent = document.getElementById("result-content");
  const weaponList = document.getElementById("weapon-list");
  const weaponClearBtn = document.getElementById("weapon-clear-btn");
  const weaponSelectedCount = document.getElementById("weapon-selected-count");

  let dungeonData = [];
  let optionData = [];
  let commonBasics = [];
  let isDataLoaded = false;
  let persistedExcludedWeapons = loadExcludedWeaponsFromCookie();

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

  async function loadGameData() {
    try {
      const [dungeonResponse, optionResponse] = await Promise.all([
        fetch("data/dungeon_data.json"),
        fetch("data/option_data.json"),
      ]);

      if (!dungeonResponse.ok || !optionResponse.ok) {
        throw new Error("데이터 파일 로딩 실패");
      }

      dungeonData = await dungeonResponse.json();
      optionData = normalizeOptionRows(await optionResponse.json());
      renderWeaponFilter(optionData, persistedExcludedWeapons);

      const commonEntry = dungeonData.find((entry) => entry.id === 0);
      commonBasics = commonEntry?.basic || [];
      isDataLoaded = true;
      return true;
    } catch (error) {
      isDataLoaded = false;
      return false;
    }
  }

  const initialLoaded = await loadGameData();
  if (!initialLoaded) {
    resultContent.innerHTML = `
      <p>데이터를 불러오지 못했습니다.</p>
      <p>브라우저에서 파일을 직접 열었다면(주소가 <code>file://</code>), 로컬 서버로 실행해주세요.</p>
    `;
    weaponList.textContent = "무기 데이터를 불러오지 못했습니다.";
  }

  weaponClearBtn.addEventListener("click", () => {
    const checked = document.querySelectorAll(".weapon-checkbox:checked");
    checked.forEach((input) => {
      input.checked = false;
    });
    syncWeaponSelectionState();
  });

  calculateBtn.addEventListener("click", async () => {
    if (!isDataLoaded) {
      const loaded = await loadGameData();
      if (!loaded) {
        resultContent.innerHTML = `
          <p>데이터를 불러오지 못했습니다.</p>
          <p>로컬 서버(예: VSCode Live Server)로 페이지를 실행한 뒤 다시 시도해주세요.</p>
        `;
        weaponList.textContent = "무기 데이터를 불러오지 못했습니다.";
        return;
      }
    }

    const selected = {
      basic: getSelectedOption("basic"),
      additional: getSelectedOption("additional"),
      skill: getSelectedOption("skill"),
    };
    const hasAllSelected =
      Boolean(selected.basic) && Boolean(selected.additional) && Boolean(selected.skill);
    const hasNoSelected =
      !selected.basic && !selected.additional && !selected.skill;

    if (!hasAllSelected && !hasNoSelected) {
      resultContent.textContent =
        "기초/추가/스킬 속성은 3개를 모두 선택하거나, 모두 선택하지 않은 상태로 계산해주세요.";
      return;
    }

    const excludedWeapons = getExcludedWeapons();
    const filteredOptions = optionData.filter((option) =>
      option.weapons.every((weapon) => !excludedWeapons.has(weapon)),
    );

    const bestPlan = hasNoSelected
      ? findBestPlanWithoutSelection({
          dungeonData,
          optionData: filteredOptions,
          commonBasics,
        })
      : findBestPlan({
          selected,
          dungeonData,
          optionData: filteredOptions,
          commonBasics,
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
  });

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

  function renderWeaponFilter(optionRows, previouslySelected = new Set()) {
    const allWeapons = [...new Set(optionRows.flatMap((row) => row.weapons))]
      .filter((weapon) => String(weapon).trim())
      .sort((a, b) => a.localeCompare(b, "ko"));

    if (allWeapons.length === 0) {
      weaponList.textContent = "표시할 무기 목록이 없습니다.";
      weaponSelectedCount.textContent = "0개 선택";
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

      const text = document.createElement("span");
      text.textContent = weaponName;

      input.addEventListener("change", syncWeaponSelectionState);

      label.append(input, text);
      weaponList.appendChild(label);
    });

    syncWeaponSelectionState();
  }

  function loadExcludedWeaponsFromCookie() {
    const cookieValue = getCookieValue(WEAPON_FILTER_COOKIE);
    if (!cookieValue) {
      return new Set();
    }

    try {
      const parsed = JSON.parse(cookieValue);
      if (!Array.isArray(parsed)) {
        return new Set();
      }
      return new Set(parsed.map((weapon) => String(weapon)));
    } catch (error) {
      return new Set();
    }
  }

  function saveExcludedWeaponsToCookie(weaponsSet) {
    const expires = new Date(
      Date.now() + COOKIE_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
    ).toUTCString();
    const value = encodeURIComponent(JSON.stringify([...weaponsSet]));

    document.cookie = `${WEAPON_FILTER_COOKIE}=${value}; expires=${expires}; path=/; SameSite=Lax`;
  }

  function getCookieValue(name) {
    const encodedName = `${name}=`;
    const cookieParts = document.cookie.split(";");

    for (const rawPart of cookieParts) {
      const part = rawPart.trim();
      if (part.startsWith(encodedName)) {
        return decodeURIComponent(part.substring(encodedName.length));
      }
    }

    return "";
  }
});

function getSelectedOption(group) {
  const selected = document.querySelector(`.stat-box[data-group="${group}"].selected`);
  return selected ? selected.textContent.trim() : null;
}

function normalizeBasicName(basic) {
  const base = (basic || "").trim();
  const basicMap = {
    민첩: "민첩 증가",
    "민첩 증가": "민첩 증가",
    힘: "힘 증가",
    "힘 증가": "힘 증가",
    의지: "의지 증가",
    "의지 증가": "의지 증가",
    지능: "지능 증가",
    "지능 증가": "지능 증가",
    "주요 능력치": "주요 능력치 증가",
    "주요 능력치 증가": "주요 능력치 증가",
  };

  return basicMap[base] || base;
}

function normalizeOptionRows(rows) {
  return rows
    .map((row, index) => ({
      id: index,
      basic: normalizeBasicName(row.basic),
      additional: (row.additional_attributes || "").trim(),
      skill: (row.skill_attributes || "").trim(),
      weapons: Array.isArray(row["무기"]) ? row["무기"] : [],
    }))
    .filter((row) => row.basic && row.additional && row.skill);
}

function createBasicCombinations(commonBasics, selectedBasic) {
  const normalizedSelected = normalizeBasicName(selectedBasic);

  if (!commonBasics.includes(normalizedSelected)) {
    return [];
  }

  const others = commonBasics.filter((value) => value !== normalizedSelected);
  const combinations = [];

  for (let i = 0; i < others.length; i += 1) {
    for (let j = i + 1; j < others.length; j += 1) {
      combinations.push([normalizedSelected, others[i], others[j]]);
    }
  }

  return combinations;
}

function createAllBasicCombinations(commonBasics) {
  const combinations = [];

  for (let i = 0; i < commonBasics.length; i += 1) {
    for (let j = i + 1; j < commonBasics.length; j += 1) {
      for (let k = j + 1; k < commonBasics.length; k += 1) {
        combinations.push([commonBasics[i], commonBasics[j], commonBasics[k]]);
      }
    }
  }

  return combinations;
}

function collectMatchedOptions({
  normalizedOptions,
  dungeon,
  basicSet,
  fixedType,
  fixedValue,
}) {
  const basicPool = new Set(basicSet);

  if (fixedType === "additional") {
    const skillPool = new Set(dungeon.skill_attributes || []);
    return normalizedOptions.filter(
      (option) =>
        basicPool.has(option.basic) &&
        option.additional === fixedValue &&
        skillPool.has(option.skill),
    );
  }

  const additionalPool = new Set(dungeon.additional_attributes || []);
  return normalizedOptions.filter(
    (option) =>
      basicPool.has(option.basic) &&
      option.skill === fixedValue &&
      additionalPool.has(option.additional),
  );
}

function uniqueWeapons(matchedOptions) {
  const merged = matchedOptions.flatMap((option) => option.weapons);
  return [...new Set(merged)];
}

function chooseBetterPlan(current, candidate) {
  if (!current) {
    return candidate;
  }

  if (candidate.overlapCount !== current.overlapCount) {
    return candidate.overlapCount > current.overlapCount ? candidate : current;
  }

  if (candidate.weaponCount !== current.weaponCount) {
    return candidate.weaponCount > current.weaponCount ? candidate : current;
  }

  if (candidate.dungeon.id !== current.dungeon.id) {
    return candidate.dungeon.id < current.dungeon.id ? candidate : current;
  }

  if (candidate.fixedType !== current.fixedType) {
    return candidate.fixedType === "additional" ? candidate : current;
  }

  return current;
}

function findBestPlan({ selected, dungeonData, optionData, commonBasics }) {
  const selectedBasic = normalizeBasicName(selected.basic);
  const basicCombinations = createBasicCombinations(commonBasics, selectedBasic);
  const dungeons = dungeonData.filter((entry) => entry.id >= 1 && entry.id <= 5);

  let bestPlan = null;

  dungeons.forEach((dungeon) => {
    const hasSelectedAdditional = (dungeon.additional_attributes || []).includes(
      selected.additional,
    );
    const hasSelectedSkill = (dungeon.skill_attributes || []).includes(selected.skill);

    if (!hasSelectedAdditional || !hasSelectedSkill) {
      return;
    }

    basicCombinations.forEach((basicSet) => {
      const additionalFixedMatches = collectMatchedOptions({
        normalizedOptions: optionData,
        dungeon,
        basicSet,
        fixedType: "additional",
        fixedValue: selected.additional,
      });
      const additionalWeapons = uniqueWeapons(additionalFixedMatches);

      bestPlan = chooseBetterPlan(bestPlan, {
        dungeon,
        basicSet,
        fixedType: "additional",
        fixedValue: selected.additional,
        matchedOptions: additionalFixedMatches,
        overlapCount: additionalFixedMatches.length,
        weapons: additionalWeapons,
        weaponCount: additionalWeapons.length,
      });

      const skillFixedMatches = collectMatchedOptions({
        normalizedOptions: optionData,
        dungeon,
        basicSet,
        fixedType: "skill",
        fixedValue: selected.skill,
      });
      const skillWeapons = uniqueWeapons(skillFixedMatches);

      bestPlan = chooseBetterPlan(bestPlan, {
        dungeon,
        basicSet,
        fixedType: "skill",
        fixedValue: selected.skill,
        matchedOptions: skillFixedMatches,
        overlapCount: skillFixedMatches.length,
        weapons: skillWeapons,
        weaponCount: skillWeapons.length,
      });
    });
  });

  return bestPlan;
}

function findBestPlanWithoutSelection({ dungeonData, optionData, commonBasics }) {
  const basicCombinations = createAllBasicCombinations(commonBasics);
  const dungeons = dungeonData.filter((entry) => entry.id >= 1 && entry.id <= 5);

  let bestPlan = null;

  dungeons.forEach((dungeon) => {
    basicCombinations.forEach((basicSet) => {
      (dungeon.additional_attributes || []).forEach((additionalValue) => {
        const additionalFixedMatches = collectMatchedOptions({
          normalizedOptions: optionData,
          dungeon,
          basicSet,
          fixedType: "additional",
          fixedValue: additionalValue,
        });
        const additionalWeapons = uniqueWeapons(additionalFixedMatches);

        bestPlan = chooseBetterPlan(bestPlan, {
          dungeon,
          basicSet,
          fixedType: "additional",
          fixedValue: additionalValue,
          matchedOptions: additionalFixedMatches,
          overlapCount: additionalFixedMatches.length,
          weapons: additionalWeapons,
          weaponCount: additionalWeapons.length,
        });
      });

      (dungeon.skill_attributes || []).forEach((skillValue) => {
        const skillFixedMatches = collectMatchedOptions({
          normalizedOptions: optionData,
          dungeon,
          basicSet,
          fixedType: "skill",
          fixedValue: skillValue,
        });
        const skillWeapons = uniqueWeapons(skillFixedMatches);

        bestPlan = chooseBetterPlan(bestPlan, {
          dungeon,
          basicSet,
          fixedType: "skill",
          fixedValue: skillValue,
          matchedOptions: skillFixedMatches,
          overlapCount: skillFixedMatches.length,
          weapons: skillWeapons,
          weaponCount: skillWeapons.length,
        });
      });
    });
  });

  return bestPlan;
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
      const weapons = option.weapons.map((weapon) => escapeHtml(weapon)).join(", ");
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
        <img src="data/${escapeHtml(bestPlan.dungeon.image_name)}" alt="던전 ${bestPlan.dungeon.id}" class="dungeon-image">
        <div class="dungeon-title">던전 ${bestPlan.dungeon.id}</div>
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
