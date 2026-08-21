export function normalizeBasicName(basic) {
  const base = (basic || "").trim();
  const key = base.replace(" 증가", "");
  return ["민첩", "힘", "의지", "지능", "주요 능력치"].includes(key)
    ? `${key} 증가`
    : base;
}

export function filterOptionsByExcludedWeapons(options, excludedWeapons) {
  return options.reduce((acc, opt) => {
    const weapons = opt.weapons.filter((w) => !excludedWeapons.has(w));
    if (weapons.length) acc.push({ ...opt, weapons });
    return acc;
  }, []);
}

const sortPlans = (a, b) =>
  b.overlapCount - a.overlapCount ||
  b.weaponCount - a.weaponCount ||
  a.dungeon.id - b.dungeon.id ||
  (a.fixedType === b.fixedType ? 0 : a.fixedType === "additional" ? -1 : 1);

const sortDisplayPlans = (a, b) =>
  b.weaponCount - a.weaponCount || sortPlans(a, b);

// "4번 협곡"은 단일 id 4 던전이 아니라 id 1~4 던전 그룹을 뜻한다.
const isCanyonDungeon = (dungeon) => dungeon.id >= 1 && dungeon.id <= 4;

function chooseBetterPlan(current, candidate) {
  return !current || sortPlans(candidate, current) < 0 ? candidate : current;
}

function choosePreferredFarmSpot(current, candidate) {
  if (!current) return candidate;
  const currentIsCanyon = isCanyonDungeon(current.dungeon);
  const candidateIsCanyon = isCanyonDungeon(candidate.dungeon);
  if (candidateIsCanyon && !currentIsCanyon) return candidate;
  if (currentIsCanyon && !candidateIsCanyon) return current;
  return chooseBetterPlan(current, candidate);
}

function getWeaponCombinationKey(plan) {
  return [...plan.weapons]
    .sort((a, b) => a.localeCompare(b, "ko"))
    .join("\u0001");
}

function uniquePlansByWeaponCombination(plans) {
  const bestByCombination = new Map();

  plans.forEach((plan) => {
    if (!plan.weapons.length) return;
    const key = getWeaponCombinationKey(plan);
    bestByCombination.set(
      key,
      choosePreferredFarmSpot(bestByCombination.get(key), plan),
    );
  });

  const uniquePlans = [...bestByCombination.values()];
  const coFarmedWeapons = new Set(
    uniquePlans
      .filter((plan) => plan.weaponCount > 1)
      .flatMap((plan) => plan.weapons),
  );

  return uniquePlans
    .filter(
      (plan) => plan.weaponCount > 1 || !coFarmedWeapons.has(plan.weapons[0]),
    )
    .sort(sortDisplayPlans);
}

function createCombinations(basics, selected = null) {
  const combos = [];
  const targets = selected ? basics.filter((b) => b !== selected) : basics;

  if (selected && !basics.includes(selected)) return combos;

  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      if (selected) {
        combos.push([selected, targets[i], targets[j]]);
      } else {
        for (let k = j + 1; k < targets.length; k += 1) {
          combos.push([targets[i], targets[j], targets[k]]);
        }
      }
    }
  }
  return combos;
}

function createSearchScope({
  selected,
  dungeonData,
  commonBasics,
  minDungeonId,
  maxDungeonId,
}) {
  const selectedBasic = selected?.basic
    ? normalizeBasicName(selected.basic)
    : null;

  return {
    dungeons: dungeonData.filter(
      (d) => d.id >= minDungeonId && d.id <= maxDungeonId,
    ),
    basicCombinations: createCombinations(commonBasics, selectedBasic),
    selectedAdditional: selected?.additional || null,
    selectedSkill: selected?.skill || null,
  };
}

function evaluatePlans({
  dungeons,
  optionData,
  basicCombinations,
  selectedAdditional,
  selectedSkill,
}) {
  const plans = [];

  dungeons.forEach((dungeon) => {
    const addSet = new Set(dungeon.additional_attributes || []);
    const skillSet = new Set(dungeon.skill_attributes || []);

    const targetsAdd = selectedAdditional
      ? addSet.has(selectedAdditional)
        ? [selectedAdditional]
        : []
      : [...addSet];
    const targetsSkill = selectedSkill
      ? skillSet.has(selectedSkill)
        ? [selectedSkill]
        : []
      : [...skillSet];

    if (
      selectedAdditional &&
      selectedSkill &&
      (!targetsAdd.length || !targetsSkill.length)
    )
      return;

    basicCombinations.forEach((basicSet) => {
      const basicPool = new Set(basicSet);

      const check = (fixedType, values) => {
        values.forEach((fixedValue) => {
          const matched = optionData.filter(
            (opt) =>
              basicPool.has(opt.basic) &&
              opt[fixedType] === fixedValue &&
              (fixedType === "additional"
                ? skillSet.has(opt.skill)
                : addSet.has(opt.additional)),
          );

          if (!matched.length) return;

          const weapons = [...new Set(matched.flatMap((o) => o.weapons))];
          plans.push({
            dungeon,
            basicSet,
            fixedType,
            fixedValue,
            matchedOptions: matched,
            overlapCount: matched.length,
            weapons,
            weaponCount: weapons.length,
          });
        });
      };

      check("additional", targetsAdd);
      check("skill", targetsSkill);
    });
  });

  return plans;
}

export function findPlans({
  selected = null,
  dungeonData,
  optionData,
  commonBasics,
  minDungeonId = 1,
  maxDungeonId = 5,
}) {
  const scope = createSearchScope({
    selected,
    dungeonData,
    commonBasics,
    minDungeonId,
    maxDungeonId,
  });

  return uniquePlansByWeaponCombination(
    evaluatePlans({
      dungeons: scope.dungeons,
      optionData,
      basicCombinations: scope.basicCombinations,
      selectedAdditional: scope.selectedAdditional,
      selectedSkill: scope.selectedSkill,
    }),
  );
}
