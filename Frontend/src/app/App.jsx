import { useEffect } from "react";
import AppRoutes from "./routes";
import { installEscapeCloseOverlay } from "../shared/utils/escapeCloseOverlay";
import { LanguageProvider } from "../i18n/LanguageContext";
import ColdStartBanner from "../shared/components/ColdStartBanner";
import { installPendingFetchTracker } from "../services/pendingRequests";
import { installSessionGuard } from "../services/sessionGuard";
import { API_BASE_URL } from "../services/api";
import ConfirmProvider from "../shared/components/ConfirmProvider";
import "./App.css";

// Đếm request tới backend một lần cho cả app (banner "máy chủ đang khởi động").
installPendingFetchTracker(API_BASE_URL);
// Phiên hết hạn / token bị thu hồi (vd. sau khi đổi mật khẩu) thì xóa phiên và chuyển về đăng nhập.
installSessionGuard(API_BASE_URL);

export default function App() {
  // Esc đóng modal trên cùng ở mọi trang.
  useEffect(() => installEscapeCloseOverlay(), []);

  return (
    <LanguageProvider>
      <ConfirmProvider>
        <AppRoutes />
      </ConfirmProvider>
      <ColdStartBanner />
    </LanguageProvider>
  );
}
