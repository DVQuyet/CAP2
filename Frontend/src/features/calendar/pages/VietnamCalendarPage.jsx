import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { apiRequest } from "../../../services/api";
import { getStoredUser } from "../../../shared/utils/auth";
import { getSocket } from "../../../services/socket";
import { notify } from "../../../shared/utils/toast";
import { getLunarInfoFromSolar as getLunarInfo } from "../../../shared/utils/lunarCalendar";
import { friendlyErrorMessage } from "../../../shared/utils/friendlyError";
import "../../../shared/components/StateComponents.css";
import { useConfirm } from "../../../shared/components/confirmContext.js";
import { canDraftAnnouncement, postsPathFromCalendarPath, toIsoLocal } from "../../posts/postAiHelpers";
import "./VietnamCalendarPage.css";

function pad2(v) {
  return String(v).padStart(2, "0");
}

function toDateKey(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getMonthMatrix(year, month) {
  const firstDay = new Date(year, month, 1);
  const startDay = new Date(firstDay);
  // Sunday is 0. We want to start the matrix from the Sunday of the week containing the 1st.
  startDay.setDate(1 - firstDay.getDay());

  const days = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(startDay));
    startDay.setDate(startDay.getDate() + 1);
  }
  return days;
}

function getWeekDates(date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(start));
    start.setDate(start.getDate() + 1);
  }
  return days;
}

const STORAGE_KEY = "gia_pha_viet_calendar_events_v1";
// Month names and weekday labels are now retrieved via t() for localization
function formatVietnamDate(date) {
  if (!date) return "";
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function getWeekRangeText(date) {
  const week = getWeekDates(date);
  const start = week[0];
  const end = week[6];
  return `${pad2(start.getDate())}/${pad2(start.getMonth() + 1)} - ${pad2(end.getDate())}/${pad2(end.getMonth() + 1)}/${end.getFullYear()}`;
}


function buildHolidayEvents(date, t) {
  const solarKey = `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const lunar = getLunarInfo(date);
  const lunarKey = `${pad2(lunar.month)}-${pad2(lunar.day)}`;
  const events = [];

  const solarHolidays = {
    "01-01": t("vnCalendar.holidays.solar.newYear"),
    "03-08": t("vnCalendar.holidays.solar.womensDay"),
    "04-30": t("vnCalendar.holidays.solar.reunification"),
    "05-01": t("vnCalendar.holidays.solar.labourDay"),
    "06-01": t("vnCalendar.holidays.solar.childrensDay"),
    "09-02": t("vnCalendar.holidays.solar.nationalDay"),
    "10-20": t("vnCalendar.holidays.solar.vnWomensDay"),
    "11-20": t("vnCalendar.holidays.solar.teachersDay"),
    "12-22": t("vnCalendar.holidays.solar.armyDay"),
    "12-25": t("vnCalendar.holidays.solar.christmas"),
  };

  const lunarHolidays = {
    "01-01": t("vnCalendar.holidays.lunar.tet"),
    "01-02": t("vnCalendar.holidays.lunar.tet2"),
    "01-03": t("vnCalendar.holidays.lunar.tet3"),
    "01-15": t("vnCalendar.holidays.lunar.firstFullMoon"),
    "03-10": t("vnCalendar.holidays.lunar.hungKings"),
    "04-15": t("vnCalendar.holidays.lunar.buddhaBirthday"),
    "07-15": t("vnCalendar.holidays.lunar.vuLan"),
    "08-15": t("vnCalendar.holidays.lunar.midAutumn"),
    "12-23": t("vnCalendar.holidays.lunar.kitchenGods"),
  };

  if (solarHolidays[solarKey]) {
    events.push({ id: `solar-${solarKey}`, title: solarHolidays[solarKey], type: "holiday", source: "system" });
  }
  if (lunarHolidays[lunarKey] && !lunar.leap) {
    events.push({ id: `lunar-${lunarKey}`, title: lunarHolidays[lunarKey], type: "lunar", source: "system" });
  }
  return events;
}

function getTypeLabel(type, t) {
  if (type === "study") return t("vnCalendar.types.study");
  if (type === "holiday" || type === "lunar") return t("vnCalendar.types.holiday");
  if (type === "birthday") return t("vnCalendar.types.birthday");
  if (type === "death_anniversary") return t("vnCalendar.types.death_anniversary");
  if (type === "family") return t("vnCalendar.types.family");
  return t("vnCalendar.types.personal");
}

function getDayEvents(date, savedEvents, t) {
  const key = toDateKey(date);
  return [
    ...buildHolidayEvents(date, t),
    ...savedEvents.filter((item) => item.date === key),
  ];
}

export default function VietnamCalendarPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();

  const MONTH_NAMES = useMemo(() => {
    const months = t("vnCalendar.labels.months", { returnObjects: true });
    if (Array.isArray(months)) return months;
    return [];
  }, [t]);

  const WEEKDAY_LABELS = useMemo(() => {
    const days = t("vnCalendar.labels.weekdays", { returnObjects: true });
    if (Array.isArray(days)) return days;
    return [];
  }, [t]);

  const DEFAULT_EVENT_TEMPLATES = useMemo(
    () => [
      { type: "holiday", title: t("vnCalendar.types.holiday"), note: "" },
      { type: "family", title: t("vnCalendar.types.family"), note: "" },
      { type: "study", title: t("vnCalendar.types.study"), note: "" },
    ],
    [t]
  );

  const today = useMemo(() => new Date(), []);
  const currentUser = useMemo(() => getStoredUser() || {}, []);
  const navigate = useNavigate();
  const location = useLocation();
  const postsPath = postsPathFromCalendarPath(location.pathname);
  const todayIso = toIsoLocal(today);
  const currentRole = String(currentUser.role_name || currentUser.role || "").toLowerCase();
  const canCreateGlobal = currentRole === "manager" || currentRole === "admin";

  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState("month");
  const [savedEvents, setSavedEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const emptyEventForm = useMemo(
    () => ({
      title: "",
      type: "holiday",
      time: "",
      note: "",
      // Lịch mới mặc định là lịch cá nhân; quản lý tự chọn "cả dòng họ" khi cần (tránh gửi nhắc tới cả họ ngoài ý muốn).
      visibility: "personal",
      reminder_days: "1",
    }),
    [canCreateGlobal]
  );
  const [eventForm, setEventForm] = useState(emptyEventForm);

  useEffect(() => {
    setEventForm((current) => ({
      ...current,
      visibility: canCreateGlobal ? current.visibility || "personal" : "personal",
    }));
  }, [canCreateGlobal]);

  const visibleDays = useMemo(() => {
    if (viewMode === "day") return [selectedDate];
    if (viewMode === "week") return getWeekDates(selectedDate);
    return getMonthMatrix(selectedDate.getFullYear(), selectedDate.getMonth());
  }, [selectedDate, viewMode]);

  const range = useMemo(() => {
    // Xem theo ngày vẫn tải cả tháng để chuyển ngày không phải gọi lại máy chủ.
    const days = viewMode === "day"
      ? getMonthMatrix(selectedDate.getFullYear(), selectedDate.getMonth())
      : visibleDays;
    const first = days[0] || selectedDate;
    const last = days[days.length - 1] || selectedDate;
    return { from: toDateKey(first), to: toDateKey(last) };
  }, [selectedDate, visibleDays, viewMode]);

  const loadCalendarEvents = useCallback(async () => {
    try {
      setLoadingEvents(true);
      setLoadFailed(false);
      const data = await apiRequest(`/api/calendar/events?from=${range.from}&to=${range.to}`);
      setSavedEvents(Array.isArray(data.events) ? data.events : []);
      setCalendarStatus("");
    } catch (error) {
      setCalendarStatus(friendlyErrorMessage(error, t));
      setLoadFailed(true);
      setSavedEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    loadCalendarEvents();
  }, [loadCalendarEvents]);
  
  useEffect(() => {
  let timer = null;
  let cleanup = null;

  const attachCalendarSocket = () => {
    const socket = getSocket();

    if (!socket) {
      return false;
    }

    const handleCalendarUpdated = (payload) => {
      console.log("Realtime calendar_updated received:", payload);
      loadCalendarEvents();
    };

    socket.on("calendar_updated", handleCalendarUpdated);

    cleanup = () => {
      socket.off("calendar_updated", handleCalendarUpdated);
    };

    return true;
  };

  if (!attachCalendarSocket()) {
    timer = window.setInterval(() => {
      if (attachCalendarSocket()) {
        window.clearInterval(timer);
      }
    }, 500);
  }

  return () => {
    if (timer) {
      window.clearInterval(timer);
    }

    if (cleanup) {
      cleanup();
    }
  };
}, [loadCalendarEvents]);

  const selectedLunar = getLunarInfo(selectedDate);
  const selectedEvents = getDayEvents(selectedDate, savedEvents, t);

  const setDateByInput = (field, value) => {
    const current = selectedDate;
    const nextYear = field === "year" ? Number(value) : current.getFullYear();
    const nextMonth = field === "month" ? Number(value) : current.getMonth();
    const nextDay = field === "day" ? Number(value) : current.getDate();
    const maxDay = new Date(nextYear, nextMonth + 1, 0).getDate();
    setSelectedDate(new Date(nextYear, nextMonth, Math.min(nextDay, maxDay)));
  };

  const shiftPeriod = (amount) => {
    if (viewMode === "day") setSelectedDate(addDays(selectedDate, amount));
    else if (viewMode === "week") setSelectedDate(addDays(selectedDate, amount * 7));
    else setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + amount, 1));
  };

  const resetEventForm = () => {
    setEditingEvent(null);
    setEventForm({ ...emptyEventForm });
  };

  const openCreateForm = (template = null) => {
    setEditingEvent(null);
    setEventForm({
      ...emptyEventForm,
      ...(template || {}),
      visibility: canCreateGlobal ? template?.visibility || emptyEventForm.visibility : "personal",
    });
    setShowEventForm(true);
  };

  const openEditForm = (event) => {
    if (!event?.can_edit) {
      setCalendarStatus(t("vnCalendar.messages.noPermissionEdit"));
      return;
    }

    setEditingEvent(event);
    setSelectedDate(new Date(event.date || event.event_date));
    setEventForm({
      title: event.title || "",
      type: event.type || "holiday",
      time: event.time || event.event_time || "",
      note: event.note || "",
      visibility: canCreateGlobal ? event.visibility || "global" : "personal",
      reminder_days: String(event.reminder_days ?? 1),
    });
    setShowEventForm(true);
  };

  const saveEvent = async (event) => {
    event.preventDefault();
    const title = eventForm.title.trim();
    if (!title) {
      setCalendarStatus(t("vnCalendar.messages.titleRequired"));
      notify(t("vnCalendar.messages.titleRequired"), "error");
      return;
    }

    const payload = {
      date: editingEvent?.date || editingEvent?.event_date || toDateKey(selectedDate),
      title,
      type: eventForm.type,
      time: eventForm.time,
      note: eventForm.note.trim(),
      visibility: canCreateGlobal ? eventForm.visibility : "personal",
      reminder_days: Number(eventForm.reminder_days || 0),
    };

    try {
      setCalendarStatus(editingEvent ? t("vnCalendar.messages.updating") : t("vnCalendar.messages.saving"));
      if (editingEvent?.id) {
        await apiRequest(`/api/calendar/events/${editingEvent.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest("/api/calendar/events", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setEventForm({ ...emptyEventForm });
      setEditingEvent(null);
      setShowEventForm(false);
      setCalendarStatus(
        payload.visibility === "global"
          ? t("vnCalendar.messages.saveSuccessGlobal")
          : t("vnCalendar.messages.saveSuccessPersonal")
      );
      notify(payload.visibility === "global" ? t("vnCalendar.messages.saveSuccessGlobal") : t("vnCalendar.messages.saveSuccessPersonal"), "success");
      await loadCalendarEvents();
    } catch (error) {
      const failure = friendlyErrorMessage(error, t);
      setCalendarStatus(failure);
      notify(failure, "error");
    }
  };

  const deleteEvent = async (event) => {
    if (!event?.can_delete) {
      setCalendarStatus(t("vnCalendar.messages.noPermissionDelete"));
      return;
    }

    const label = event.visibility === "global" ? t("vnCalendar.messages.scopeGlobal") : t("vnCalendar.messages.scopePersonal");
    if (!await confirm({ message: t("vnCalendar.messages.deleteConfirm", { label }), tone: "danger" })) return;

    try {
      await apiRequest(`/api/calendar/events/${event.id}`, { method: "DELETE" });
      setCalendarStatus(t("vnCalendar.messages.deleteSuccess"));
      if (editingEvent?.id === event.id) resetEventForm();
      await loadCalendarEvents();
    } catch (error) {
      setCalendarStatus(friendlyErrorMessage(error, t));
    }
  };

  const years = Array.from({ length: 41 }, (_, index) => today.getFullYear() - 20 + index);

  return (
    <div className="vn-calendar-page">
      <section className="vn-calendar-hero">
        <div>
          <span className="vn-eyebrow">{t("vnCalendar.hero.eyebrow")}</span>
          <h1>{t("vnCalendar.hero.title")}</h1>
          <p>{t("vnCalendar.hero.description")}</p>
        </div>
        <div className="vn-hero-date">
          <strong>{pad2(selectedDate.getDate())}</strong>
          <span>{MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}</span>
          <small>{t("vnCalendar.lunar")}: {selectedLunar.day}/{selectedLunar.month}{selectedLunar.leap ? ` ${t("vnCalendar.leap")}` : ""}</small>
        </div>
      </section>

      <section className="vn-calendar-shell">
        <div className="vn-calendar-toolbar">
          <div className="vn-toolbar-left">
            <button type="button" onClick={() => shiftPeriod(-1)} aria-label={t("common.back")}>
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <div>
              <h2>{viewMode === "day"
                ? `${WEEKDAY_LABELS[selectedDate.getDay()]}, ${formatVietnamDate(selectedDate)}`
                : viewMode === "week"
                  ? getWeekRangeText(selectedDate)
                  : `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`}</h2>
              <p>{t("vnCalendar.today")}: {formatVietnamDate(today)}</p>
            </div>
            <button type="button" onClick={() => shiftPeriod(1)} aria-label={t("common.next")}>
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>

          <div className="vn-toolbar-actions">
            <button type="button" className="vn-today-btn" onClick={() => setSelectedDate(today)}>{t("vnCalendar.today")}</button>
            <div className="vn-view-toggle" role="group" aria-label={t("vnCalendar.viewToggleAria")}>
              <button type="button" className={viewMode === "day" ? "active" : ""} onClick={() => setViewMode("day")}>{t("vnCalendar.day")}</button>
              <button type="button" className={viewMode === "week" ? "active" : ""} onClick={() => setViewMode("week")}>{t("vnCalendar.week")}</button>
              <button type="button" className={viewMode === "month" ? "active" : ""} onClick={() => setViewMode("month")}>{t("vnCalendar.month")}</button>
            </div>
          </div>
        </div>

        <div className="vn-date-controls">
          <label>
            {t("vnCalendar.day")}
            <select value={selectedDate.getDate()} onChange={(event) => setDateByInput("day", event.target.value)}>
              {Array.from({ length: new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate() }, (_, index) => (
                <option key={index + 1} value={index + 1}>{index + 1}</option>
              ))}
            </select>
          </label>
          <label>
            {t("vnCalendar.month")}
            <select value={selectedDate.getMonth()} onChange={(event) => setDateByInput("month", event.target.value)}>
              {MONTH_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
            </select>
          </label>
          <label>
            {t("vnCalendar.year")}
            <select value={selectedDate.getFullYear()} onChange={(event) => setDateByInput("year", event.target.value)}>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
        </div>

        {calendarStatus ? (
          <div className="vn-calendar-status">
            {calendarStatus}
            {loadFailed && !loadingEvents ? (
              <button type="button" className="state-action" onClick={loadCalendarEvents}>{t("common.states.retry")}</button>
            ) : null}
          </div>
        ) : null}
        {loadingEvents ? <div className="vn-calendar-status is-loading">{t("vnCalendar.syncing")}</div> : null}

        <div className={`vn-calendar-grid ${viewMode === "week" ? "is-week" : ""} ${viewMode === "day" ? "is-day" : ""}`}>
          {viewMode !== "day" ? WEEKDAY_LABELS.map((label) => <div key={label} className="vn-weekday">{label}</div>) : null}
          {visibleDays.map((date) => {
            const lunar = getLunarInfo(date);
            const isOutsideMonth = viewMode !== "day" && date.getMonth() !== selectedDate.getMonth();
            const isToday = toDateKey(date) === toDateKey(today);
            const isSelected = toDateKey(date) === toDateKey(selectedDate);
            const allDayEvents = getDayEvents(date, savedEvents, t);
            // Ngày lễ hệ thống xếp sau: sự kiện nhiều ngày không bị che bởi tên ngày lễ trùng ngày (vd. 20/10).
            const dayEvents = [
              ...allDayEvents.filter((event) => event.source !== "system"),
              ...allDayEvents.filter((event) => event.source === "system"),
            ];
            return (
              <button
                key={toDateKey(date)}
                type="button"
                className={`vn-day-cell ${isOutsideMonth ? "is-muted" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                data-today-label={t("vnCalendar.today")}
                onClick={() => setSelectedDate(date)}
              >
                <span className="solar-day">{date.getDate()}</span>
                <span className="lunar-day">{lunar.day === 1 ? `${lunar.day}/${lunar.month}` : lunar.day}</span>
                <span className="event-dots">
                  {dayEvents.slice(0, 3).map((event) => <i key={event.id} className={`dot-${event.type}`} />)}
                </span>
                {viewMode === "day" ? (
                  <ul className="vn-day-event-list">
                    {dayEvents.map((event) => (
                      <li key={event.id}><i className={`dot-${event.type}`} />{event.time ? `${event.time} · ` : ""}{event.title}</li>
                    ))}
                  </ul>
                ) : dayEvents[0] ? (
                  <small>{dayEvents[0].title}{dayEvents.length > 1 ? ` +${dayEvents.length - 1}` : ""}</small>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="vn-agenda-panel">
        <div className="vn-selected-card">
          <span className="vn-eyebrow">{t("vnCalendar.selectedDate")}</span>
          <h2>{formatVietnamDate(selectedDate)}</h2>
          <p>{WEEKDAY_LABELS[selectedDate.getDay()]}, {t("vnCalendar.lunarPrefix")} {selectedLunar.day}/{selectedLunar.month}/{selectedLunar.year}{selectedLunar.leap ? ` ${t("vnCalendar.leap")}` : ""}</p>
        </div>

        <div className="vn-template-row">
          {DEFAULT_EVENT_TEMPLATES.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => openCreateForm({ title: item.title, type: item.type, note: item.note })}
            >
              <span className="material-symbols-outlined">{item.type === "study" ? "school" : item.type === "holiday" ? "celebration" : "diversity_3"}</span>
              {item.title}
            </button>
          ))}
        </div>

        <div className="vn-agenda-header">
          <h3>{t("vnCalendar.agendaTitle")}</h3>
          <button type="button" onClick={() => (showEventForm ? (setShowEventForm(false), resetEventForm()) : openCreateForm())}>
            <span className="material-symbols-outlined">add</span>
            {canCreateGlobal ? t("vnCalendar.addEvent") : t("vnCalendar.addPersonalEvent")}
          </button>
        </div>

        {showEventForm ? (
          <form className="vn-event-form" onSubmit={saveEvent}>
            <div className="vn-form-heading">
              <strong>{editingEvent ? t("vnCalendar.editTitle") : t("vnCalendar.createTitle")}</strong>
              <span>{canCreateGlobal ? t("vnCalendar.form.managerHint") : t("vnCalendar.form.memberHint")}</span>
            </div>
            <input value={eventForm.title} onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))} placeholder={t("vnCalendar.form.titlePlaceholder")} />
            <div className="vn-event-form-row">
              <select value={eventForm.type} onChange={(event) => setEventForm((current) => ({ ...current, type: event.target.value }))}>
                <option value="holiday">{t("vnCalendar.types.holiday")}</option>
                <option value="family">{t("vnCalendar.types.family")}</option>
                <option value="study">{t("vnCalendar.types.study")}</option>
                <option value="personal">{t("vnCalendar.types.personal")}</option>
              </select>
              <input type="time" value={eventForm.time} onChange={(event) => setEventForm((current) => ({ ...current, time: event.target.value }))} />
            </div>

            <label className="vn-reminder-field">
              {t("vnCalendar.form.visibility")}
              <select
                value={eventForm.visibility}
                disabled={!canCreateGlobal}
                onChange={(event) => setEventForm((current) => ({ ...current, visibility: event.target.value }))}
              >
                <option value="personal">{t("vnCalendar.form.visibilityPersonal")}</option>
                <option value="global">{t("vnCalendar.form.visibilityGlobal")}</option>
              </select>
              <small>{canCreateGlobal ? t("vnCalendar.form.visibilityHintManager") : t("vnCalendar.form.visibilityHintMember")}</small>
            </label>

            <label className="vn-reminder-field">
              {t("vnCalendar.form.reminder")}
              <select value={eventForm.reminder_days} onChange={(event) => setEventForm((current) => ({ ...current, reminder_days: event.target.value }))}>
                <option value="0">{t("vnCalendar.form.reminderOption.0")}</option>
                <option value="1">{t("vnCalendar.form.reminderOption.1")}</option>
                <option value="2">{t("vnCalendar.form.reminderOption.2")}</option>
                <option value="3">{t("vnCalendar.form.reminderOption.3")}</option>
                <option value="7">{t("vnCalendar.form.reminderOption.7")}</option>
                <option value="14">{t("vnCalendar.form.reminderOption.14")}</option>
                <option value="30">{t("vnCalendar.form.reminderOption.30")}</option>
              </select>
              <small>{t("vnCalendar.form.reminderHint")}</small>
            </label>
            <textarea value={eventForm.note} onChange={(event) => setEventForm((current) => ({ ...current, note: event.target.value }))} placeholder={t("vnCalendar.form.notePlaceholder")} rows={3} />
            <div className="vn-event-actions">
              <button type="button" onClick={() => { setShowEventForm(false); resetEventForm(); }}>{t("vnCalendar.form.cancel")}</button>
              <button type="submit">{editingEvent ? t("vnCalendar.form.update") : t("vnCalendar.form.save")}</button>
            </div>
          </form>
        ) : null}

        <div className="vn-event-list">
          {selectedEvents.length === 0 ? (
            <p className="vn-empty">{t("vnCalendar.noEvents")}</p>
          ) : (
            selectedEvents.map((event) => (
              <div key={event.id} className={`vn-event-item type-${event.type}`}>
                <div>
                  <span>{getTypeLabel(event.type, t)}{event.time ? ` • ${event.time}` : ""}</span>
                  <strong>{event.title}</strong>
                  {event.source !== "system" ? (
                    <span className={`vn-scope-badge ${event.visibility === "global" ? "is-global" : "is-personal"}`}>
                      {event.visibility === "global" ? t("vnCalendar.messages.scopeGlobal") : t("vnCalendar.messages.scopePersonal")}
                    </span>
                  ) : null}
                  {event.type === "death_anniversary" && event.original_lunar_date ? (
                    <small>{t("vnCalendar.originalLunarDeath")}: {event.original_lunar_date}</small>
                  ) : null}
                  {event.type === "death_anniversary" && event.anniversary_lunar_date ? (
                    <small>{t("vnCalendar.anniversaryLunarYear")}: {event.anniversary_lunar_date}</small>
                  ) : null}
                  {event.type === "birthday" && event.lunar_date ? (
                    <small>{t("vnCalendar.birthdayLunarYear")}: {event.lunar_date}</small>
                  ) : null}
                  {event.reminder_days != null && event.source !== "system" ? (
                    <em>
                      {t("vnCalendar.form.reminder")} {Number(event.reminder_days) === 0 ? t("vnCalendar.form.reminderOption.0").toLowerCase() : `${event.reminder_days} ${t("vnCalendar.day").toLowerCase()}`}
                    </em>
                  ) : null}
                  {event.creator_name ? <small>{t("vnCalendar.creator")}: {event.creator_name}</small> : null}
                  {event.note ? <p>{event.note}</p> : null}
                </div>
                {(postsPath && canDraftAnnouncement(event, todayIso)) || (event.source !== "system" && (event.can_edit || event.can_delete)) ? (
                  <div className="vn-event-item-actions">
                    {postsPath && canDraftAnnouncement(event, todayIso) ? (
                      <button
                        type="button"
                        title={t("vnCalendar.draftAnnouncement")}
                        aria-label={t("vnCalendar.draftAnnouncement")}
                        onClick={() => navigate(`${postsPath}?compose=1&event=${encodeURIComponent(String(event.id))}`)}
                      >
                        <span className="material-symbols-outlined">campaign</span>
                      </button>
                    ) : null}
                    {event.source !== "system" && event.can_edit ? (
                      <button type="button" onClick={() => openEditForm(event)} title={t("vnCalendar.editTitle")}>
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                    ) : null}
                    {event.source !== "system" && event.can_delete ? (
                      <button type="button" onClick={() => deleteEvent(event)} title={t("common.delete")}>
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
