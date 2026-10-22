import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pendingTracker } from "../../services/pendingRequests";
import "./StateComponents.css";

// Banner không chặn thao tác, hiện khi có request chờ quá 5 giây (máy chủ Render đang khởi động).
export default function ColdStartBanner() {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(pendingTracker.isSlow());

  useEffect(() => pendingTracker.subscribe(setSlow), []);

  if (!slow) return null;
  return (
    <div className="cold-start-banner" role="status" aria-live="polite">
      <span className="cold-start-spinner" aria-hidden="true" />
      <span>{t("common.states.coldStart")}</span>
    </div>
  );
}
