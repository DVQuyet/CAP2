import test from "node:test";
import assert from "node:assert/strict";

// DOM tối giản đủ cho escapeCloseOverlay (không cần jsdom).
class FakeNode {
  constructor({ tag = "div", className = "", text = "", attrs = {}, zIndex = "", disabled = false, visible = true, children = [] } = {}) {
    Object.assign(this, { tag, className, textContent: text, attrs, zIndex, disabled, visible, children });
    this.clicked = 0;
    this.events = [];
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return name in this.attrs; }
  getClientRects() { return this.visible ? [{}] : []; }
  click() { this.clicked += 1; }
  dispatchEvent(event) { this.events.push(event.type); return true; }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  querySelectorAll(selector) {
    const parts = selector.split(",").map((part) => part.trim());
    const matches = (node) => parts.some((part) => {
      if (part.startsWith(".")) return node.className.split(/\s+/).includes(part.slice(1));
      if (part.startsWith("[data-")) return part.slice(1, -1) in node.attrs;
      if (part === "button") return node.tag === "button";
      if (part === "[role='button']") return node.attrs.role === "button";
      return false;
    });
    return this.descendants().filter(matches);
  }
}

const listeners = {};
const rootNodes = [];
globalThis.window = {
  getComputedStyle: (node) => ({ display: "block", visibility: "visible", zIndex: node.zIndex }),
  addEventListener: (type, handler) => { listeners[type] = handler; },
  removeEventListener: (type) => { delete listeners[type]; },
};
globalThis.document = { querySelectorAll: (selector) => new FakeNode({ children: rootNodes }).querySelectorAll(selector) };
globalThis.MouseEvent = class { constructor(type) { this.type = type; } };

const { findTopOverlay, findCloseControl, dismissOverlay, installEscapeCloseOverlay } = await import("../src/shared/utils/escapeCloseOverlay.js");

const button = (props) => new FakeNode({ tag: "button", ...props });
const resetDom = (...nodes) => { rootNodes.length = 0; rootNodes.push(...nodes); };

test("chọn overlay hiển thị có z-index cao nhất, bằng nhau thì lấy phần tử sau", () => {
  const low = new FakeNode({ className: "task-modal-backdrop", zIndex: "10" });
  const hidden = new FakeNode({ className: "fte-modalOverlay", zIndex: "999", visible: false });
  const laterSame = new FakeNode({ className: "fund-modal-v2", zIndex: "10" });
  resetDom(low, hidden, laterSame);
  assert.equal(findTopOverlay(), laterSame);

  const high = new FakeNode({ className: "post-modal-backdrop", zIndex: "50" });
  resetDom(high, low);
  assert.equal(findTopOverlay(), high);
  resetDom();
  assert.equal(findTopOverlay(), null);
});

test("ưu tiên nút đóng, sau đó nút hủy; bỏ qua nút bị vô hiệu", () => {
  const cancel = button({ className: "modal-btn-cancel", text: "Hủy" });
  const submit = button({ className: "primary", text: "Lưu" });
  const closeX = button({ className: "mgr-modalClose", text: "close" });
  assert.equal(findCloseControl(new FakeNode({ children: [submit, cancel, closeX] })), closeX);
  assert.equal(findCloseControl(new FakeNode({ children: [submit, cancel] })), cancel);

  const disabledClose = button({ className: "close", disabled: true });
  assert.equal(findCloseControl(new FakeNode({ children: [disabledClose, submit] })), null);

  const explicit = button({ className: "x", attrs: { "data-modal-close": "" } });
  assert.equal(findCloseControl(new FakeNode({ children: [closeX, explicit] })), explicit);
});

test("không có nút đóng thì giả lập bấm ra ngoài trên lớp phủ", () => {
  const overlay = new FakeNode({ className: "fte-modalOverlay", children: [button({ className: "primary", text: "Lưu" })] });
  dismissOverlay(overlay);
  assert.deepEqual(overlay.events, ["mousedown", "mouseup", "click"]);

  const withClose = new FakeNode({ className: "policy-modal-overlay" });
  const closeButton = button({ className: "policy-modal-close" });
  withClose.children = [closeButton];
  dismissOverlay(withClose);
  assert.equal(closeButton.clicked, 1);
  assert.deepEqual(withClose.events, []);
});

test("Esc đóng đúng một lớp và chặn lan truyền; phím khác hoặc không có modal thì bỏ qua", () => {
  const closeButton = button({ className: "modal-close" });
  const overlay = new FakeNode({ className: "mgr-modalOverlay", children: [closeButton] });
  resetDom(overlay);
  const dispose = installEscapeCloseOverlay();

  const makeEvent = (key, extra = {}) => ({
    key,
    defaultPrevented: false,
    isComposing: false,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    ...extra,
  });

  const other = makeEvent("Enter");
  listeners.keydown(other);
  assert.equal(closeButton.clicked, 0);
  assert.equal(other.stopped, false);

  const esc = makeEvent("Escape");
  listeners.keydown(esc);
  assert.equal(closeButton.clicked, 1);
  assert.equal(esc.stopped, true);
  assert.equal(esc.prevented, true);

  const composing = makeEvent("Escape", { isComposing: true });
  listeners.keydown(composing);
  assert.equal(closeButton.clicked, 1);

  resetDom();
  const noModal = makeEvent("Escape");
  listeners.keydown(noModal);
  assert.equal(noModal.stopped, false, "không có modal thì để các handler khác (drawer, toàn màn hình) xử lý");

  dispose();
  assert.equal(listeners.keydown, undefined);
});
