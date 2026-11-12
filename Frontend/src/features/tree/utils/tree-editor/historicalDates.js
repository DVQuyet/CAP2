// Ngày tháng trong gia phả: độ chính xác (đủ ngày / tháng / chỉ năm / ước lượng / không rõ),
// âm lịch hay dương lịch, ngày giỗ âm lịch. Máy chủ luôn lưu ngày dương lịch kèm độ chính xác và loại lịch đã nhập.
import { isoToVietnamDate, vietnamDateToIso } from "../../../../shared/utils/dateFormat";
import { convertLunar2Solar, convertSolar2Lunar } from "../../../../shared/utils/lunarCalendar";

export const DATE_PRECISION_OPTIONS = ["exact", "month", "year", "approximate", "unknown"];
export const SOURCE_TYPE_OPTIONS = ["direct", "paper_genealogy", "document", "oral", "unknown"];

const pad2 = (value) => String(value).padStart(2, "0");
const isYearOnly = (precision) => precision === "year" || precision === "approximate";

const isoParts = (iso) => {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
};

const textParts = (text) => {
  const match = String(text || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{3,4})$/);
  return match ? { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) } : null;
};

function fieldsFor(person, prefix) {
  const iso = person?.[`${prefix}_date`] ? String(person[`${prefix}_date`]).slice(0, 10) : "";
  const precision = DATE_PRECISION_OPTIONS.includes(person?.[`${prefix}_date_precision`]) ? person[`${prefix}_date_precision`] : "exact";
  const calendar = person?.[`${prefix}_calendar`] === "lunar" ? "lunar" : "solar";
  const parts = isoParts(iso);
  let text = iso ? isoToVietnamDate(iso) : "";
  let leap = "0";
  if (parts && calendar === "lunar" && !isYearOnly(precision)) {
    const lunar = convertSolar2Lunar(parts.day, parts.month, parts.year);
    text = `${pad2(lunar.day)}/${pad2(lunar.month)}/${lunar.year}`;
    leap = lunar.leap ? "1" : "0";
  }
  return {
    [`${prefix}_date`]: text,
    [`${prefix}_year`]: parts ? String(parts.year) : "",
    [`${prefix}_date_precision`]: iso ? precision : precision === "unknown" ? "unknown" : "exact",
    [`${prefix}_calendar`]: calendar,
    [`${prefix}_lunar_leap`]: leap,
  };
}

export function anniversaryToForm(value) {
  const match = String(value || "").match(/^(\d{1,2})-(\d{1,2})$/);
  return match ? `${pad2(Number(match[2]))}/${pad2(Number(match[1]))}` : "";
}

export function anniversaryFromForm(text) {
  const match = String(text || "").trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 30 || month < 1 || month > 12) return null;
  return `${pad2(month)}-${pad2(day)}`;
}

// Ngày giỗ gợi ý từ ngày mất dương lịch (khi biết đủ ngày).
export function suggestedAnniversary(deathIso) {
  const parts = isoParts(deathIso);
  if (!parts) return "";
  const lunar = convertSolar2Lunar(parts.day, parts.month, parts.year);
  return `${pad2(lunar.day)}/${pad2(lunar.month)}`;
}

export function historicalFieldsFromPerson(person) {
  const living = person?.is_living;
  return {
    ...fieldsFor(person, "birth"),
    ...fieldsFor(person, "death"),
    is_living: living === null || living === undefined || living === "" ? (person?.id ? "unknown" : "1") : Number(living) === 0 ? "0" : "1",
    death_anniversary_lunar: anniversaryToForm(person?.death_anniversary_lunar),
    source_type: person?.source_type || "",
    source_note: person?.source_note || "",
  };
}

// Đổi một trường ngày của form sang ISO dương lịch. Trả về { iso, error }.
export function isoFromDateField(form, prefix) {
  const precision = DATE_PRECISION_OPTIONS.includes(form?.[`${prefix}_date_precision`]) ? form[`${prefix}_date_precision`] : "exact";
  if (precision === "unknown") return { iso: null, precision };
  if (isYearOnly(precision)) {
    const year = Number(String(form?.[`${prefix}_year`] || "").trim());
    if (!String(form?.[`${prefix}_year`] || "").trim()) return { iso: null, precision };
    if (!Number.isInteger(year) || year < 100 || year > 9999) return { iso: null, precision, error: "invalidYear" };
    return { iso: `${String(year).padStart(4, "0")}-01-01`, precision };
  }
  const text = String(form?.[`${prefix}_date`] || "").trim();
  if (!text) return { iso: null, precision };
  if (form?.[`${prefix}_calendar`] === "lunar") {
    const parts = textParts(text);
    if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 30) {
      return { iso: null, precision, error: "invalidLunarDate" };
    }
    const solar = convertLunar2Solar(parts.day, parts.month, parts.year, form?.[`${prefix}_lunar_leap`] === "1" ? 1 : 0);
    if (!solar) return { iso: null, precision, error: "invalidLeapMonth" };
    return { iso: `${solar[2]}-${pad2(solar[1])}-${pad2(solar[0])}`, precision };
  }
  const iso = vietnamDateToIso(text);
  return iso ? { iso, precision } : { iso: null, precision, error: "invalidDate" };
}

// Các trường gửi lên máy chủ. Trả về { payload, error }.
export function historicalPayloadFromForm(form) {
  const living = form?.is_living === "unknown" ? null : form?.is_living === "0" ? 0 : 1;
  const birth = isoFromDateField(form, "birth");
  const death = living === 1 ? { iso: null, precision: "exact" } : isoFromDateField(form, "death");
  const error = birth.error || death.error || null;
  return {
    error,
    payload: {
      is_living: living,
      birth_date: birth.iso,
      birth_date_precision: birth.precision,
      birth_calendar: form?.birth_calendar === "lunar" ? "lunar" : "solar",
      death_date: death.iso,
      death_date_precision: death.precision,
      death_calendar: form?.death_calendar === "lunar" ? "lunar" : "solar",
      death_anniversary_lunar: living === 1 ? null : anniversaryFromForm(form?.death_anniversary_lunar),
      source_type: form?.source_type || null,
      source_note: String(form?.source_note || "").trim() || null,
    },
  };
}

// Các trường chỉ dùng trên form, không gửi lên máy chủ.
export const FORM_ONLY_FIELDS = ["birth_year", "death_year", "birth_lunar_leap", "death_lunar_leap"];
