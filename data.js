import { normalizeBasicName } from "./planner.js";

const WEAPON_FILTER_COOKIE = "excluded_weapons";
const FOUR_STAR_OPTION_COOKIE = "include_4star_options";
const UNOWNED_ONLY_COOKIE = "show_unowned_only";
const SHOW_SIGNATURE_WEAPON_COOKIE = "show_signature_weapon";
const COOKIE_EXPIRE_DAYS = 365;

export async function loadGameData(includeFourStarOptions) {
  try {
    const requests = [fetch("data/dungeon_data.json"), fetch("data/weapons.json")];

    if (includeFourStarOptions) {
      requests.push(fetch("data/weapons_4star.json"));
    }

    const [dungeonResponse, weaponResponse, weapon4StarResponse] =
      await Promise.all(requests);

    if (
      !dungeonResponse.ok ||
      !weaponResponse.ok ||
      (includeFourStarOptions && !weapon4StarResponse?.ok)
    ) {
      throw new Error("데이터 파일 로딩 실패");
    }

    const dungeonData = await dungeonResponse.json();
    const baseWeapons = await weaponResponse.json();
    const mergedWeapons = includeFourStarOptions
      ? baseWeapons.concat(await weapon4StarResponse.json())
      : baseWeapons;
    const optionData = normalizeOptionsFromWeapons(mergedWeapons);
    const weaponMetaByName = buildWeaponMetaByName(mergedWeapons);

    const commonEntry = dungeonData.find((entry) => entry.id === 0);
    const commonBasics = commonEntry?.basic || [];

    return { dungeonData, optionData, commonBasics, weaponMetaByName };
  } catch (error) {
    return null;
  }
}

export function loadIncludeFourStarFromCookie() {
  return getCookieValue(FOUR_STAR_OPTION_COOKIE) === "1";
}

export function saveIncludeFourStarToCookie(value) {
  const expires = new Date(
    Date.now() + COOKIE_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
  ).toUTCString();

  document.cookie = `${FOUR_STAR_OPTION_COOKIE}=${value ? "1" : "0"}; expires=${expires}; path=/; SameSite=Lax`;
}

export function loadShowUnownedOnlyFromCookie() {
  return getCookieValue(UNOWNED_ONLY_COOKIE) === "1";
}

export function saveShowUnownedOnlyToCookie(value) {
  const expires = new Date(
    Date.now() + COOKIE_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
  ).toUTCString();

  document.cookie = `${UNOWNED_ONLY_COOKIE}=${value ? "1" : "0"}; expires=${expires}; path=/; SameSite=Lax`;
}

export function loadShowSignatureWeaponFromCookie() {
  return getCookieValue(SHOW_SIGNATURE_WEAPON_COOKIE) === "1";
}

export function saveShowSignatureWeaponToCookie(value) {
  const expires = new Date(
    Date.now() + COOKIE_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
  ).toUTCString();

  document.cookie = `${SHOW_SIGNATURE_WEAPON_COOKIE}=${value ? "1" : "0"}; expires=${expires}; path=/; SameSite=Lax`;
}

export function loadExcludedWeaponsFromCookie() {
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

export function saveExcludedWeaponsToCookie(weaponsSet) {
  const expires = new Date(
    Date.now() + COOKIE_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
  ).toUTCString();
  const value = encodeURIComponent(JSON.stringify([...weaponsSet]));

  document.cookie = `${WEAPON_FILTER_COOKIE}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function normalizeOptionsFromWeapons(weapons) {
  const groupedOptions = new Map();

  weapons.forEach((weapon) => {
    const weaponName = String(weapon?.name || "").trim();
    const options = Array.isArray(weapon?.options) ? weapon.options : [];

    options.forEach((option) => {
      const basic = normalizeBasicName(option?.basic);
      const additional = String(
        option?.additional || option?.additional_attributes || "",
      ).trim();
      const skill = String(option?.skill || option?.skill_attributes || "").trim();

      if (!weaponName || !basic || !additional || !skill) {
        return;
      }

      const key = `${basic}\u0001${additional}\u0001${skill}`;
      const current = groupedOptions.get(key);

      if (!current) {
        groupedOptions.set(key, {
          basic,
          additional,
          skill,
          weapons: [weaponName],
        });
        return;
      }

      if (!current.weapons.includes(weaponName)) {
        current.weapons.push(weaponName);
      }
    });
  });

  return [...groupedOptions.values()].map((row, index) => ({
    id: index,
    basic: row.basic,
    additional: row.additional,
    skill: row.skill,
    weapons: row.weapons,
  }));
}

function buildWeaponMetaByName(weapons) {
  const metaByName = {};

  weapons.forEach((weapon) => {
    const name = String(weapon?.name || "").trim();
    if (!name) {
      return;
    }

    const rawOptions = Array.isArray(weapon?.options) ? weapon.options : [];
    const options = rawOptions
      .map((option) => {
        const basic = normalizeBasicName(option?.basic);
        const additional = String(
          option?.additional || option?.additional_attributes || "",
        ).trim();
        const skill = String(option?.skill || option?.skill_attributes || "").trim();

        if (!basic || !additional || !skill) {
          return null;
        }

        return {
          basic,
          additional,
          skill,
          text: `${basic} / ${additional} / ${skill}`,
        };
      })
      .filter(Boolean);

    const signatureImageName = String(weapon?.signature_weapon || "").trim();

    metaByName[name] = {
      imageName: String(weapon?.image_name || "").trim(),
      signatureImageName,
      options,
    };
  });

  return metaByName;
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
