import DateInput from "../../../../shared/components/DateInput";
import { useLanguage } from "../../../../i18n/LanguageContext";
import LunarDateHint from "./LunarDateHint";
import {
  DATE_PRECISION_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  isoFromDateField,
  suggestedAnniversary,
} from "../../utils/tree-editor/historicalDates";

function DateWithPrecision({ prefix, form, setField, disabled, label, lunarHintLabel }) {
  const { t } = useLanguage();
  const precision = form[`${prefix}_date_precision`] || "exact";
  const calendar = form[`${prefix}_calendar`] || "solar";
  const yearOnly = precision === "year" || precision === "approximate";
  const solarIso = calendar === "solar" && !yearOnly ? isoFromDateField(form, prefix).iso : null;

  return (
    <div className="fte-historicalDate">
      <span className="fte-fieldLabel">{label}</span>
      <div className="fte-historicalDateRow">
        <select
          value={precision}
          disabled={disabled}
          onChange={(event) => setField(`${prefix}_date_precision`, event.target.value)}
          title={t("tree.historical.precision")}
        >
          {DATE_PRECISION_OPTIONS.map((option) => (
            <option key={option} value={option}>{t(`tree.historical.precisions.${option}`)}</option>
          ))}
        </select>
        {precision === "unknown" ? null : yearOnly ? (
          <input
            type="number"
            min="100"
            max="9999"
            inputMode="numeric"
            placeholder={t("tree.historical.yearPlaceholder")}
            value={form[`${prefix}_year`] || ""}
            disabled={disabled}
            onChange={(event) => setField(`${prefix}_year`, event.target.value)}
          />
        ) : (
          <>
            <select
              value={calendar}
              disabled={disabled}
              onChange={(event) => setField(`${prefix}_calendar`, event.target.value)}
              title={t("tree.historical.calendar")}
            >
              <option value="solar">{t("tree.historical.calendars.solar")}</option>
              <option value="lunar">{t("tree.historical.calendars.lunar")}</option>
            </select>
            <DateInput
              value={form[`${prefix}_date`] || ""}
              disabled={disabled}
              onChange={(event) => setField(`${prefix}_date`, event.target.value)}
            />
          </>
        )}
      </div>
      {calendar === "lunar" && !yearOnly && precision !== "unknown" ? (
        <label className="fte-inlineCheck">
          <input
            type="checkbox"
            checked={form[`${prefix}_lunar_leap`] === "1"}
            disabled={disabled}
            onChange={(event) => setField(`${prefix}_lunar_leap`, event.target.checked ? "1" : "0")}
          />
          {t("tree.historical.leapMonth")}
        </label>
      ) : null}
      {precision === "approximate" ? <small className="fte-fieldHint">{t("tree.historical.approximateHint")}</small> : null}
      {solarIso ? <LunarDateHint value={solarIso} label={lunarHintLabel} /> : null}
    </div>
  );
}

// Tình trạng còn sống / đã mất / không rõ, ngày sinh, ngày mất, ngày giỗ, nguồn dữ liệu.
export default function HistoricalPersonFields({ form, setField, disabled = false, showSource = true }) {
  const { t } = useLanguage();
  const deathKnown = form.is_living !== "1";
  const suggestion = deathKnown && form.death_date_precision === "exact" && form.death_calendar !== "lunar"
    ? suggestedAnniversary(isoFromDateField(form, "death").iso)
    : "";

  return (
    <>
      <label>
        {t("tree.inspector.fields.status")}
        <select value={form.is_living || "1"} disabled={disabled} onChange={(event) => setField("is_living", event.target.value)}>
          <option value="1">{t("tree.inspector.fields.statusOptions.living")}</option>
          <option value="0">{t("tree.inspector.fields.statusOptions.deceased")}</option>
          <option value="unknown">{t("tree.historical.livingUnknown")}</option>
        </select>
      </label>

      <DateWithPrecision
        prefix="birth"
        form={form}
        setField={setField}
        disabled={disabled}
        label={t("tree.inspector.fields.birthDate")}
        lunarHintLabel={t("tree.inspector.fields.lunarBirth")}
      />

      {deathKnown ? (
        <>
          <DateWithPrecision
            prefix="death"
            form={form}
            setField={setField}
            disabled={disabled}
            label={t("tree.inspector.fields.deathDate")}
            lunarHintLabel={t("tree.inspector.fields.lunarDeath")}
          />
          <label>
            {t("tree.historical.deathAnniversary")}
            <input
              value={form.death_anniversary_lunar || ""}
              placeholder={suggestion || "dd/mm"}
              disabled={disabled}
              maxLength={5}
              onChange={(event) => setField("death_anniversary_lunar", event.target.value)}
            />
            {suggestion && !form.death_anniversary_lunar ? (
              <button type="button" className="fte-linkButton" disabled={disabled} onClick={() => setField("death_anniversary_lunar", suggestion)}>
                {t("tree.historical.useSuggestedAnniversary", { value: suggestion })}
              </button>
            ) : null}
          </label>
        </>
      ) : null}

      {showSource ? (
        <>
          <label>
            {t("tree.historical.source")}
            <select value={form.source_type || ""} disabled={disabled} onChange={(event) => setField("source_type", event.target.value)}>
              <option value="">{t("tree.historical.sources.none")}</option>
              {SOURCE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{t(`tree.historical.sources.${option}`)}</option>
              ))}
            </select>
          </label>
          <label>
            {t("tree.historical.sourceNote")}
            <input
              value={form.source_note || ""}
              disabled={disabled}
              placeholder={t("tree.historical.sourceNotePlaceholder")}
              onChange={(event) => setField("source_note", event.target.value)}
            />
          </label>
        </>
      ) : null}
    </>
  );
}
