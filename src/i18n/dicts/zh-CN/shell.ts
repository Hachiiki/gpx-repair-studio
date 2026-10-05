/**
 * Simplified Chinese — app-shell strings (toasts, announcements, dialogs wiring) (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof shell, string> once the keys land (the i18n
 * gate enforces completeness).
 */

export const zhShell: Record<string, string> = {
  /** app-shell.tsx — the composition root's own copy. */
  "shell.skipToContent": "跳到内容",
  "shell.header.createFileName": "来自统计数据的活动",
  "shell.header.mergedRecordings": "已合并 {count} 条记录",
  "shell.header.planFileName": "路线规划",
  "shell.header.batchFallback": "批量队列",
  "shell.header.batchFiles": "{count} 个文件",
  "shell.elevation.gainLoss": "爬升 {gain} 米，下降 {loss} 米",

  "shell.section.repair": "修复",
  "shell.section.recovery": "缺口找回",
  "shell.section.create": "从数据创建",
  "shell.section.plan": "路线规划",

  /** sw-registrar.tsx — 更新提示（征询，绝不静默切换）。 */
  "shell.pwa.updateTitle": "有可用更新",
  "shell.pwa.updateBody":
    "GPX Repair Studio 的新版本已下载就绪。只有您手动重新加载后才会生效——绝不会在您背后悄悄刷新，请先完成手头的操作。",
  "shell.pwa.updateAction": "重新加载",
};
