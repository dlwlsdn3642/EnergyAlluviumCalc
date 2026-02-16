export function normalizeBasicName(basic) {
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

export function filterOptionsByExcludedWeapons(options, excludedWeapons) {
  return options
    .map((option) => {
      const availableWeapons = option.weapons.filter(
        (weapon) => !excludedWeapons.has(weapon),
      );

      if (availableWeapons.length === 0) {
        return null;
      }

      return {
        ...option,
        weapons: availableWeapons,
      };
    })
    .filter(Boolean);
}

export function findBestPlan({
  selected,
  dungeonData,
  optionData,
  commonBasics,
  maxDungeonId = 5,
}) {
  const selectedBasic = normalizeBasicName(selected.basic);
  const basicCombinations = createBasicCombinations(
    commonBasics,
    selectedBasic,
  );
  const dungeons = dungeonData.filter(
    (entry) => entry.id >= 1 && entry.id <= maxDungeonId,
  );

  let bestPlan = null;

  dungeons.forEach((dungeon) => {
    const hasSelectedAdditional = (
      dungeon.additional_attributes || []
    ).includes(selected.additional);
    const hasSelectedSkill = (dungeon.skill_attributes || []).includes(
      selected.skill,
    );

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

export function findBestPlanWithoutSelection({
  dungeonData,
  optionData,
  commonBasics,
  maxDungeonId = 5,
}) {
  const basicCombinations = createAllBasicCombinations(commonBasics);
  const dungeons = dungeonData.filter(
    (entry) => entry.id >= 1 && entry.id <= maxDungeonId,
  );

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

function createBasicCombinations(commonBasics, selectedBasic) {
  if (!commonBasics.includes(selectedBasic)) {
    return [];
  }

  const others = commonBasics.filter((value) => value !== selectedBasic);
  const combinations = [];

  for (let i = 0; i < others.length; i += 1) {
    for (let j = i + 1; j < others.length; j += 1) {
      combinations.push([selectedBasic, others[i], others[j]]);
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
