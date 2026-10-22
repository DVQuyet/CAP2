import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "../components/confirmContext";

// Đóng modal có kiểm tra dữ liệu chưa lưu: nếu `dirty` thì hỏi lại bằng hộp xác nhận dùng chung.
// Dùng cho cả nút đóng, nút hủy và bấm nền (Esc cũng đi qua nút đóng nên được bảo vệ luôn).
//   const { requestClose, backdropProps } = useDismissable();
//   <div className="overlay" {...backdropProps(onClose, dirty)}>
export default function useDismissable() {
  const confirm = useConfirm();
  const { t } = useTranslation();

  const requestClose = useCallback(async (onClose, dirty = false) => {
    // dirty có thể là boolean hoặc hàm (đọc ref/snapshot tại lúc bấm đóng).
    if (typeof dirty === "function" ? dirty() : dirty) {
      const discard = await confirm({
        title: t("common.confirm.discardTitle"),
        message: t("common.confirm.discardMessage"),
        confirmText: t("common.confirm.discardOk"),
        cancelText: t("common.confirm.keepEditing"),
        tone: "danger",
      });
      if (!discard) return false;
    }
    onClose();
    return true;
  }, [confirm, t]);

  // Chỉ đóng khi bấm đúng lên lớp nền (không phải khi kéo chọn chữ rồi thả ra ngoài hộp).
  const backdropProps = useCallback((onClose, dirty = false) => ({
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) requestClose(onClose, dirty);
    },
  }), [requestClose]);

  return { requestClose, backdropProps };
}
