/**
 * Simplified Chinese — hook-fired copy (Phase 21, Task 66-i).
 *
 * The zh twin of en/hooks.ts: toasts, announcements, parse/read
 * failure titles + details, elevation failure copy, share notes, and
 * the saved-sessions manager's sentences. Key set + `{param}` names
 * mirror the English dictionary exactly (the parity gate enforces
 * both).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof hooks, string> once the keys land (the i18n
 * gate enforces completeness).
 */

export const zhHooks: Record<string, string> = {
  /** Parse/read failures (describeParseError + the intake guards). */
  "hook.parse.malformedXml.title": "XML 格式不完整",
  "hook.parse.malformedXml.detail":
    "“{fileName}”无法解析为 XML。文件可能被截断，或根本不是 GPX 导出。{message}",
  "hook.parse.notGpx.title": "不是 GPX 文件",
  "hook.parse.notGpx.detail":
    "应为 <gpx> 根元素，实际找到 {found}。请把活动重新导出为 GPX 文件后再试。",
  "hook.parse.invalidVersion.title": "不支持的 GPX 版本",
  "hook.parse.invalidVersion.detail":
    "GPX 文件必须声明版本“1.0”或“1.1”；此文件声明的是 {found}。请从你的设备或平台以标准 GPX 版本重新导出。",
  "hook.parse.unsupportedFormat.title": "不支持的文件格式",
  "hook.parse.unsupportedFormat.detail":
    "“{fileName}”不是 GPX、TCX 或 FIT 轨迹文件（{reason}）。请把活动以其中一种格式重新导出后再试。",
  "hook.parse.notTcx.title": "不是 TCX 文件",
  "hook.parse.notTcx.detail":
    "应为 <TrainingCenterDatabase> 根元素，实际找到 {found}。请把活动重新导出为 TCX 文件后再试。",
  "hook.parse.malformedFit.title": "无法读取的 FIT 文件",
  "hook.parse.malformedFit.detail":
    "“{fileName}”无法解码为 FIT 文件（{message}）。文件可能已损坏，或根本不是 FIT 导出。",
  "hook.parse.noRootElement": "无根元素",
  "hook.parse.noVersion": "未声明版本",
  "hook.parse.emptyTitle": "空文件",
  "hook.parse.emptyDetailFormats":
    "“{fileName}”不含任何数据。请选择一个非空的 GPX、TCX 或 FIT 导出文件。",
  "hook.parse.emptyDetailTrack":
    "“{fileName}”不含任何数据。请选择一个非空的轨迹导出文件。",
  "hook.parse.readTitle": "无法读取文件",
  "hook.parse.readDetail": "“{fileName}”无法读取：{reason}",

  /** Elevation (use-elevation + its recovery/create/plan mirrors). */
  "hook.elevation.errorNetwork":
    "无法连接海拔服务 — 请检查网络连接后重试。",
  "hook.elevation.errorThrottled":
    "海拔服务正在限制请求频率 — 请等待几秒后重试。",
  "hook.elevation.errorServer": "海拔服务暂时出现问题 — 请稍后重试。",
  "hook.elevation.errorBadResponse": "海拔服务返回了意外的响应 — 请稍后重试。",
  "hook.elevation.errorNoData": "海拔服务没有返回可用数据 — 请稍后重试。",
  "hook.elevation.blockedDrawRoute":
    "请先绘制缺失的路线 — 海拔只针对你绘制的点进行估算。",
  "hook.elevation.blockedTwoPoints": "请在地图上至少绘制两个点以估算海拔。",

  /** Export downloads. */
  "hook.export.ready": "导出就绪 — {fileName} 已下载。",
  "hook.export.statsReady": "统计表就绪 — {fileName} 已下载。",
  "hook.export.batchZipReady": "导出就绪 — {fileName} 已下载（{files} + 清单）。",

  /** Batch (use-batch-session). */
  "hook.batch.nothingToApply": "无可应用 — 每个文件在此预设下都已是干净的。",
  "hook.batch.presetApplied": "{preset} 已应用到 {files} — 共 {fixes}。",
  "hook.batch.fileCountOne": "{count} 个文件",
  "hook.batch.fileCountMany": "{count} 个文件",
  "hook.batch.fixCountOne": "{count} 项修复",
  "hook.batch.fixCountMany": "{count} 项修复",
  "hook.batch.repairedFilesOne": "{count} 个已修复文件",
  "hook.batch.repairedFilesMany": "{count} 个已修复文件",
  "hook.batch.undone": "已撤销 — 该文件最近的一项修复已还原。",
  "hook.batch.nothingToWorkOn": "暂时没有可处理的内容 — 请至少添加一个能解析的文件。",

  /** Surgery (use-surgery). */
  "hook.surgery.pointPicked": "已选取点。",
  "hook.surgery.applied":
    "轨迹手术已应用 — {label}。统计将基于工作副本重新计算。",

  /** Deep validation (use-deep-validation). */
  "hook.deepValidation.applied": "修复已应用 — {label}。报告会重新检查工作副本。",
  "hook.deepValidation.fixesSummary": "{count} 项修复（{labels}）",
  "hook.deepValidation.undone": "已撤销 — {label}。",

  /** Road snapping (use-road-snap). */
  "hook.roadSnap.finding": "正在为你的线查找{profile}…",
  "hook.roadSnap.unavailable":
    "道路吸附目前不可用 — 你的线保持原样。",
  "hook.roadSnap.noMatch": "路由服务无法匹配你的线 — 线保持你绘制时的原样。",
  "hook.roadSnap.previewReady": "道路预览就绪 — 路上约 {meters} m。",
  "hook.roadSnap.cancelled": "道路预览已取消 — 你的线已恢复为绘制时的原样。",
  "hook.roadSnap.snapped": "线已吸附到{profile} — 撤销可找回你的手绘。",

  /** The draw editor's typed-coordinate confirmations. */
  "hook.drawEditor.pointAddedByCoords":
    "已按坐标添加点 — 线上现在有 {count} 个点。",
  "hook.drawEditor.pointInsertedByCoords": "已按坐标插入点。",

  /** The repair flow's two derived-state announcements. */
  "hook.repairAnnounce.gapsOne":
    "在 {file} 中检测到 {count} 个缺口 — 打开一个即可绘制其路线。",
  "hook.repairAnnounce.gapsMany":
    "在 {file} 中检测到 {count} 个缺口 — 打开一个即可绘制其路线。",
  "hook.repairAnnounce.theFile": "该文件",
  "hook.repairAnnounce.loadedNoGaps": "{file} 已加载 — 未检测到缺口。",
  "hook.repairAnnounce.fileFallback": "文件",
  "hook.repairAnnounce.reconstructedOne":
    "缺口已重建 — {repaired} / {total} 个缺口已修复。",
  "hook.repairAnnounce.reconstructedMany":
    "已重建 {count} 个缺口 — {repaired} / {total} 个缺口已修复。",

  /** The reload autosave restore (use-session-recovery). */
  "hook.sessionRecovery.repairRestored": "已恢复上一次的修复会话。",
  "hook.sessionRecovery.recoveryRestored": "已恢复上一次的缺口找回会话。",
  "hook.sessionRecovery.createRestored": "已恢复上一次的创建会话。",
  "hook.sessionRecovery.planRestored": "已恢复上一次的规划。",

  /** The one restore path (restore-session.ts). */
  "hook.restore.repairRestored": "已恢复修复会话。",
  "hook.restore.recoveryRestored": "已恢复缺口找回会话。",
  "hook.restore.createRestored": "已恢复创建会话。",
  "hook.restore.planRestored": "已恢复规划会话。",

  /** The saved-sessions shelf (use-saved-sessions). */
  "hook.savedSessions.nothingToSave": "暂时没有可保存的内容 — 请先绘制或修复一些东西。",
  "hook.savedSessions.saveFailed": "无法保存会话 — 存储不可用或已满。",
  "hook.savedSessions.saved": "已保存 — “{name}”已在你的会话架上。",
  "hook.savedSessions.nothingToExport":
    "暂时没有可导出的内容 — 请先绘制或修复一些东西。",
  "hook.savedSessions.renameFailed": "无法重命名该会话。",
  "hook.savedSessions.deleteFailed": "无法删除该会话。",
  "hook.savedSessions.deleted": "会话已删除。",
  "hook.savedSessions.unreadableRecord":
    "这个已保存的会话已无法读取 — 其记录不可读。",
  "hook.savedSessions.offShelf": "该会话已不在架上。",
  "hook.savedSessions.missingSource":
    "此会话缺少原始文件 — 无法重新打开。",
  "hook.savedSessions.parseFailed": "原始文件已无法解析 — 该会话无法重新打开。",
  "hook.savedSessions.imported": "已导入 — “{name}”已在你的会话架上。",
  "hook.savedSessions.importedName": "导入的会话",
  "hook.savedSessions.importUnreadable": "无法读取该文件。",
  "hook.savedSessions.importNotJson":
    "这不是会话文件 — 它不是有效的 JSON。",
  "hook.savedSessions.importNotSession": "这不是 GPX Repair Studio 会话文件。",
  "hook.savedSessions.importNewerVersion":
    "此会话文件由更新版本写入（v{version}）— 请更新应用后再打开。",
  "hook.savedSessions.importBadSession": "文件内的会话无法读取。",
  "hook.savedSessions.importBadRecording": "此会话文件内的原始记录无法读取。",
  "hook.savedSessions.importShelfFailed":
    "无法把会话添加到架上 — 存储不可用或已满。",
  "hook.savedSessions.importOpenFailed":
    "会话已导入但无法打开 — 其文件已无法解析。",

  /** The share views' honesty notes (use-create-share, use-merge-share). */
  "hook.share.createNoteReconstructed":
    "路线是依据手表记录的统计数据手工重建的。",
  "hook.share.createNoteScaled":
    "距离取自你的手表 — 所绘形状已按此距离均匀缩放。",
  "hook.share.createNoteDrawn": "距离即你绘制的路线。",
  "hook.share.createNoteTime": "时间是你输入的总时间；配速为时间除以该距离。",
  "hook.share.createNoteElevation":
    "导出的文件带有来自 {provider} 的估算海拔 — 卡片只展示距离、配速和时间。",
  "hook.share.mergeNoteCombined":
    "由 {count} 份记录合并 — 每个点都按你设定的顺序原样保留。",
};
