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

function chooseBetterPlan(current, candidate) {
  return !current || sortPlans(candidate, current) < 0 ? candidate : current;
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

function evaluatePlans({
  dungeons,
  optionData,
  basicCombinations,
  selAdd,
  selSkill,
}) {
  const plans = [];

  dungeons.forEach((dungeon) => {
    const addSet = new Set(dungeon.additional_attributes || []);
    const skillSet = new Set(dungeon.skill_attributes || []);

    const targetsAdd = selAdd
      ? addSet.has(selAdd)
        ? [selAdd]
        : []
      : [...addSet];
    const targetsSkill = selSkill
      ? skillSet.has(selSkill)
        ? [selSkill]
        : []
      : [...skillSet];

    if (selAdd && selSkill && (!targetsAdd.length || !targetsSkill.length))
      return;

    let bestForDungeon = null;

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
          bestForDungeon = chooseBetterPlan(bestForDungeon, {
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

    if (bestForDungeon) plans.push(bestForDungeon);
  });

  return plans;
}

export function findPlansByDungeon({
  selected,
  dungeonData,
  optionData,
  commonBasics,
  maxDungeonId = 5,
}) {
  const dungeons = dungeonData.filter((d) => d.id >= 1 && d.id <= maxDungeonId);
  const basicCombinations = createCombinations(
    commonBasics,
    normalizeBasicName(selected.basic),
  );

  return evaluatePlans({
    dungeons,
    optionData,
    basicCombinations,
    selAdd: selected.additional,
    selSkill: selected.skill,
  }).sort(sortPlans);
}

export function findBestPlanWithoutSelection({
  dungeonData,
  optionData,
  commonBasics,
  maxDungeonId = 5,
}) {
  const dungeons = dungeonData.filter((d) => d.id >= 1 && d.id <= maxDungeonId);
  const basicCombinations = createCombinations(commonBasics);

  return (
    evaluatePlans({ dungeons, optionData, basicCombinations }).sort(
      sortPlans,
    )[0] || null
  );
}
