import { useEffect, useMemo, useState } from "react";
import { getStoredUser } from "../../../shared/utils/auth";
import { getMeContext, getMeContextPeople, setCurrentPerson } from "../../../api/chatbotService";
import ChatWindow from "./ChatWindow";
import "./AIChat.css";

const AIChatGateway = () => {
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
        if (!cancelled) setContextError(error?.message || "Không thể xác định ngữ cảnh tài khoản.");
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user.account_id, user.id]);

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
    <div className="ai-chat-widget">
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
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Đóng trợ lý gia phả" : "Mở trợ lý gia phả"}
        title={open ? "Đóng trợ lý gia phả" : "Mở trợ lý gia phả"}
      >
        <span className="material-symbols-outlined">{open ? "close" : "psychology"}</span>
      </button>
    </div>
  );
};

export default AIChatGateway;
