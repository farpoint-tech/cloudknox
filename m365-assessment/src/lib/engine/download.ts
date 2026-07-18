/** Trigger a client-side download of text content (no server round-trip). */
export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Timestamp slug for filenames, e.g. 2026-07-18T09-41-07. */
export function timestampSlug(iso: string): string {
  return iso.replace(/:/g, "-").replace(/\.\d+Z$/, "").replace(/Z$/, "");
}
