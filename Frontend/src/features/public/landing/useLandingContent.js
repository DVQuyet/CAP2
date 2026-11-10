import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchPublicLanding } from "../../../api/landingService";

// Tải một lần cho mỗi ngôn ngữ và dùng chung cho mọi mục trên trang; hết hạn sau vài phút để nội dung admin sửa sẽ tới được.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // lang -> { content, at, promise }

export function clearLandingCache() {
  cache.clear();
}

function readFresh(lang) {
  const hit = cache.get(lang);
  return hit && hit.at && Date.now() - hit.at < TTL_MS ? hit : null;
}

function load(lang) {
  const hit = cache.get(lang);
  if (hit && hit.promise) return hit.promise;
  const promise = fetchPublicLanding(lang).then((content) => {
    cache.set(lang, { content, at: Date.now(), promise: null });
    return content;
  });
  cache.set(lang, { content: hit ? hit.content : null, at: 0, promise });
  return promise;
}

// Trả { content, loaded }. content = null khi chưa tải/lỗi/chưa có dữ liệu -> nơi dùng rơi về i18n mặc định.
export default function useLandingContent() {
  const { i18n } = useTranslation();
  const lang = String(i18n.resolvedLanguage || i18n.language || "vi").startsWith("en") ? "en" : "vi";
  const [, setTick] = useState(0);

  useEffect(() => {
    if (readFresh(lang)) return undefined;
    let cancelled = false;
    load(lang).then(() => {
      if (!cancelled) setTick((n) => n + 1);
    });
    return () => { cancelled = true; };
  }, [lang]);

  const hit = readFresh(lang);
  return { content: hit ? hit.content : null, loaded: Boolean(hit) };
}
