/**
 * File download helper.
 *
 * ⚠️ Never use the `url` field from API file objects for downloads — those
 * preview links EXPIRE AFTER ~15 MINUTES. Always fetch the feature's download
 * endpoint (with the auth token) and save the resulting Blob:
 *
 *   import { downloadNoticeAttachment } from '../api/noticehub';
 *   import { saveBlob } from '../utils/files';
 *   const blob = await downloadNoticeAttachment(notice.notice_id);
 *   saveBlob(blob, notice.attachment?.filename ?? 'attachment');
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** <img>-safe preview URL (fine for quick previews; expires in ~15 min). */
export function previewUrl(file: { url: string } | null | undefined): string | undefined {
  return file?.url;
}
