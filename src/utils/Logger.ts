export interface Logger {
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  clear(): void;
}

export function createLogger(element: HTMLElement): Logger {
  function addLine(msg: string, cls: string) {
    const div = document.createElement('div');
    div.className = `log-line ${cls}`;
    const ts = new Date().toLocaleTimeString();
    div.textContent = `[${ts}] ${msg}`;
    element.appendChild(div);
    element.scrollTop = element.scrollHeight;
  }

  return {
    info(msg) { addLine(msg, 'info'); },
    success(msg) { addLine(msg, 'success'); },
    warn(msg) { addLine(msg, 'warn'); },
    error(msg) { addLine(msg, 'error'); },
    clear() { element.innerHTML = ''; },
  };
}
