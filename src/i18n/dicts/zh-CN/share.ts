/**
 * Simplified Chinese — share view + share staging (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof share, string> once the keys land (the i18n
 * gate enforces completeness).
 *
 * Vocabulary (docs/i18n-extraction-pattern.md): share card=分享卡片,
 * route=路线, pace=配速, repair=修复, download=下载, privacy=隐私.
 * The exported PNG card artifact itself stays English by design.
 */

export const zhShare: Record<string, string> = {
  /** ShareView. */
  "share.sectionA11y": "分享卡片",
  "share.toolsA11y": "分享卡片工具",
  "share.title": "分享卡片",
  "share.intro": "一张 Strava 风格的图形，来自",
  "share.introFileFallback": "此文件",
  "share.introTail": "— 透明背景，",
  "share.introRenderedRepairs": "按你修复后的路线渲染 — 已提交的修复会自动包含。",
  "share.introRenderedRecorded": "按文件实际记录的数值渲染。",
  "share.preparing": "正在生成分享卡片",
  "share.stageNote": "透明背景 — 以深色底展示",
  "share.onTheCard": "卡片上",
  "share.cardDescRepairs": "已包含你提交的修复 — 与统计面板显示的合计相同。",
  "share.cardDescRecorded": "仅已记录的数值 — 与统计面板显示的数字相同。",
  "share.colDistance": "距离",
  "share.colPace": "配速",
  "share.colTime": "时间",
  "share.routeEmpty": "此文件没有可绘制的路线点 — 卡片将仅显示统计块。",
  "share.pngResolution": "PNG 分辨率",
  "share.downloadPng": "下载 PNG",
  "share.openRepair": "改为修复此文件",
  "share.numbersTitle": "这些数字的含义",
  "share.numbersDesc": "卡片不会展示文件中没有的内容。",
  "share.numbersRepairs":
    "距离包含你提交的修复；配速为移动时间加修复时间上的整体配速；时间为已记录的总耗时。文件无法支持的数值显示为“—”。",
  "share.numbersRecorded":
    "距离为已记录的路线长度；配速为该距离除以已记录的移动时间；时间为已记录的总耗时。文件无法支持的数值显示为“—”。",

  /** ShareCardCanvas — the default a11y label. */
  "share.canvasA11y": "分享卡片：路线图，距离 {distance}，配速 {pace}，时间 {time}",
};
