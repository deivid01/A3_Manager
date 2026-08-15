import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";

export function WindowTitlebar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.a3
      .isWindowMaximized()
      .then(setMaximized)
      .catch(() => undefined);
    return window.a3.onWindowMaximizedChanged(setMaximized);
  }, []);

  async function toggleMaximize() {
    const next = await window.a3.toggleMaximizeWindow();
    setMaximized(next);
  }

  return (
    <header
      className="window-titlebar"
      onDoubleClick={() => void toggleMaximize()}
    >
      <div className="window-title">
        <img src={`${import.meta.env.BASE_URL}logo-A3.jpg`} alt="" />
        <span>A3 Manager</span>
      </div>
      <div
        className="window-actions"
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          title="Minimizar"
          aria-label="Minimizar"
          onClick={() => void window.a3.minimizeWindow()}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          title={maximized ? "Restaurar" : "Maximizar"}
          aria-label={maximized ? "Restaurar" : "Maximizar"}
          onClick={() => void toggleMaximize()}
        >
          {maximized ? <Copy size={14} /> : <Square size={14} />}
        </button>
        <button
          className="window-close"
          type="button"
          title="Fechar"
          aria-label="Fechar"
          onClick={() => void window.a3.closeWindow()}
        >
          <X size={17} />
        </button>
      </div>
    </header>
  );
}
