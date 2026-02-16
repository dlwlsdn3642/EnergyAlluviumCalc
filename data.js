import { normalizeBasicName } from "./planner.js";

const WEAPON_FILTER_COOKIE = "excluded_weapons";
const FOUR_STAR_OPTION_COOKIE = "include_4star_options";
const COOKIE_EXPIRE_DAYS = 365;

export async function loadGameData(includeFourStarOptions) {
  try {
    const requests = [fetch("data/dungeon_data.json"), fetch("data/option_data.json")];

    if (includeFourStarOptions) {
      requests.push(fetch("data/option_data_4star.json"));
    }

    const [dungeonResponse, optionResponse, option4StarResponse] =
      await Promise.all(requests);

    if (
      !dungeonResponse.ok ||
      !optionResponse.ok ||
      (includeFourStarOptions && !option4StarResponse?.ok)
    ) {
      throw new Error("데이터 파일 로딩 실패");
    }

    const dungeonData = await dungeonResponse.json();
    const baseOptionRows = await optionResponse.json();
    const mergedOptionRows = includeFourStarOptions
      ? baseOptionRows.concat(await option4StarResponse.json())
      : baseOptionRows;
    const optionData = normalizeOptionRows(mergedOptionRows);

    const commonEntry = dungeonData.find((entry) => entry.id === 0);
    const commonBasics = commonEntry?.basic || [];

    return { dungeonData, optionData, commonBasics };
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
