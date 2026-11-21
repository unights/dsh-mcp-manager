import { useState } from 'react';
import { buildExport } from '../model.ts';
import type { ExportFormat, ExportState, ServerEntry } from '../types.ts';

/** Keep export presentation and browser effects independent from fleet operations. */
export function useExport() {
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const openExport = (names: string[], configured: Record<string, ServerEntry>) => {
    const entries = names.filter(name => Object.hasOwn(configured, name)).map(name => ({ name, entry: configured[name] }));
    setExportState({ format: 'mcp_servers_camel', entries, text: buildExport(entries, 'mcp_servers_camel'), copied: false });
  };
  const changeExportFormat = (format: ExportFormat) => setExportState(current => current ? { ...current, format,
    text: buildExport(current.entries, format), copied: false } : current);
  const copyExport = async () => {
    if (!exportState) return;
    const current = exportState;
    try {
      await navigator.clipboard.writeText(current.text);
      setExportState(value => value === current ? { ...value, copied: true } : value);
    } catch {
      const area = document.getElementById('mcps-export');
      if (area instanceof HTMLTextAreaElement) area.select();
    }
  };
  const downloadExport = () => {
    if (!exportState) return;
    const url = URL.createObjectURL(new Blob([exportState.text], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'mcp-servers.json';
    document.body.appendChild(anchor);
    try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 0); }
  };
  return { exportState, closeExport: () => setExportState(null), openExport, changeExportFormat, copyExport, downloadExport };
}
