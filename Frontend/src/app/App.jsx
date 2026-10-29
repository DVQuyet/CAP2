import { useEffect, useState } from "react";
import AppRoutes from "./routes";
import { installEscapeCloseOverlay } from "../shared/utils/escapeCloseOverlay";
import { LanguageProvider } from "../i18n/LanguageContext";
import ColdStartBanner from "../shared/components/ColdStartBanner";
import { installPendingFetchTracker } from "../services/pendingRequests";
import { installSessionGuard } from "../services/sessionGuard";
import { API_BASE_URL } from "../services/api";
import { ensureMediaToken, needsMediaToken } from "../services/mediaToken";
import ConfirmProvider from "../shared/components/ConfirmProvider";
import "./App.css";

// Đếm request tới backend một lần cho cả app (banner "máy chủ đang khởi động").
installPendingFetchTracker(API_BASE_URL);
// Phiên hết hạn / token bị thu hồi (vd. sau khi đổi mật khẩu) thì xóa phiên và chuyển về đăng nhập.
installSessionGuard(API_BASE_URL);

export default function App() {
  // Esc đóng modal trên cùng ở mọi trang.
  useEffect(() => installEscapeCloseOverlay(), []);

  // Phiên có sẵn từ trước (đã đăng nhập, chưa có token media): lấy một lần trước khi vẽ ảnh. Có giới hạn thời gian nên không treo app.
  const [mediaReady, setMediaReady] = useState(() => !needsMediaToken());
  useEffect(() => {
    if (mediaReady) return;
    ensureMediaToken().finally(() => setMediaReady(true));
  }, [mediaReady]);

  return (
    <LanguageProvider>
      <ConfirmProvider>
        {mediaReady ? <AppRoutes /> : null}
      </ConfirmProvider>
      <ColdStartBanner />
    </LanguageProvider>
  );
}
