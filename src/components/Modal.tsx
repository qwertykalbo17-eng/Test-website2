import { useEffect, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  wide?: boolean;
  /** Hide the close button and ignore backdrop clicks / Escape. */
  locked?: boolean;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, wide, locked, children }: Props) {
  useEffect(() => {
    if (!open || locked) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked, onClose]);

  if (!open) return null;

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <div className={`modal ${wide ? "modal--wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal__head">
          <h3>{title}</h3>
          {!locked && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
