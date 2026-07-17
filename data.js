import { normalizeBasicName } from "./planner.js";

const COOKIES = {
  WEAPON_FILTER: "excluded_weapons",
  FOUR_STAR: "include_4star_options",
  UNOWNED_ONLY: "show_unowned_only",
  SHOW_SIGNATURE: "show_signature_weapon",
  WEAPON_SORT: "weapon_sort_order",
};

const VALID_WEAPON_SORTS = new Set(["latest", "star", "name"]);

const setCookie = (name, value) => {
  const expires = new Date(Date.now() + 365 * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
};

const getCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
};

const parseOption = (opt) => {
  const basic = normalizeBasicName(opt?.basic);
  const additional = String(
    opt?.additional || opt?.additional_attributes || "",
  ).trim();
  const skill = String(opt?.skill || opt?.skill_attributes || "").trim();
  return basic && additional && skill ? { basic, additional, skill } : null;
};

export const loadIncludeFourStar = () => getCookie(COOKIES.FOUR_STAR) === "1";
export const saveIncludeFourStar = (v) =>
  setCookie(COOKIES.FOUR_STAR, v ? "1" : "0");

export const loadShowUnownedOnly = () =>
  getCookie(COOKIES.UNOWNED_ONLY) === "1";
export const saveShowUnownedOnly = (v) =>
  setCookie(COOKIES.UNOWNED_ONLY, v ? "1" : "0");

export const loadShowSignature = () =>
  getCookie(COOKIES.SHOW_SIGNATURE) === "1";
export const saveShowSignature = (v) =>
  setCookie(COOKIES.SHOW_SIGNATURE, v ? "1" : "0");

export const loadWeaponSort = () => {
  const sort = getCookie(COOKIES.WEAPON_SORT);
  return VALID_WEAPON_SORTS.has(sort) ? sort : "latest";
};
export const saveWeaponSort = (v) =>
  setCookie(COOKIES.WEAPON_SORT, VALID_WEAPON_SORTS.has(v) ? v : "latest");

export function loadExcludedWeapons() {
  try {
    const parsed = JSON.parse(getCookie(COOKIES.WEAPON_FILTER));
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}
export const saveExcludedWeapons = (set) =>
  setCookie(COOKIES.WEAPON_FILTER, JSON.stringify([...set]));

export async function loadGameData(includeFourStar) {
  try {
    const urls = ["data/dungeon_data.json", "data/weapons.json"];
    if (includeFourStar) urls.push("data/weapons_4star.json");

    const responses = await Promise.all(urls.map((url) => fetch(url)));
    if (responses.some((r) => !r.ok)) throw new Error("데이터 파일 로딩 실패");

    const [dungeonData, baseWeapons, weapons4Star = []] = await Promise.all(
      responses.map((r) => r.json()),
    );
    const withSortMeta = (weapons, sourceRank) =>
      weapons.map((weapon, sourceIndex) => ({
        ...weapon,
        __sourceRank: sourceRank,
        __sourceIndex: sourceIndex,
      }));
    const mergedWeapons = includeFourStar
      ? withSortMeta(baseWeapons, 0).concat(withSortMeta(weapons4Star, 1))
      : withSortMeta(baseWeapons, 0);

    const commonBasics =
      dungeonData.find((entry) => entry.id === 0)?.basic || [];
    const { optionData, weaponMetaByName } = processWeapons(mergedWeapons);

    return { dungeonData, optionData, commonBasics, weaponMetaByName };
  } catch (error) {
    console.error("Data load error:", error);
    return null;
  }
}

function processWeapons(weapons) {
  const weaponMetaByName = {};
  const groupedMap = new Map();

  weapons.forEach((weapon) => {
    const name = String(weapon?.name || "").trim();
    if (!name) return;

    const options = (Array.isArray(weapon?.options) ? weapon.options : [])
      .map(parseOption)
      .filter(Boolean);

    weaponMetaByName[name] = {
      imageName: String(weapon?.image_name || "").trim(),
      signatureImageName: String(weapon?.signature_weapon || "").trim(),
      star: Number(weapon?.star) || 0,
      sourceRank: Number(weapon?.__sourceRank) || 0,
      sourceIndex: Number(weapon?.__sourceIndex) || 0,
      options: options.map((opt) => ({
        ...opt,
        text: `${opt.basic} / ${opt.additional} / ${opt.skill}`,
      })),
    };

    options.forEach((opt) => {
      const key = `${opt.basic}\u0001${opt.additional}\u0001${opt.skill}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          basic: opt.basic,
          additional: opt.additional,
          skill: opt.skill,
          weapons: new Set(),
        });
      }
      groupedMap.get(key).weapons.add(name);
    });
  });

  const optionData = Array.from(groupedMap.values()).map((group, id) => ({
    id,
    basic: group.basic,
    additional: group.additional,
    skill: group.skill,
    weapons: Array.from(group.weapons),
  }));

  return { optionData, weaponMetaByName };
}
