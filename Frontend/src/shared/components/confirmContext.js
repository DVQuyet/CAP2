import { createContext, useContext } from "react";

export const ConfirmContext = createContext(null);

// Hộp xác nhận dùng chung: const ok = await confirm({ title, message, confirmText, cancelText, tone }).
// tone: "danger" (xóa/lưu trữ) hoặc "default". Trả về true khi người dùng đồng ý, false khi hủy/Esc/bấm nền.
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm phải nằm trong <ConfirmProvider>");
  return confirm;
}
