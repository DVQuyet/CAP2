import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getStoredUser } from "../../../shared/utils/auth";
import { getMeContext, getMeContextPeople, setCurrentPerson } from "../../../api/chatbotService";
import ChatWindow from "./ChatWindow";
import "./AIChat.css";

const AIChatGateway = () => {
  const { t } = useTranslation();
  const launcherRef = useRef(null);
  const wasOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState("");
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const user = useMemo(() => getStoredUser() || {}, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setContextLoading(true);
    setContextError("");
    getMeContext()
      .then(async (data) => {
        if (cancelled) return;
        const nextContext = {
          accountId: data.accountId || user.account_id || user.id || null,
          clanId: data.clanId || null,
          clanName: data.clanName || "",
          currentMemberId: data.currentMemberId || null,
          currentMemberName: data.currentMemberName || "",
          needsPersonSelection: Boolean(data.needsPersonSelection),
        };
        setContext(nextContext);
        if (nextContext.clanId && !nextContext.currentMemberId) {
          setPeopleLoading(true);
          try {
            const peopleData = await getMeContextPeople({ limit: 120 });
            if (!cancelled) setPeople(peopleData.people || []);
          } finally {
            if (!cancelled) setPeopleLoading(false);
          }
        }
      })
      .catch((error) => {
        if (!cancelled) setContextError(error?.message || t("aiChat.contextError"));
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user.account_id, user.id, t]);

  // Đóng cửa sổ (Esc / nút đóng): trả focus về nút mở.
  useEffect(() => {
    if (wasOpenRef.current && !open) launcherRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  const handleBindPerson = async (person) => {
    if (!person?.id || !context?.clanId) return;
    const data = await setCurrentPerson({
      personId: person.id,
      clanId: context.clanId,
    });
    setContext((prev) => ({
      ...(prev || {}),
      accountId: data.accountId || prev?.accountId || user.account_id || user.id || null,
      clanId: data.clanId || prev?.clanId || null,
      currentMemberId: data.currentMemberId || person.id,
      currentMemberName: data.currentMemberName || person.name,
      needsPersonSelection: false,
    }));
  };

  return (
    <div className={`ai-chat-widget${open ? " is-open" : ""}`}>
      {open ? (
        <ChatWindow
          context={context}
          contextLoading={contextLoading}
          contextError={contextError}
          people={people}
          peopleLoading={peopleLoading}
          onBindPerson={handleBindPerson}
          onClose={() => setOpen(false)}
        />
      ) : null}
      <button
        type="button"
        className="ai-chat-btn"
        ref={launcherRef}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? t("aiChat.launcherClose") : t("aiChat.launcherOpen")}
        aria-expanded={open}
        title={open ? t("aiChat.launcherClose") : t("aiChat.launcherOpen")}
      >
        <span className="material-symbols-outlined" aria-hidden="true">{open ? "close" : "psychology"}</span>
      </button>
    </div>
  );
};

export default AIChatGateway;
