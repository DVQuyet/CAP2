import { useEffect, useState } from "react";
import { SLOW_LOADING_MS } from "../utils/slowLoading";

// true khi `loading` kéo dài quá ngưỡng; tự về false khi tải xong.
export default function useSlowLoading(loading, thresholdMs = SLOW_LOADING_MS) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => setSlow(true), thresholdMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [loading, thresholdMs]);
  return loading && slow;
}
