import { useEffect } from "react";
import AppRoutes from "./routes";
import { installEscapeCloseOverlay } from "../shared/utils/escapeCloseOverlay";
import { LanguageProvider } from "../i18n/LanguageContext";
import "./App.css";

export default function App() {
  // Esc đóng modal trên cùng ở mọi trang.
  useEffect(() => installEscapeCloseOverlay(), []);

  return (
    <LanguageProvider>
      <AppRoutes />
    </LanguageProvider>
  );
}
