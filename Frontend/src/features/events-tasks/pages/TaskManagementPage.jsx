import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getAdminClanTasks, getAdminClans, getAdminMembers } from "../../../api/adminService";
import {
  assignTaskAPI,
  bulkAssignTasksAPI,
  createManagerEventAPI,
  deleteAssignedTaskAPI,
  deleteManagerEventAPI,
  getManagerEventsAPI,
  getMembers,
  getTasksAPI,
  updateAssignedTaskAPI,
  updateManagerEventAPI,
} from "../../../api/managerService";
import { getMemberTasks, getMemberEvents, updateMemberTaskStatus } from "../../../api/memberService";
import { generateEventFormAI } from "../../../api/aiServerService";
import { getSocket } from "../../../services/socket";
import DateInput from "../../../shared/components/DateInput";
import VoiceRecorder from "../../voice/components/VoiceRecorder";
import { useLanguage } from "../../../i18n/LanguageContext";
import { formatDateTimeVN, formatDateVN, isoToVietnamDate, vietnamDateToIso } from "../../../shared/utils/dateFormat";
import "./TaskManagementPage.css";

const STATUS_LABELS = {
  assigned: "eventsTasks.status.assigned",
  in_progress: "eventsTasks.status.in_progress",
  completed: "eventsTasks.status.completed",
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function fullName(item) {
  return (
    item?.member_name ||
    item?.display_name ||
    [item?.surname, item?.middle_name, item?.first_name].filter(Boolean).join(" ").trim() ||
    item?.account_email ||
    item?.email ||
    "eventsTasks.placeholders.noName"
  );
}

function isLivingMember(member) {
  if (!member) return false;

  const livingValue = member.is_living ?? member.isLiving ?? member.living;
  if (livingValue !== undefined && livingValue !== null && livingValue !== "") {
    const normalized = String(livingValue).trim().toLowerCase();
    if (["0", "false", "dead", "deceased", "lost", "mất", "da mat", "đã mất"].includes(normalized)) {
      return false;
    }
  }

  if (member.death_date || member.deathDate || member.date_of_death) {
    return false;
  }

  const statusText = String(member.life_status || member.lifeStatus || member.member_status || "").trim().toLowerCase();
  if (statusText && ["dead", "deceased", "lost", "mất", "da mat", "đã mất"].includes(statusText)) {
    return false;
  }

  return true;
}

function isAssignableMember(member) {
  return (
    Number(member?.account_id) > 0 &&
    Number(member?.role_id) === 3 &&
    (member?.status || member?.account_status || "active") === "active" &&
    isLivingMember(member)
  );
}

function formatDate(value, withTime = false, t = (s) => s) {
  if (!value) return t("eventsTasks.placeholders.notSet");
  return withTime ? formatDateTimeVN(value) : formatDateVN(value);
}

function toDateInput(value) {
  return isoToVietnamDate(value);
}
function eventStatusLabel(status, t = (s) => s) {
  if (status === "ongoing") return t("eventsTasks.status.ongoing");
  if (status === "ended") return t("eventsTasks.status.ended");
  return t("eventsTasks.status.upcoming");
}

function eventStatusClass(status) {
  if (status === "ongoing") return "is-ongoing";
  if (status === "ended") return "is-ended";
  return "is-upcoming";
}

function getEventStartDate(event) {
  return event?.start_date || event?.event_date || event?.date || "";
}

function getEventEndDate(event) {
  return event?.end_date || event?.start_date || event?.event_date || event?.date || "";
}

function formatEventRange(event, t = (s) => s) {
  const start = getEventStartDate(event);
  const end = getEventEndDate(event);
  if (!start && !end) return t("eventsTasks.placeholders.noTime");
  if (!end || start === end) return formatDate(start, false, t);
  return `${formatDate(start, false, t)} - ${formatDate(end, false, t)}`;
}


function summarizeTasks(tasks) {
  return {
    total: tasks.length,
    open: tasks.filter((task) => task.status !== "completed").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    completed: tasks.filter((task) => task.status === "completed").length,
  };
}

function summarizeEvents(events) {
  return {
    total: events.length,
    active: events.filter((event) => event.status === "ongoing").length,
    done: events.filter((event) => event.status === "ended").length,
  };
}

function MemberCombobox({ members, value, onChange, disabled = false }) {
  const { t } = useTranslation();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedIds = useMemo(() => new Set(value.map((id) => String(id))), [value]);
  const selectedMembers = useMemo(
    () => members.filter((member) => selectedIds.has(String(member.account_id))),
    [members, selectedIds]
  );
  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((member) => `${fullName(member)} ${member.account_id}`.toLowerCase().includes(q));
  }, [members, search]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const toggleMember = (accountId) => {
    const id = String(accountId);
    const next = selectedIds.has(id) ? value.filter((item) => String(item) !== id) : [...value, id];
    onChange(next);
  };

  const selectFiltered = () => {
    const next = new Set(value.map((id) => String(id)));
    filteredMembers.forEach((member) => next.add(String(member.account_id)));
    onChange([...next]);
  };

  return (
    <div className="task-combobox" ref={rootRef}>
      <button
        type="button"
        className="task-combobox-button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selectedMembers.length ? t("eventsTasks.placeholders.peopleSelected", { count: selectedMembers.length }) : t("eventsTasks.placeholders.selectAssignee")}</span>
        <span className="material-symbols-outlined">expand_more</span>
      </button>

      {open && (
        <div className="task-combobox-menu">
          <input
            className="task-combobox-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("eventsTasks.placeholders.searchByNameId")}
            autoFocus
          />
          <div className="task-combobox-tools">
            <button type="button" onClick={selectFiltered} disabled={!filteredMembers.length}>
              {t("eventsTasks.actions.selectFiltered")}
            </button>
            <button type="button" onClick={() => onChange([])} disabled={!value.length}>
              {t("common.deselect")}
            </button>
          </div>
          <div className="task-combobox-list" role="listbox" aria-multiselectable="true">
            {filteredMembers.map((member) => {
              const id = String(member.account_id);
              return (
                <label className="task-combobox-option" key={id}>
                  <input type="checkbox" checked={selectedIds.has(id)} onChange={() => toggleMember(id)} />
                  <span>{fullName(member)}</span>
                </label>
              );
            })}
            {!filteredMembers.length && <div className="task-combobox-empty">{t("eventsTasks.placeholders.noMemberFound")}</div>}
          </div>
        </div>
      )}

      <div className="task-selected">
        {selectedMembers.map((member) => (
          <span key={member.account_id}>
            {fullName(member)}
            <button type="button" onClick={() => toggleMember(member.account_id)} aria-label={`Bỏ chọn ${fullName(member)}`}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </span>
        ))}
        {!selectedMembers.length && <small>{t("eventsTasks.placeholders.comboboxHint")}</small>}
      </div>
    </div>
  );
}

export default function TaskManagementPage({ role = "member" }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { clanId } = useParams();
  const navigate = useNavigate();
  const recognitionRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [clans, setClans] = useState([]);
  const [clan, setClan] = useState(null);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTaskId, setSavingTaskId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({ event_id: "", member_ids: [], title: "", description: "", due_date: "" });
  const [eventForm, setEventForm] = useState({ title: "", start_date: "", end_date: "", description: "" });
  const [editEventForm, setEditEventForm] = useState({ title: "", start_date: "", end_date: "", description: "" });
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTaskSuggestions, setAiTaskSuggestions] = useState([]);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [showAiEventModal, setShowAiEventModal] = useState(false);
  const [showEditEventModal, setShowEditEventModal] = useState(false);
  const [showAssignTaskModal, setShowAssignTaskModal] = useState(false);
  const [aiTaskCount, setAiTaskCount] = useState(5);
  const [voiceListening, setVoiceListening] = useState(false);

  // Premium Toast & Confirm Modal State
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [confirmDelete, setConfirmDelete] = useState({ show: false, eventId: null });

  // Tự động tắt toast sau 3.5 giây
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  useEffect(() => {
    if (error) {
      setToast({ show: true, message: error, type: "error" });
    }
  }, [error]);

  useEffect(() => {
    if (message) {
      setToast({ show: true, message: message, type: "success" });
    }
  }, [message]);


  const handleAiTaskCountChange = (event) => {
    const value = event.target.value;
    if (value === "") {
      setAiTaskCount("");
      return;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;

    setAiTaskCount(Math.min(Math.max(Math.round(parsed), 1), 20));
  };

  const appendAiPromptText = useCallback((text) => {
    const transcript = String(text || "").trim();
    if (!transcript) return;

    setAiPrompt((current) => {
      const prompt = String(current || "").trim();
      if (!prompt) return transcript;
      const separator = /[.!?…]$/.test(prompt) ? " " : ". ";
      return `${prompt}${separator}${transcript}`;
    });
  }, []);

  const toggleAiPromptVoiceInput = useCallback(() => {
    if (voiceListening) {
      recognitionRef.current?.stop?.();
      setVoiceListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(t("eventsTasks.errors.speechUnsupported"));
      return;
    }

    recognitionRef.current?.abort?.();

    const recognition = new SpeechRecognition();
    recognition.lang = language === "en" ? "en-US" : "vi-VN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || "")
        .join(" ");
      appendAiPromptText(transcript);
    };

recognition.onerror = (event) => {
  const errorName = event?.error || "";

  console.error("Speech recognition error:", errorName, event);

  if (errorName === "not-allowed" || errorName === "service-not-allowed") {
    setError(t("eventsTasks.errors.micBlocked"));
  } else if (errorName === "no-speech") {
    setError(t("eventsTasks.errors.noSpeechDetected"));
  } else if (errorName === "audio-capture") {
    setError("Không truy cập được micro. Kiểm tra thiết bị micro hoặc quyền micro của Chrome.");
  } else if (errorName === "network") {
    setError("Chrome không kết nối được dịch vụ nhận diện giọng nói. Hãy thử localhost, mạng khác, tắt VPN/proxy.");
  } else if (errorName === "aborted") {
    setError("Quá trình nhận diện giọng nói đã bị dừng.");
  } else {
    setError(`Không thể chuyển giọng nói thành văn bản. Lỗi: ${errorName || "unknown"}`);
  }

  setVoiceListening(false);
};

    recognition.onend = () => {
      setVoiceListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setError("");
    setVoiceListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceListening(false);
      setError(t("eventsTasks.errors.speechConversionFailed"));
    }
  }, [appendAiPromptText, language, voiceListening]);

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isMember = role === "member";
  const canAssign = isManager || (isAdmin && clanId);
  const stats = useMemo(() => summarizeTasks(tasks), [tasks]);
  const eventStats = useMemo(() => summarizeEvents(events), [events]);
  const speechSupported = useMemo(
    () => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  const selectedEvent = useMemo(
    () => events.find((item) => String(item.id) === String(selectedEventId)) || null,
    [events, selectedEventId]
  );
  const adminClanTasksPath = useMemo(() => {
    const targetClanId = clanId || selectedEvent?.clan_id || clan?.id || clan?.clan_id;
    return targetClanId ? `/dashboard/tasks/clan/${targetClanId}` : "/dashboard/tasks";
  }, [clan?.clan_id, clan?.id, clanId, selectedEvent?.clan_id]);
  const eventListPath = isAdmin ? adminClanTasksPath : "/manager/tasks";
  const eventListLabel = isAdmin ? t("eventsTasks.admin.title") : t("eventsTasks.manager.title");
  const returnToEventList = useCallback(() => {
    setSelectedEventId("");
    setAiTaskSuggestions([]);
    setMessage("");
    setError("");
    navigate(eventListPath);
  }, [eventListPath, navigate]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
  }, []);

  const selectedTasks = useMemo(() => {
    if (!selectedEventId) return tasks;
    return tasks.filter((task) => String(task.event_id || "") === String(selectedEventId));
  }, [tasks, selectedEventId]);

  const filteredEvents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return events;
    return events.filter((event) => `${event.title || ""} ${event.description || ""} ${event.clan_name || ""}`.toLowerCase().includes(q));
  }, [events, searchTerm]);

  const activeFilteredEvents = useMemo(
    () => filteredEvents.filter((event) => event.status !== "ended"),
    [filteredEvents]
  );

  const archivedEvents = useMemo(
    () => events.filter((event) => event.status === "ended"),
    [events]
  );

  const filteredArchivedEvents = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase();
    if (!q) return archivedEvents;
    return archivedEvents.filter((event) => `${event.title || ""} ${event.description || ""} ${event.clan_name || ""}`.toLowerCase().includes(q));
  }, [archivedEvents, archiveSearch]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (isAdmin && !clanId) {
        const data = await getAdminClans();
        setClans(asArray(data.clans));
        setTasks([]);
        setEvents([]);
        setMembers([]);
        setClan(null);
        return;
      }

      if (isMember) {
        const [taskData, eventData] = await Promise.all([getMemberTasks(), getMemberEvents()]);
        setTasks(asArray(taskData.tasks));
        setEvents(asArray(eventData.events));
        setMembers([]);
        setClan(null);
        return;
      }

      if (isAdmin && clanId) {
        const [taskData, memberData, eventData] = await Promise.all([
          getAdminClanTasks(clanId),
          getAdminMembers(),
          getManagerEventsAPI({ clan_id: clanId }),
        ]);
        setClan(taskData.clan || null);
        setTasks(asArray(taskData.tasks));
        setEvents(asArray(eventData.events));
        setMembers(
          asArray(memberData.members).filter(
            (member) =>
              Number(member.clan_id) === Number(clanId) &&
              isAssignableMember(member)
          )
        );
        return;
      }

      const [taskRows, memberRows, eventData] = await Promise.all([getTasksAPI(), getMembers(), getManagerEventsAPI()]);
      setTasks(asArray(taskRows));
      setEvents(asArray(eventData.events));
      setMembers(
        asArray(memberRows).filter(
          (member) => isAssignableMember(member)
        )
      );
      setClan(null);
    } catch (err) {
      setError(err?.message || t("eventsTasks.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [clanId, isAdmin, isMember]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isMember) return;
    const taskId = searchParams.get("taskId");
    if (!taskId || !tasks.length) return;

    const task = tasks.find((t) => String(t.task_id || t.id) === String(taskId));
    if (task && task.event_id) {
      setSelectedEventId(task.event_id);
      searchParams.delete("taskId");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, isMember, tasks, setSearchParams]);

  useEffect(() => {
  let timer = null;
  let cleanup = null;

  const attachSocketListeners = () => {
    const socket = getSocket();

    if (!socket) {
      return false;
    }

    const handleTaskAssigned = (payload) => {
      console.log("Realtime task_assigned received:", payload);
      loadData();
    };

    const handleTaskStatusUpdated = (payload) => {
      console.log("Realtime task_status_updated received:", payload);
      loadData();
    };

    if (isMember) {
      socket.on("task_assigned", handleTaskAssigned);
    }

    if (isManager || isAdmin) {
      socket.on("task_status_updated", handleTaskStatusUpdated);
    }

    cleanup = () => {
      socket.off("task_assigned", handleTaskAssigned);
      socket.off("task_status_updated", handleTaskStatusUpdated);
    };

    return true;
  };

  if (!attachSocketListeners()) {
    timer = window.setInterval(() => {
      if (attachSocketListeners()) {
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
}, [loadData, isMember, isManager, isAdmin]);

  useEffect(() => {
    if (!canAssign || !selectedEventId) return;
    const stillExists = events.some((event) => String(event.id) === String(selectedEventId));
    if (!stillExists) setSelectedEventId("");
  }, [canAssign, events, selectedEventId]);

  useEffect(() => {
    if (!selectedEvent) {
      setEditEventForm({ title: "", start_date: "", end_date: "", description: "" });
      setForm((prev) => ({ ...prev, event_id: "" }));
      return;
    }
    setEditEventForm({
      title: selectedEvent.title || "",
      start_date: toDateInput(getEventStartDate(selectedEvent)),
      end_date: toDateInput(getEventEndDate(selectedEvent)),
      description: selectedEvent.description || "",
    });
    setForm((prev) => ({ ...prev, event_id: String(selectedEvent.id) }));
  }, [selectedEvent]);

  const submitTask = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const memberIds = form.member_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (!selectedEventId) {
      setError(t("eventsTasks.messages.selectEventFirst"));
      return;
    }
    if (!memberIds.length) {
      setError(t("eventsTasks.messages.selectMemberFirst"));
      return;
    }
    if (!form.title.trim()) {
      setError(t("eventsTasks.messages.enterTaskTitle"));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        due_date: vietnamDateToIso(form.due_date) || null,
        event_id: Number(selectedEventId),
        member_ids: memberIds,
        ...(isAdmin && clanId ? { clan_id: Number(clanId) } : {}),
      };
      const result = await assignTaskAPI(payload);
      setMessage(t("eventsTasks.messages.taskAssigned", { count: result.assigned_count || memberIds.length }));
      setForm({ event_id: String(selectedEventId), member_ids: [], title: "", description: "", due_date: "" });
      await loadData();
    } catch (err) {
      setError(err?.message || t("eventsTasks.errors.assignFailed"));
    } finally {
      setSaving(false);
    }
  };

  const submitEvent = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!eventForm.title.trim()) {
      setError(t("eventsTasks.messages.enterEventTitle"));
      return;
    }
    if (!eventForm.start_date) {
      setError(t("eventsTasks.messages.enterStartDate"));
      return;
    }
    if (eventForm.end_date && vietnamDateToIso(eventForm.end_date) < vietnamDateToIso(eventForm.start_date)) {
      setError(t("eventsTasks.messages.invalidDateRange"));
      return;
    }
    setSaving(true);
    try {
      const result = await createManagerEventAPI({
        title: eventForm.title.trim(),
        event_date: vietnamDateToIso(eventForm.start_date) || null,
        start_date: vietnamDateToIso(eventForm.start_date) || null,
        end_date: vietnamDateToIso(eventForm.end_date || eventForm.start_date) || null,
        description: eventForm.description.trim(),
        ...(isAdmin && clanId ? { clan_id: Number(clanId) } : {}),
      });
      const createdEventId = result?.event_id ? String(result.event_id) : "";
      setMessage(aiTaskSuggestions.length
        ? t("eventsTasks.messages.aiFilling")
        : t("eventsTasks.messages.eventCreated"));
      if (createdEventId) {
        setAiTaskSuggestions((prev) => prev.map((task) => ({ ...task, event_id: createdEventId })));
      }
      setEventForm({ title: "", start_date: "", end_date: "", description: "" });
      setShowCreateForm(false);
      await loadData();
      if (createdEventId) {
        setSelectedEventId(createdEventId);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setError(err?.message || t("eventsTasks.errors.createEventFailed"));
    } finally {
      setSaving(false);
    }
  };

  const saveEvent = async (event) => {
    event.preventDefault();
    if (!selectedEvent) return;
    setError("");
    setMessage("");
    if (!editEventForm.title.trim()) {
      setError(t("eventsTasks.messages.enterEventTitle"));
      return;
    }
    if (!editEventForm.start_date) {
      setError(t("eventsTasks.messages.enterStartDate"));
      return;
    }
    if (editEventForm.end_date && vietnamDateToIso(editEventForm.end_date) < vietnamDateToIso(editEventForm.start_date)) {
      setError(t("eventsTasks.messages.invalidDateRange"));
      return;
    }
    setSaving(true);
    try {
      await updateManagerEventAPI(selectedEvent.id, {
        title: editEventForm.title.trim(),
        event_date: vietnamDateToIso(editEventForm.start_date) || null,
        start_date: vietnamDateToIso(editEventForm.start_date) || null,
        end_date: vietnamDateToIso(editEventForm.end_date || editEventForm.start_date) || null,
        description: editEventForm.description.trim(),
        ...(isAdmin && clanId ? { clan_id: Number(clanId) } : {}),
      });
      setMessage(t("eventsTasks.messages.eventUpdated"));
      await loadData();
    } catch (err) {
      setError(err?.message || t("eventsTasks.errors.updateEventFailed"));
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (!selectedEvent) return;
    setConfirmDelete({ show: true, eventId: selectedEvent.id });
  };

  const updateTaskStatus = async (taskId, status) => {
    setSavingTaskId(taskId);
    setError("");
    setMessage("");
    try {
      await updateMemberTaskStatus(taskId, status);
      setMessage(status === "completed" ? t("eventsTasks.messages.completedSuccess") : t("eventsTasks.messages.statusUpdated"));
      await loadData();
    } catch (err) {
      setError(err?.message || t("eventsTasks.errors.updateStatusFailed"));
    } finally {
      setSavingTaskId(null);
    }
  };

  const getTodayInput = () => new Date().toISOString().slice(0, 10);

const clampAiTaskCount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(Math.round(parsed), 1), 20);
};

const normalizeAiTasks = (items = [], fallbackEventId = null, limit = null) => {
  const maxItems = limit ? clampAiTaskCount(limit) : null;
  const normalized = asArray(items)
    .map((item, index) => ({
      id: `ai-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      selected: true,
      event_id: item.event_id || fallbackEventId || null,
      member_account_ids: [],
      title: String(item.title || "").trim(),
      description: String(item.description || "").trim(),
      due_date: isoToVietnamDate(item.due_date),
      suggested_role: String(item.suggested_role || "").trim(),
      status: item.status || "assigned",
    }))
    .filter((item) => item.title);

  return maxItems ? normalized.slice(0, maxItems) : normalized;
};

const requestAiEventCreate = async (overridePrompt = "") => {
  const prompt = String(overridePrompt || aiPrompt).trim();

  if (!prompt || aiLoading) return;

  setError("");
  setMessage("");
  setAiLoading(true);

  try {
    const requestedCount = clampAiTaskCount(aiTaskCount);
    const result = await generateEventFormAI({
      mode: "event_create",
      prompt: `${prompt}. Hãy tạo đúng ${requestedCount} công việc chuẩn bị cho sự kiện.`,
      requested_task_count: requestedCount,
      today: getTodayInput(),
      clan_id: isAdmin && clanId ? Number(clanId) : undefined,
      current_event: null,
      existing_tasks: [],
    });

    if (result.status !== "success") {
      setError(t("eventsTasks.errors.aiNotSupported"));
      return;
    }

    const aiEvent = result.event || {};

    setEventForm({
      title: aiEvent.title || "",
      start_date: isoToVietnamDate(aiEvent.start_date || aiEvent.event_date),
        end_date: isoToVietnamDate(aiEvent.end_date || aiEvent.start_date || aiEvent.event_date),
      description: aiEvent.description || "",
    });

    setAiTaskSuggestions(normalizeAiTasks(result.manager_tasks, null, requestedCount));
    setShowCreateForm(true);
    setShowAiEventModal(false);
    setMessage(t("eventsTasks.messages.aiFilling"));
  } catch (err) {
    setError(err?.message || t("eventsTasks.errors.aiFailed"));
  } finally {
    setAiLoading(false);
  }
};

const requestAiTaskCreate = async () => {
  if (!selectedEvent || aiLoading) return;

  const prompt = aiPrompt.trim() || "Gợi ý thêm các công việc còn thiếu cho sự kiện này";

  setError("");
  setMessage("");
  setAiLoading(true);

  try {
    const requestedCount = clampAiTaskCount(aiTaskCount);
    const result = await generateEventFormAI({
      mode: "task_create",
      prompt: `${prompt}. Hãy gợi ý đúng ${requestedCount} công việc rõ ràng, có hạn chót phù hợp.`,
      requested_task_count: requestedCount,
      today: getTodayInput(),
      clan_id: selectedEvent.clan_id || (isAdmin && clanId ? Number(clanId) : undefined),
      current_event: {
        id: selectedEvent.id,
        title: selectedEvent.title,
        start_date: toDateInput(getEventStartDate(selectedEvent)),
        end_date: toDateInput(getEventEndDate(selectedEvent)),
        description: selectedEvent.description || "",
        clan_id: selectedEvent.clan_id || (isAdmin && clanId ? Number(clanId) : undefined),
      },
      existing_tasks: [
            ...selectedTasks.map((task) => ({
              id: task.task_id || task.id,
              event_id: task.event_id || selectedEvent.id,
              title: task.title,
              description: task.description,
              due_date: toDateInput(task.due_date),
              status: task.status,
              source: "assigned",
            })),
            ...aiTaskSuggestions.map((task) => ({
              id: task.id,
              event_id: task.event_id || selectedEvent.id,
              title: task.title,
              description: task.description,
              due_date: vietnamDateToIso(task.due_date) || null,
              status: task.status || "assigned",
              source: "ai_suggestion",
            })),
          ],
      });

    if (result.status !== "success") {
      setError(t("eventsTasks.errors.aiTaskNotSupported"));
      return;
    }

    setAiTaskSuggestions((prev) => [
        ...prev,
        ...normalizeAiTasks(result.manager_tasks, selectedEvent.id, requestedCount),
      ]);
    setMessage(t("eventsTasks.messages.aiSuggestionsReady"));
  } catch (err) {
    setError(err?.message || t("eventsTasks.errors.aiTaskFailed"));
  } finally {
    setAiLoading(false);
  }
};


const updateAiTaskSuggestion = (taskId, patch) => {
  setAiTaskSuggestions((prev) =>
    prev.map((task) =>
      task.id === taskId ? { ...task, ...patch } : task
    )
  );
};

const removeAiTaskSuggestion = (taskId) => {
  setAiTaskSuggestions((prev) => prev.filter((task) => task.id !== taskId));
};

const selectedAiTaskCount = aiTaskSuggestions.filter((task) => task.selected).length;
const aiTaskTotal = aiTaskSuggestions.length;
const currentAiTaskTarget = clampAiTaskCount(aiTaskCount);

const requestAiTasksForCreateForm = () => {
  const prompt = [
    aiPrompt.trim(),
    eventForm.title ? `Sự kiện: ${eventForm.title}` : "",
    eventForm.start_date ? `Ngày bắt đầu: ${eventForm.start_date}` : "",
    eventForm.end_date ? `Ngày kết thúc: ${eventForm.end_date}` : "",
    eventForm.description ? `Mô tả: ${eventForm.description}` : "",
    `Hãy gợi ý đúng ${clampAiTaskCount(aiTaskCount)} công việc cần chuẩn bị cho sự kiện này.`,
  ]
    .filter(Boolean)
    .join(". ");

  requestAiEventCreate(prompt);
};

const submitSingleAiTaskSuggestion = async (task) => {
  if (!selectedEvent) {
    setError(t("eventsTasks.messages.selectEventFirst"));
    return;
  }

  const title = String(task.title || "").trim();
  const description = String(task.description || "").trim();
  const dueDate = task.due_date || null;
  const memberIds = Array.isArray(task.member_account_ids)
    ? task.member_account_ids
        .map(Number)
        .filter((id) => Number.isFinite(id) && id > 0)
    : [];

  if (!task.selected) {
    setError(t("eventsTasks.messages.taskNotSelected"));
    return;
  }

  if (!title) {
    setError(t("eventsTasks.messages.enterTaskTitle"));
    return;
  }

  if (!description) {
    setError(t("eventsTasks.messages.enterDescription"));
    return;
  }

  if (!dueDate) {
    setError(t("eventsTasks.messages.enterDeadline"));
    return;
  }

  if (!memberIds.length) {
    setError(t("eventsTasks.messages.selectMemberFirst"));
    return;
  }

  setError("");
  setMessage("");
  setBulkAssigning(true);

  try {
    const result = await bulkAssignTasksAPI({
      event_id: Number(selectedEvent.id),
      ...(isAdmin && clanId ? { clan_id: Number(clanId) } : {}),
      tasks: [
        {
          title,
          description,
          due_date: vietnamDateToIso(dueDate) || null,
          member_account_ids: memberIds,
        },
      ],
    });

    setMessage(result?.message || t("eventsTasks.messages.taskAssignedOne", { title }));

    setAiTaskSuggestions((prev) =>
      prev.filter((item) => item.id !== task.id)
    );

    await loadData();
  } catch (err) {
    setError(err?.message || t("eventsTasks.errors.assignFailed"));
  } finally {
    setBulkAssigning(false);
  }
};

const submitSelectedAiTaskSuggestions = async () => {
  if (!selectedEvent) {
    setError(t("eventsTasks.errors.selectEventFirst"));
    return;
  }

  const selectedAiTasks = aiTaskSuggestions.filter((task) => task.selected);

  if (!selectedAiTasks.length) {
    setError(t("eventsTasks.messages.selectMemberFirst"));
    return;
  }

  const invalidTask = selectedAiTasks.find((task) => {
    const title = String(task.title || "").trim();
    const description = String(task.description || "").trim();
    const dueDate = task.due_date || null;
    const memberIds = Array.isArray(task.member_account_ids)
      ? task.member_account_ids
      : [];

    return !title || !description || !dueDate || !memberIds.length;
  });

  if (invalidTask) {
    setError(t("eventsTasks.messages.taskInfoIncomplete"));
    return;
  }

  setError("");
  setMessage("");
  setBulkAssigning(true);

  try {
    const result = await bulkAssignTasksAPI({
      event_id: Number(selectedEvent.id),
      ...(isAdmin && clanId ? { clan_id: Number(clanId) } : {}),
      tasks: selectedAiTasks.map((task) => ({
        title: String(task.title || "").trim(),
        description: String(task.description || "").trim(),
        due_date: vietnamDateToIso(task.due_date) || null,
        member_account_ids: task.member_account_ids.map(Number),
      })),
    });

    setMessage(result?.message || t("eventsTasks.messages.taskAssignedBulk", { count: selectedAiTasks.length }));
    setAiTaskSuggestions([]);
    await loadData();
  } catch (err) {
    setError(err?.message || t("eventsTasks.errors.assignFailed"));
  } finally {
    setBulkAssigning(false);
  }
};


const updateAssignedTask = async (task, draft) => {
  const taskId = Number(task?.task_id || task?.id);
  if (!Number.isFinite(taskId) || taskId <= 0) {
    setError(t("eventsTasks.messages.invalidTask"));
    return false;
  }

  const title = String(draft?.title || "").trim();
  const description = String(draft?.description || "").trim();
  const dueDate = draft?.due_date || null;

  if (!title) {
    setError(t("eventsTasks.messages.enterTaskTitle"));
    return false;
  }

  setSavingTaskId(taskId);
  setError("");
  setMessage("");
  try {
    const result = await updateAssignedTaskAPI(taskId, {
      title,
      description,
      due_date: vietnamDateToIso(dueDate) || null,
      ...(isAdmin && clanId ? { clan_id: Number(clanId) } : {}),
    });
    setMessage(result?.message || t("eventsTasks.messages.taskUpdated"));
    await loadData();
    return true;
  } catch (err) {
    setError(err?.message || t("eventsTasks.errors.updateTaskFailed"));
    return false;
  } finally {
    setSavingTaskId(null);
  }
};

const deleteAssignedTask = async (task) => {
  const taskId = Number(task?.task_id || task?.id);
  if (!Number.isFinite(taskId) || taskId <= 0) {
    setError(t("eventsTasks.messages.invalidTask"));
    return;
  }

  const ok = window.confirm(t("eventsTasks.messages.confirmDeleteTask", { title: task?.title || "" }));
  if (!ok) return;

  setSavingTaskId(taskId);
  setError("");
  setMessage("");
  try {
    const result = await deleteAssignedTaskAPI(taskId, {
      ...(isAdmin && clanId ? { clan_id: Number(clanId) } : {}),
    });
    setMessage(result?.message || t("eventsTasks.messages.taskDeleted"));
    await loadData();
  } catch (err) {
    setError(err?.message || t("eventsTasks.errors.deleteTaskFailed"));
  } finally {
    setSavingTaskId(null);
  }
};

const openEvent = (eventId) => {
  setSelectedEventId(String(eventId));
  setAiTaskSuggestions([]);
  setMessage("");
  setError("");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

  if (loading) {
    return (
      <section className="task-page">
        <div className="task-card task-empty">{t("common.loading")}</div>
      </section>
    );
  }

  if (isAdmin && !clanId) {
    return (
      <div className="task-page-admin">
        <header className="page-header">
          <h1>{t("eventsTasks.admin.title")}</h1>
        </header>

        <div className="clan-folder-grid">
          {clans.map((item) => (
            <div key={item.id} className="clan-folder-card" onClick={() => navigate(`/dashboard/tasks/clan/${item.id}`)}>
              <div className="folder-icon">
                <span className="material-symbols-outlined">folder_managed</span>
                <span className="count-badge">{item.task_count || 0}</span>
              </div>
              <div className="folder-info">
                <h3>{item.clan_name}</h3>
                <p>{item.owner_name || t("eventsTasks.placeholders.noManager")}</p>
              </div>
            </div>
          ))}
        </div>
        {!clans.length && (
            <div className="premium-dark-glass">
                <div className="empty-state">
                    <span className="material-symbols-outlined">event_busy</span>
                    <p>{t("eventsTasks.placeholders.noClanFound")}</p>
                </div>
            </div>
        )}

        {/* 🌟 Premium Glass Toast */}
        <div className={`premium-glass-toast ${toast.type} ${toast.show ? "show" : ""}`}>
            <div className="toast-content">
                <span className="material-symbols-outlined toast-icon">
                    {toast.type === "success" ? "check_circle" : "warning"}
                </span>
                <span className="toast-msg">{toast.message}</span>
            </div>
            <button onClick={() => setToast(prev => ({ ...prev, show: false }))} className="toast-close">
                <span className="material-symbols-outlined">close</span>
            </button>
        </div>
      </div>
    );
  }

  if (isMember) {
    return (
      <div className="task-page-admin">
        <header className="page-header">
          <h1>{t("eventsTasks.member.title")}</h1>
        </header>
        {message && <div className="task-alert is-success">{message}</div>}
        {error && <div className="task-alert is-error">{error}</div>}
        <div className="premium-dark-glass" style={{ marginBottom: '1.5rem' }}>
            <div className="task-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                <div className="task-stat"><span className="material-symbols-outlined">assignment</span><strong>{stats.total}</strong><small>{t("eventsTasks.stats.total")}</small></div>
                <div className="task-stat"><span className="material-symbols-outlined">pending_actions</span><strong>{stats.open}</strong><small>{t("eventsTasks.stats.open")}</small></div>
                <div className="task-stat"><span className="material-symbols-outlined">sync</span><strong>{stats.inProgress}</strong><small>{t("eventsTasks.stats.inProgressLabel")}</small></div>
                <div className="task-stat"><span className="material-symbols-outlined">task_alt</span><strong>{stats.completed}</strong><small>{t("eventsTasks.stats.completedLabel")}</small></div>
            </div>
        </div>

        {events.length > 0 && (
          <div className="manager-event-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {events.map((event) => {
              const myTaskCount = Number(event.my_task_count || 0);
              const myCompletedTaskCount = Number(event.my_completed_task_count || 0);
              const openTasks = Math.max(myTaskCount - myCompletedTaskCount, 0);
              const hasAssignedTasks = myTaskCount > 0;
              
              return (
                <button 
                  key={event.id} 
                  type="button" 
                  className={`manager-event-card clan-folder-card ${openTasks > 0 ? 'is-assigned-glow' : ''}`}
                  onClick={() => setSelectedEventId(event.id)}
                  style={{ width: '100%', minHeight: 'auto', padding: '1.5rem', textAlign: 'left', alignItems: 'flex-start' }}
                >
                  <div className="folder-icon" style={{ width: '60px', height: '60px', marginBottom: '1rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '2rem' }}>event_note</span>
                    {openTasks > 0 && <span className="count-badge" style={{ background: '#d4af37', border: 'none' }}>{openTasks}</span>}
                  </div>
                  <div className="folder-info" style={{ textAlign: 'left' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{event.title}</h3>
                    <p style={{ fontSize: '0.8rem' }}>{formatEventRange(event, t)}</p>
                    <span className={`status-badge ${event.status === 'ongoing' ? 'approved' : 'pending'}`} style={{ marginTop: '0.5rem', scale: '0.8', originX: 0 }}>
                        {eventStatusLabel(event.status, t)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selectedEventId && (
          <div className="task-modal-backdrop" role="presentation" onMouseDown={() => setSelectedEventId("")}>
            <div className="task-modal-card member-tasks-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
              <div className="task-modal-head">
                <div className="task-card-title">
                  <span className="material-symbols-outlined">assignment</span>
                  <h2>{selectedEvent ? selectedEvent.title : t("eventsTasks.placeholders.eventTasks")}</h2>
                </div>
                <button className="task-icon-btn" type="button" onClick={() => setSelectedEventId("")} aria-label={t("common.close")}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="member-tasks-modal-body">
                <TaskList tasks={selectedTasks} isMember savingTaskId={savingTaskId} onUpdateStatus={updateTaskStatus} />
              </div>
            </div>
          </div>
        )}

        {!events.length && (
          <TaskList tasks={tasks} isMember savingTaskId={savingTaskId} onUpdateStatus={updateTaskStatus} />
        )}
      </div>
    );
  }

  if (selectedEvent) {
    return (
      <div className="task-page-admin">
        <header className="page-header">
            <div className="breadcrumb-nav">
                <button type="button" className="breadcrumb-link" onClick={returnToEventList}>
                  {eventListLabel}
                </button>
                <span className="separator">/</span>
                <span className="active">{selectedEvent.title}</span>
            </div>
            <h1>{selectedEvent.title}</h1>
        </header>

        <div className="event-action-strip premium-dark-glass" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem' }}>
          <div>
            <strong style={{ color: '#d4af37', fontSize: '1.1rem', display: 'block' }}>{t("eventsTasks.actions.manageEvent")}</strong>
            <small style={{ color: '#4a160f' }}>{t("eventsTasks.placeholders.manageEventHelp")}</small>
          </div>
          <div className="event-action-buttons">
            <button className="task-btn task-btn-primary" type="button" onClick={requestAiTaskCreate} disabled={aiLoading}>
              <span className="material-symbols-outlined">auto_awesome</span>
              {aiLoading ? t("eventsTasks.actions.aiGenerating") : t("eventsTasks.actions.aiGenerate")}
            </button>
            <button className="task-btn task-btn-ghost" type="button" onClick={() => setShowAssignTaskModal(true)}>
              <span className="material-symbols-outlined">assignment_add</span>
              {t("eventsTasks.actions.createTask")}
            </button>
            <button className="task-btn task-btn-ghost" type="button" onClick={() => setShowEditEventModal(true)}>
              <span className="material-symbols-outlined">edit_calendar</span>
              {t("eventsTasks.actions.editEvent")}
            </button>
          </div>
        </div>

        <div className="event-detail-summary premium-dark-glass" style={{ marginBottom: '1.5rem', display: 'flex', gap: '2rem', padding: '1rem 1.5rem' }}>
          <span><span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '8px', color: '#d4af37' }}>calendar_month</span> {t("eventsTasks.form.time")}: <strong>{formatEventRange(selectedEvent, t)}</strong></span>
          <span><span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '8px', color: '#d4af37' }}>assignment</span> {t("eventsTasks.status.assigned")}: <strong>{t("eventsTasks.stats.totalTasks", { count: selectedTasks.length })}</strong></span>
          <span><span className="material-symbols-outlined" style={{ verticalAlign: 'middle', marginRight: '8px', color: '#d4af37' }}>auto_awesome</span> {t("eventsTasks.placeholders.aiPending")}: <strong>{t("eventsTasks.stats.aiSuggestions", { count: aiTaskTotal })}</strong></span>
        </div>

        <div className="event-workspace-grid">
          <section className="premium-dark-glass ai-task-panel event-ai-panel" style={{ padding: '1.5rem' }}>
            <div className="ai-task-panel-head">
              <div>
                <span className="task-section-kicker" style={{ color: '#d4af37', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase' }}>{t("eventsTasks.placeholders.aiSuggestions")}</span>
                <h3 style={{ color: '#fff6dc', margin: '0.5rem 0' }}>{t("eventsTasks.placeholders.aiTasksGenerated")}</h3>
                <p style={{ color: '#4a160f', fontSize: '0.9rem' }}>{t("eventsTasks.placeholders.aiTasksHelp")}</p>
                <div className="ai-count-notice" style={{ background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '12px', padding: '12px', marginTop: '1rem' }}>
                  <div className="ai-count-notice-icon" style={{ color: '#d4af37' }}>
                    <span className="material-symbols-outlined">info</span>
                  </div>
                  <div className="ai-count-notice-body">
                    <strong style={{ color: '#fff6dc' }}>{t("eventsTasks.placeholders.aiStatus")}</strong>
                    <div className="ai-count-notice-grid">
                      <span><b style={{ color: '#d4af37' }}>{currentAiTaskTarget}</b> {t("eventsTasks.placeholders.requested")}</span>
                      <span><b style={{ color: '#d4af37' }}>{aiTaskTotal}</b> {t("eventsTasks.placeholders.generated")}</span>
                      <span><b style={{ color: '#d4af37' }}>{selectedAiTaskCount}</b>/{aiTaskTotal || currentAiTaskTarget} {t("eventsTasks.placeholders.selected")}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ai-task-head-actions">
                <label className="ai-count-control">
                  <span style={{ color: '#4a160f' }}>{t("eventsTasks.placeholders.aiTaskCount")}</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={aiTaskCount}
                    onChange={handleAiTaskCountChange}
                    style={{ background: '#fff', border: '1px solid #d7c6aa', color: '#111827' }}
                  />
                  <small style={{ color: 'rgba(255,255,255,0.4)' }}>{t("eventsTasks.placeholders.aiMaxNotice")}</small>
                </label>
              </div>
            </div>

            <div className="ai-inline-prompt" style={{ marginTop: '1.5rem', display: 'flex', gap: '10px' }}>
              <div className="ai-prompt-input-wrap" style={{ flex: 1, position: 'relative' }}>
                <input
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  placeholder={t("eventsTasks.placeholders.aiPromptHint")}
                  disabled={aiLoading}
                  style={{ width: '100%', background: '#fff', border: '1px solid #d7c6aa', borderRadius: '12px', padding: '12px 45px 12px 12px', color: '#111827' }}
                />
                <button
                  className={`ai-voice-btn ${voiceListening ? "is-listening" : ""}`}
                  type="button"
                  onClick={toggleAiPromptVoiceInput}
                  disabled={aiLoading}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: voiceListening ? '#ef4444' : '#d4af37' }}
                >
                  <span className="material-symbols-outlined">{voiceListening ? "mic_off" : "mic"}</span>
                </button>
              </div>
              <button className="task-btn task-btn-ghost" type="button" onClick={requestAiTaskCreate} disabled={aiLoading}>
                <span className="material-symbols-outlined">auto_awesome</span>
                {t("common.createMore")}
              </button>
              <VoiceRecorder disabled={aiLoading} onTranscript={appendAiPromptText} />
            </div>

            {aiTaskSuggestions.length ? (
              <div className="ai-task-grid ai-task-grid-compact" style={{ marginTop: '1.5rem' }}>
                {aiTaskSuggestions.map((task) => {
                  const titleOk = Boolean(String(task.title || "").trim());
                  const descriptionOk = Boolean(String(task.description || "").trim());
                  const dueDateOk = Boolean(task.due_date);
                  const assigneeOk = Array.isArray(task.member_account_ids) && task.member_account_ids.length > 0;
                  const canSend = task.selected && titleOk && descriptionOk && dueDateOk && assigneeOk && !bulkAssigning;

                  return (
                    <article className="ai-task-card ai-task-card-compact" key={task.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '1rem', marginBottom: '1rem' }}>
                      <div className="ai-task-card-top" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <label className="ai-task-check" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(task.selected)}
                            onChange={(event) => updateAiTaskSuggestion(task.id, { selected: event.target.checked })}
                          />
                          <span style={{ color: '#4a160f', fontSize: '0.9rem' }}>{t("common.select")}</span>
                        </label>

                        <div className="ai-task-top-actions" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <span className={canSend ? "ai-task-valid is-ok" : "ai-task-valid is-warning"} style={{ fontSize: '0.8rem', color: canSend ? '#4ade80' : '#fbbf24' }}>
                            {canSend ? t("eventsTasks.placeholders.infoComplete") : t("eventsTasks.placeholders.infoIncomplete")}
                          </span>
                          <button className="task-icon-btn is-danger" type="button" onClick={() => removeAiTaskSuggestion(task.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', width: '32px', height: '32px', borderRadius: '8px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>delete</span>
                          </button>
                        </div>
                      </div>

                      <div className="ai-task-fields ai-task-fields-compact" style={{ display: 'grid', gap: '12px' }}>
                        <label className={!titleOk ? "field-invalid" : ""}>
                          <span style={{ display: 'block', color: '#4a160f', fontSize: '0.8rem', marginBottom: '4px' }}>{t("eventsTasks.form.title")}</span>
                          <input
                            value={task.title}
                            onChange={(event) => updateAiTaskSuggestion(task.id, { title: event.target.value })}
                            placeholder={t("eventsTasks.placeholders.enterTaskTitle")}
                            style={{ width: '100%', background: '#fff', border: '1px solid #d7c6aa', borderRadius: '8px', padding: '8px', color: '#111827' }}
                          />
                        </label>

                        <label className={!dueDateOk ? "field-invalid" : ""}>
                          <span style={{ display: 'block', color: '#4a160f', fontSize: '0.8rem', marginBottom: '4px' }}>{t("eventsTasks.form.deadline")}</span>
                          <DateInput
                            value={task.due_date || ""}
                            onChange={(event) => updateAiTaskSuggestion(task.id, { due_date: event.target.value })}
                          />
                        </label>

                        <label className={!descriptionOk ? "field-invalid" : "ai-task-desc"}>
                          <span style={{ display: 'block', color: '#4a160f', fontSize: '0.8rem', marginBottom: '4px' }}>{t("eventsTasks.form.description")}</span>
                          <textarea
                            rows={2}
                            value={task.description}
                            onChange={(event) => updateAiTaskSuggestion(task.id, { description: event.target.value })}
                            placeholder={t("eventsTasks.placeholders.enterDescription")}
                            style={{ width: '100%', background: '#fff', border: '1px solid #d7c6aa', borderRadius: '8px', padding: '8px', color: '#111827', resize: 'vertical' }}
                          />
                        </label>

                        <div className={!assigneeOk ? "task-field field-invalid" : "task-field"}>
                          <span style={{ display: 'block', color: '#4a160f', fontSize: '0.8rem', marginBottom: '4px' }}>{t("eventsTasks.form.assignee")}</span>
                          <MemberCombobox
                            members={members}
                            value={task.member_account_ids || []}
                            disabled={bulkAssigning || !members.length}
                            onChange={(memberIds) => updateAiTaskSuggestion(task.id, { member_account_ids: memberIds })}
                          />
                        </div>

                        {task.suggested_role && (
                          <div className="ai-task-role" style={{ fontSize: '0.8rem', color: '#d4af37', background: 'rgba(212, 175, 55, 0.1)', padding: '6px 10px', borderRadius: '8px' }}>
                            {t("eventsTasks.placeholders.suggestion")}: <strong>{task.suggested_role}</strong>
                          </div>
                        )}
                      </div>

                      <div className="ai-task-card-actions" style={{ marginTop: '1rem' }}>
                        <button className="task-btn task-btn-primary" type="button" onClick={() => submitSingleAiTaskSuggestion(task)} disabled={!canSend} style={{ width: '100%' }}>
                          <span className="material-symbols-outlined">send</span>
                          {t("eventsTasks.actions.sendThisTask")}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="task-empty ai-empty" style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>{t("eventsTasks.placeholders.noAiTasks")}</div>
            )}
          </section>

          <div className="event-assigned-column">
            <TaskList title={t("eventsTasks.placeholders.eventTasksTitle")} tasks={selectedTasks} canManage onUpdateTask={updateAssignedTask} onDeleteTask={deleteAssignedTask} savingTaskId={savingTaskId} />
          </div>
        </div>

        {showEditEventModal && (
          <div className="task-modal-backdrop" role="presentation" onMouseDown={() => setShowEditEventModal(false)}>
            <form className="task-modal-card task-form event-edit-card" onSubmit={saveEvent} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <div className="task-modal-head">
                <div className="task-card-title">
                  <span className="material-symbols-outlined">edit_calendar</span>
                  <h2>{t("eventsTasks.actions.editEvent")}</h2>
                </div>
                <button className="task-icon-btn" type="button" onClick={() => setShowEditEventModal(false)} aria-label={t("common.close")}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <label>
                <span>{t("eventsTasks.form.eventName")}</span>
                <input value={editEventForm.title} onChange={(event) => setEditEventForm((prev) => ({ ...prev, title: event.target.value }))} />
              </label>
              <label>
                <span>{t("eventsTasks.form.startDate")}</span>
                <DateInput value={editEventForm.start_date} onChange={(event) => setEditEventForm((prev) => ({ ...prev, start_date: event.target.value }))} />
              </label>
              <label>
                <span>{t("eventsTasks.form.endDate")}</span>
                <DateInput value={editEventForm.end_date} onChange={(event) => setEditEventForm((prev) => ({ ...prev, end_date: event.target.value }))} />
              </label>
              <label>
                <span>{t("common.status.title")}</span>
                <div className={`event-status-pill ${eventStatusClass(selectedEvent.status)}`}>{eventStatusLabel(selectedEvent.status, t)}</div>
              </label>
              <label>
                <span>{t("eventsTasks.form.description")}</span>
                <textarea value={editEventForm.description} onChange={(event) => setEditEventForm((prev) => ({ ...prev, description: event.target.value }))} rows={5} placeholder={t("eventsTasks.placeholders.enterEventDescription")} />
              </label>
              <div className="task-form-actions task-modal-actions">
                <button className="task-btn task-btn-primary" type="submit" disabled={saving}>
                  <span className="material-symbols-outlined">save</span>
                  {t("common.saveChanges")}
                </button>
                <button className="task-btn task-btn-danger" type="button" onClick={deleteEvent} disabled={saving}>
                  <span className="material-symbols-outlined">delete</span>
                  {t("eventsTasks.actions.deleteEvent")}
                </button>
              </div>
            </form>
          </div>
        )}

        {showAssignTaskModal && (
          <div className="task-modal-backdrop" role="presentation" onMouseDown={() => setShowAssignTaskModal(false)}>
            <form className="task-modal-card task-form event-assign-card" onSubmit={submitTask} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <div className="task-modal-head">
                <div className="task-card-title">
                  <span className="material-symbols-outlined">assignment_add</span>
                  <h2>{t("eventsTasks.actions.createTask")}</h2>
                </div>
                <button className="task-icon-btn" type="button" onClick={() => setShowAssignTaskModal(false)} aria-label={t("common.close")}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="selected-event-banner">
                <span className="material-symbols-outlined">event</span>
                <div>
                  <strong>{selectedEvent.title}</strong>
                  <small>{t("eventsTasks.placeholders.assignTaskHelp")}</small>
                </div>
              </div>
              <div className="task-field">
                <span>{t("eventsTasks.form.assignee")}</span>
                <MemberCombobox members={members} value={form.member_ids} disabled={saving || !members.length} onChange={(memberIds) => setForm((prev) => ({ ...prev, member_ids: memberIds }))} />
              </div>
              <label>
                <span>{t("eventsTasks.form.taskName")}</span>
                <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder={t("eventsTasks.placeholders.taskTitleExample")} />
              </label>
              <label>
                <span>{t("eventsTasks.form.description")}</span>
                <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={4} placeholder={t("eventsTasks.placeholders.enterDescription")} />
              </label>
              <label>
                <span>{t("eventsTasks.form.deadline")}</span>
                <DateInput value={form.due_date} onChange={(event) => setForm((prev) => ({ ...prev, due_date: event.target.value }))} />
              </label>
              <div className="task-form-actions task-modal-actions">
                <button className="task-btn task-btn-primary" type="submit" disabled={saving || !members.length}>
                  <span className="material-symbols-outlined">send</span>
                  {saving ? t("common.saving") : t("eventsTasks.actions.createTask")}
                </button>
              </div>
              {!members.length && <p className="task-note">{t("eventsTasks.placeholders.noActiveMembers")}</p>}
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="task-page-admin">
      <header className="page-header">
        {isAdmin && (
          <div className="breadcrumb-nav">
            <Link to="/dashboard/tasks">{t("eventsTasks.admin.title")}</Link>
            <span className="separator">/</span>
            <span className="active">{clan?.clan_name || t("eventsTasks.placeholders.clanDetail")}</span>
          </div>
        )}
        <h1>{isAdmin ? t("eventsTasks.admin.clanTasks", { clanName: clan?.clan_name || "" }) : t("eventsTasks.manager.title")}</h1>
      </header>

      <div className="event-toolbar event-toolbar-compact premium-dark-glass" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div className="event-search event-search-compact">
          <span className="material-symbols-outlined">search</span>
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t("eventsTasks.placeholders.searchEvents")} />
        </div>
        <div className="event-toolbar-actions">
          <button className="task-btn task-btn-ghost" type="button" onClick={() => setShowAiEventModal(true)}>
            <span className="material-symbols-outlined">auto_awesome</span>
            {t("eventsTasks.actions.aiFillForm")}
          </button>
          <button className="task-btn task-btn-ghost" type="button" onClick={() => setShowArchive(true)}>
            <span className="material-symbols-outlined">inventory_2</span>
            {t("eventsTasks.actions.archive")} ({archivedEvents.length})
          </button>
          <button className="task-btn task-btn-primary" type="button" onClick={() => { setAiTaskSuggestions([]); setShowCreateForm(true); }}>
            <span className="material-symbols-outlined">add</span>
            {t("eventsTasks.actions.addEvent")}
          </button>
        </div>
      </div>

      <div className="premium-dark-glass">
        {activeFilteredEvents.length === 0 ? (
          <div className="empty-state">
            <span className="material-symbols-outlined">event_busy</span>
            <p>{events.length ? t("eventsTasks.placeholders.noActiveEventFound") : t("eventsTasks.placeholders.noEventFound")}</p>
          </div>
        ) : (
          <table className="premium-table">
            <thead>
              <tr>
                <th>{t("eventsTasks.form.eventName") || "Tên sự kiện"}</th>
                <th>{t("eventsTasks.form.time") || "Thời gian"}</th>
                <th>{t("eventsTasks.form.description") || "Mô tả"}</th>
                <th>{t("common.status.title")}</th>
                <th>{t("eventsTasks.stats.totalTasksLabel") || "Công việc"}</th>
              </tr>
            </thead>
            <tbody>
              {activeFilteredEvents.map((event) => {
                const assignmentCount = Number(event.assignment_count || 0);
                const completedCount = Number(event.completed_assignment_count || 0);
                const openCount = Math.max(assignmentCount - completedCount, 0);
                
                return (
                  <tr key={event.id} onClick={() => openEvent(event.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="author-cell">
                        <div className="author-avatar"><span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>event</span></div>
                        <span>{event.title}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{formatEventRange(event, t)}</td>
                    <td>
                      <div className="post-preview">
                        <p>{event.description || t("eventsTasks.placeholders.noDescription")}</p>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${event.status === 'ended' ? 'rejected' : event.status === 'ongoing' ? 'approved' : 'pending'}`}>
                        {eventStatusLabel(event.status, t)}
                      </span>
                    </td>
                    <td>
                        <div className="metric-badges">
                            <span className="metric-badge open" title={t("eventsTasks.stats.openTasks", { count: openCount })}>
                                <strong>{openCount}</strong> <small>Open</small>
                            </span>
                            <span className="metric-badge done" title={t("eventsTasks.stats.completed", { count: completedCount })}>
                                <strong>{completedCount}</strong> <small>Done</small>
                            </span>
                        </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals & Feedback (Keep existing modal logic but wrapped in premium styles if needed) */}
      {/* ...existing modal JSX remains same for now as they are already complex... */}

      {/* 🌟 Premium Glass Toast */}
      <div className={`premium-glass-toast ${toast.type} ${toast.show ? "show" : ""}`}>
          <div className="toast-content">
              <span className="material-symbols-outlined toast-icon">
                  {toast.type === "success" ? "check_circle" : "warning"}
              </span>
              <span className="toast-msg">{toast.message}</span>
          </div>
          <button onClick={() => setToast(prev => ({ ...prev, show: false }))} className="toast-close">
              <span className="material-symbols-outlined">close</span>
          </button>
      </div>

      {/* 🌟 Premium Glass Confirm Dialog */}
      {confirmDelete.show && (
          <div className="premium-confirm-overlay">
              <div className="premium-confirm-modal">
                  <div className="modal-warning-icon">
                      <span className="material-symbols-outlined">warning</span>
                  </div>
                  <h2>{t("eventsTasks.messages.confirmDeleteEventTitle") || "Xóa sự kiện?"}</h2>
                  <p>{t("eventsTasks.messages.confirmDeleteEventSubtitle") || "Hành động này không thể hoàn tác. Tất cả công việc liên quan sẽ bị ảnh hưởng."}</p>
                  <div className="modal-buttons">
                      <button className="modal-btn-cancel" onClick={() => setConfirmDelete({ show: false, eventId: null })}>
                          {t("common.cancel")}
                      </button>
                      <button className="modal-btn-danger" onClick={async () => {
                          const id = confirmDelete.eventId;
                          setConfirmDelete({ show: false, eventId: null });
                          try {
                              await deleteManagerEventAPI(id, isAdmin && clanId ? { clan_id: Number(clanId) } : {});
                              setToast({ show: true, message: t("eventsTasks.messages.eventDeleted"), type: "success" });
                              setSelectedEventId("");
                              loadData();
                          } catch (err) {
                              setToast({ show: true, message: err.message, type: "error" });
                          }
                      }}>
                          {t("common.delete")}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Existing Modals */}
      {showAiEventModal && (
        <div className="task-modal-backdrop" role="presentation" onMouseDown={() => setShowAiEventModal(false)}>
          <div className="task-modal-card ai-event-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="task-modal-head">
              <div className="task-card-title">
                <span className="material-symbols-outlined">auto_awesome</span>
                <div>
                  <h2>{t("eventsTasks.actions.aiCreateTitle")}</h2>
                  <p>{t("eventsTasks.placeholders.aiCreateHelp")}</p>
                </div>
              </div>
              <button className="task-icon-btn" type="button" onClick={() => setShowAiEventModal(false)} aria-label={t("eventsTasks.actions.closeAi")}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <label className="ai-modal-field">
              <span>{t("eventsTasks.placeholders.aiPromptLabel")}</span>
              <div className="ai-prompt-input-wrap ai-prompt-input-wrap-textarea">
                <textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  rows={4}
                  placeholder={t("eventsTasks.placeholders.aiPromptCreateExample")}
                  disabled={aiLoading}
                />
                <button
                  className={`ai-voice-btn ${voiceListening ? "is-listening" : ""}`}
                  type="button"
                  onClick={toggleAiPromptVoiceInput}
                  disabled={aiLoading}
                  aria-label={voiceListening ? t("common.stopVoice") : t("common.startVoice")}
                  title={speechSupported ? t("common.startVoice") : t("common.speechUnsupported")}
                >
                  <span className="material-symbols-outlined">{voiceListening ? "mic_off" : "mic"}</span>
                </button>
              </div>
              <VoiceRecorder disabled={aiLoading} onTranscript={appendAiPromptText} />
              {voiceListening && <small className="ai-voice-status">{t("eventsTasks.placeholders.listening")}</small>}
            </label>
            <label className="ai-count-control ai-count-control-wide">
              <span>{t("eventsTasks.placeholders.aiTaskCountLabel")}</span>
              <input
                type="number"
                min="1"
                max="20"
                value={aiTaskCount}
                onChange={handleAiTaskCountChange}
              />
              <small>{t("eventsTasks.placeholders.aiMaxNotice")}</small>
            </label>
            <div className="task-form-actions task-modal-actions">
              <button className="task-btn task-btn-primary" type="button" onClick={() => requestAiEventCreate()} disabled={aiLoading || !aiPrompt.trim()}>
                <span className="material-symbols-outlined">auto_awesome</span>
                {aiLoading ? t("eventsTasks.actions.aiGenerating") : t("eventsTasks.actions.aiFillForm")}
              </button>
              <button className="task-btn task-btn-ghost" type="button" onClick={() => setShowAiEventModal(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showArchive && (
        <div className="task-modal-backdrop" role="presentation" onMouseDown={() => setShowArchive(false)}>
          <div className="task-modal-card archive-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="task-modal-head">
              <div className="task-card-title">
                <span className="material-symbols-outlined">inventory_2</span>
                <div>
                  <h2>{t("eventsTasks.placeholders.archiveTitle")}</h2>
                  <p>{t("eventsTasks.placeholders.archiveHelp")}</p>
                </div>
              </div>
              <button className="task-icon-btn" type="button" onClick={() => setShowArchive(false)} aria-label={t("eventsTasks.actions.closeArchive")}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="event-search archive-search">
              <span className="material-symbols-outlined">search</span>
              <input value={archiveSearch} onChange={(event) => setArchiveSearch(event.target.value)} placeholder={t("eventsTasks.placeholders.searchArchive")} />
            </div>
            <div className="archive-event-list">
              {filteredArchivedEvents.map((event) => (
                <article className="archive-event-item" key={event.id}>
                  <span className="manager-event-icon material-symbols-outlined">event_available</span>
                  <div>
                    <strong>{event.title}</strong>
                    <small>{formatEventRange(event, t)}</small>
                    {event.description && <p>{event.description}</p>}
                  </div>
                  <div className="archive-event-actions">
                    <span className={`event-status-pill ${eventStatusClass(event.status)}`}>{eventStatusLabel(event.status, t)}</span>
                    <button
                      className="task-btn task-btn-ghost archive-view-btn"
                      type="button"
                      onClick={() => { setShowArchive(false); openEvent(event.id); }}
                    >
                      <span className="material-symbols-outlined">visibility</span>
                      {t("eventsTasks.actions.viewEvent")}
                    </button>
                  </div>
                </article>
              ))}
              {!filteredArchivedEvents.length && <div className="task-empty">{t("eventsTasks.placeholders.noArchivedFound")}</div>}
            </div>
          </div>
        </div>
      )}

      {showCreateForm && (
        <div className="task-modal-backdrop" role="presentation" onMouseDown={() => setShowCreateForm(false)}>
          <form
            className="task-modal-card quick-event-form"
            onSubmit={submitEvent}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-event-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="task-modal-head">
              <div className="task-card-title">
                <span className="material-symbols-outlined">event_upcoming</span>
                <div>
                  <h2 id="create-event-title">{t("eventsTasks.actions.addEvent")}</h2>
                  <p>{t("eventsTasks.placeholders.addEventHelp")}</p>
                </div>
              </div>
              <button className="task-icon-btn" type="button" onClick={() => setShowCreateForm(false)} aria-label={t("eventsTasks.actions.closeAdd")}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <label>
              <span>{t("eventsTasks.form.eventName")}</span>
              <input
                value={eventForm.title}
                onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder={t("eventsTasks.placeholders.eventTitleExample")}
                autoFocus
              />
            </label>
            <label>
              <span>{t("eventsTasks.form.startDate")}</span>
              <DateInput value={eventForm.start_date} onChange={(event) => setEventForm((prev) => ({ ...prev, start_date: event.target.value }))} />
            </label>
            <label>
              <span>{t("eventsTasks.form.endDate")}</span>
              <DateInput value={eventForm.end_date} onChange={(event) => setEventForm((prev) => ({ ...prev, end_date: event.target.value }))} />
            </label>
            <label>
              <span>{t("eventsTasks.form.descriptionShort")}</span>
              <textarea value={eventForm.description} onChange={(event) => setEventForm((prev) => ({ ...prev, description: event.target.value }))} rows={4} placeholder={t("eventsTasks.placeholders.eventDescriptionHint")} />
            </label>

            <div className="task-form-actions task-modal-actions">
              <button className="task-btn task-btn-primary" type="submit" disabled={saving}>
                <span className="material-symbols-outlined">add</span>
                {saving ? t("common.saving") : t("eventsTasks.actions.saveEvent")}
              </button>
              <button className="task-btn task-btn-ghost" type="button" onClick={() => setShowCreateForm(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function TaskList({
  title,
  tasks,
  isMember = false,
  canManage = false,
  savingTaskId = null,
  onUpdateStatus = () => {},
  onUpdateTask = async () => false,
  onDeleteTask = () => {},
}) {
  const { t } = useTranslation();
  const displayTitle = title || t("eventsTasks.placeholders.assignmentHistory");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [draft, setDraft] = useState({ title: "", description: "", due_date: "" });

  const beginEdit = (task) => {
    const id = task.task_id || task.id;
    setEditingTaskId(id);
    setDraft({
      title: task.title || "",
      description: task.description || "",
      due_date: toDateInput(task.due_date),
    });
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
    setDraft({ title: "", description: "", due_date: "" });
  };

  const saveEdit = async (task) => {
    const ok = await onUpdateTask(task, draft);
    if (ok !== false) cancelEdit();
  };

  return (
    <div className="task-card task-history-card">
      <div className="task-card-title">
        <span className="material-symbols-outlined">view_list</span>
        <h2>{displayTitle}</h2>
      </div>
      <div className="task-list">
        {tasks.map((task) => {
          const taskKey = task.task_id || task.id;
          const isEditing = String(editingTaskId || "") === String(taskKey);
          const isBusy = savingTaskId === taskKey || savingTaskId === task.id;

          return (
            <article className={`task-item assigned-task-item ${canManage ? "is-manageable" : ""}`} key={task.id}>
              <div className="task-item-main">
                {isEditing ? (
                  <div className="assigned-task-edit-form">
                    <label>
                      <span>{t("eventsTasks.form.title")}</span>
                      <input
                        value={draft.title}
                        onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder={t("eventsTasks.placeholders.enterTaskTitle")}
                      />
                    </label>
                    <label>
                      <span>{t("eventsTasks.form.description")}</span>
                      <textarea
                        rows={3}
                        value={draft.description}
                        onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                        placeholder={t("eventsTasks.placeholders.enterDescription")}
                      />
                    </label>
                    <label>
                      <span>{t("eventsTasks.form.deadline")}</span>
                      <DateInput
                        value={draft.due_date}
                        onChange={(event) => setDraft((current) => ({ ...current, due_date: event.target.value }))}
                      />
                    </label>
                    <div className="assigned-task-edit-actions">
                      <button className="task-btn task-btn-primary" type="button" disabled={isBusy} onClick={() => saveEdit(task)}>
                        <span className="material-symbols-outlined">save</span>
                        {t("common.saveChanges")}
                      </button>
                      <button className="task-btn task-btn-ghost" type="button" disabled={isBusy} onClick={cancelEdit}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="task-item-head">
                      <h3>{task.title}</h3>
                      <span className={`task-status status-${task.status}`}>{t(STATUS_LABELS[task.status] || task.status)}</span>
                    </div>
                    {task.description && <p>{task.description}</p>}
                    <div className="task-meta">
                      {!isMember && <span>{t("eventsTasks.form.assignee")}: {fullName(task)}</span>}
                      <span>{t("eventsTasks.form.event")}: {task.event_title || t("eventsTasks.placeholders.noEventLinked")}</span>
                      <span>{t("eventsTasks.form.manager")}: {task.manager_name || "Manager"}</span>
                      <span>{t("eventsTasks.form.deadlineShort")}: {formatDate(task.due_date, false, t)}</span>
                      <span>{t("eventsTasks.form.assignedAt")}: {formatDate(task.assigned_at || task.created_at, true, t)}</span>
                      {task.completed_at && <span>{t("eventsTasks.form.completedAt")}: {formatDate(task.completed_at, true, t)}</span>}
                    </div>
                  </>
                )}
              </div>

              {canManage && !isEditing && (
                <div className="assigned-task-hover-actions" aria-label={t("eventsTasks.actions.taskActions")}>
                  <button
                    className="task-icon-btn"
                    type="button"
                    disabled={isBusy}
                    onClick={() => beginEdit(task)}
                    title={t("common.edit")}
                    aria-label={t("common.edit")}
                  >
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button
                    className="task-icon-btn is-danger"
                    type="button"
                    disabled={isBusy}
                    onClick={() => onDeleteTask(task)}
                    title={t("common.delete")}
                    aria-label={t("common.delete")}
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              )}

              {isMember && task.status !== "completed" && (
                <div className="task-actions">
                  <button className="task-btn task-btn-ghost" type="button" disabled={savingTaskId === task.id || task.status === "in_progress"} onClick={() => onUpdateStatus(task.id, "in_progress")}>
                    {t("eventsTasks.status.in_progress")}
                  </button>
                  <button className="task-btn task-btn-primary" type="button" disabled={savingTaskId === task.id} onClick={() => onUpdateStatus(task.id, "completed")}>
                    {t("eventsTasks.status.completed")}
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!tasks.length && <div className="task-empty">{t("eventsTasks.placeholders.noTasks")}</div>}
      </div>
    </div>
  );
}
