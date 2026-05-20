import AppRoutes from "./routes";
import { LanguageProvider } from "../i18n/LanguageContext";
import "./App.css";

export default function App() {
  return (
    <LanguageProvider>
      <AppRoutes />
    </LanguageProvider>
  );
}
