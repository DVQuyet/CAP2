export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

export function isVietnamDate(value) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(String(value || "").trim());
}

export function parseDateParts(value) {
  if (!value) return null;
  const text = String(value).trim();
  let day;
  let month;
  let year;

  if (isVietnamDate(text)) {
    [day, month, year] = text.split("/").map(Number);
    } else if (text.includes("T") || text.includes("Z")) {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) {
        day = parsed.getDate();
        month = parsed.getMonth() + 1;
        year = parsed.getFullYear();
      }
    } else {
      const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        year = Number(isoMatch[1]);
        month = Number(isoMatch[2]);
        day = Number(isoMatch[3]);
      } else {
        const parsed = new Date(text);
        if (!Number.isNaN(parsed.getTime())) {
          day = parsed.getDate();
          month = parsed.getMonth() + 1;
          year = parsed.getFullYear();
        }
      }
    }

  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { day, month, year, date };
}

export function isoToVietnamDate(value) {
  const parts = parseDateParts(value);
  if (!parts) return value ? String(value) : "";
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
}

export function vietnamDateToIso(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const parts = parseDateParts(text);
  if (!parts) return null;
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function formatDateVN(value) {
  return isoToVietnamDate(value);
}

export function formatDateTimeVN(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return isoToVietnamDate(value);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDate(value, i18n) {
  const parts = parseDateParts(value);
  if (!parts) return value ? String(value) : "";
  if (i18n?.language === "vi") {
    return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
  }
  return `${pad2(parts.month)}/${pad2(parts.day)}/${parts.year}`;
}

export function formatDateTime(value, i18n) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value, i18n);
  if (i18n?.language === "vi") {
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function normalizeDateInput(value) {
  const raw = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (raw.length <= 2) return raw;
  if (raw.length <= 4) return `${raw.slice(0, 2)}/${raw.slice(2)}`;
  return `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
}

export function isValidVietnamDate(value) {
  return Boolean(parseDateParts(value));
}
