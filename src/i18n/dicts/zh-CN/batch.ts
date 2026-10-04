/**
 * Simplified Chinese — batch intake, studio, presets, export (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof batch, string> once the keys land (the i18n
 * gate enforces completeness).
 */

export const zhBatch: Record<string, string> = {
  /** The §EE 18 status vocabulary — the sacred words. */
  "batch.status.queued": "排队中",
  "batch.status.reading": "读取中",
  "batch.status.parsed": "已解析",
  "batch.status.failed": "失败",
  "batch.status.fixed": "已修复",
  "batch.status.issuesFound": "发现问题",
  "batch.status.clean": "干净",
  "batch.status.exported": "已导出",

  /** batch-intake.tsx */
  "batch.intake.title": "把你的 GPX、TCX 或 FIT 文件拖到这里",
  "batch.intake.orPrefix": "一个或多个 — 或",
  "batch.intake.browse": "点击浏览文件",
  "batch.intake.privacyLine":
    "文件只在这个标签页的本地读取 — 不会上传到任何地方。",
  "batch.intake.refusedOne":
    "“{name}”未被添加 — 队列最多容纳 {max} 个文件。",
  "batch.intake.refusedMany":
    "{count} 个文件未被添加 — 队列最多容纳 {max} 个文件。",
  "batch.intake.filesAria": "已收集的文件",
  "batch.intake.waiting": "等待中…",
  "batch.intake.reading": "读取中…",
  "batch.intake.pointsOne": "{count} 个点",
  "batch.intake.pointsMany": "{count} 个点",
  "batch.intake.deepChecksOne": "深度检查 {count} 项发现",
  "batch.intake.deepChecksMany": "深度检查 {count} 项发现",
  "batch.intake.removeAria": "从队列中移除 {name}",
  "batch.intake.workQueue": "处理队列（{count} 个已解析）",

  /** batch-studio.tsx */
  "batch.studio.sectionAria": "批量队列工作室",
  "batch.studio.title": "批量队列",
  "batch.studio.summaryParsed": "{count} 个已解析",
  "batch.studio.summaryFailed": "{count} 个失败",
  "batch.studio.summaryFixed": "{count} 个已修复",
  "batch.studio.summaryFindings": "{count} 个有发现",
  "batch.studio.summaryClean": "{count} 个干净",
  "batch.studio.recordedPoints": "{count} 个已记录点",
  "batch.studio.recordedDistance": "已记录 {distance}",
  "batch.studio.pointsRemoved": " · {count} 个点被修复移除",
  "batch.studio.aggregateNote":
    "。一切都发生在这台设备的浏览器里；原始文件绝不会被修改。",
  "batch.studio.addFiles": "添加文件",

  /** batch-queue-card.tsx */
  "batch.queue.title": "队列",
  "batch.queue.fileOne": "{count} 个文件",
  "batch.queue.fileMany": "{count} 个文件",
  "batch.queue.parsedCount": "{count} 个已解析",
  "batch.queue.failedCount": " · {count} 个失败",
  "batch.queue.fixedCount": " · {count} 个已修复",
  "batch.queue.findingsOne":
    "{count} 个文件存在预设可处理的发现 — 从下面的建议开始。",
  "batch.queue.findingsMany":
    "{count} 个文件存在预设可处理的发现 — 从下面的建议开始。",
  "batch.queue.undoLastFix": "撤销上一次修复",
  "batch.queue.removeAria": "从队列中移除 {name}",
  "batch.queue.recordedPointsOne": "{count} 个已记录点",
  "batch.queue.recordedPointsMany": "{count} 个已记录点",
  "batch.queue.deepChecksClean": "深度检查干净",
  "batch.queue.deepChecksOne": "深度检查：{count} 项发现",
  "batch.queue.deepChecksMany": "深度检查：{count} 项发现",
  "batch.queue.fixWithPreset": "用预设修复",
  "batch.queue.lastFix": "上一次修复：{label}",
  "batch.queue.earlierFixes": "（+{count} 次更早）",

  /** batch-preset-card.tsx + batch-preset-dialog.tsx */
  "batch.preset.title": "批量修复",
  "batch.preset.description":
    "在所有已解析文件上运行同一预设 — 逐文件预览，确认后才应用。",
  "batch.preset.chipAria": "预设 {name}。{description}",
  "batch.preset.note":
    "预设使用内置的深度检查设置；单个文件请到修复工作室中调整。这里的一切都不会碰原始文件。",
  "batch.preset.dialogTitleOne": "{count} 个文件",
  "batch.preset.dialogTitleMany": "{count} 个文件",
  "batch.preset.dialogDescription":
    "预览每个文件将发生的变化。确认之前不会应用任何改动 — 原始文件绝不会被改写。",
  "batch.preset.stepOne": "{count} 步",
  "batch.preset.stepMany": "{count} 步",
  "batch.preset.nothingToDo": "无需处理",
  "batch.preset.cancel": "取消",
  "batch.preset.apply": "应用到队列",

  /** batch-export-card.tsx */
  "batch.export.title": "导出这批文件",
  "batch.export.description":
    "一个 ZIP：每个已解析文件一份修复后的 GPX，外加一份更改清单。",
  "batch.export.modeAria": "导出模式",
  "batch.export.modeStructure": "保留结构",
  "batch.export.modeMerged": "合并为单段",
  "batch.export.prettyPrint": "美化 XML 格式",
  "batch.export.note":
    "没有应用修复的文件将原样导出（与原样导出逐字节一致）。重名文件会加上后缀 — 不会覆盖任何内容。全部在这个标签页中打包。",
  "batch.export.downloadOne": "下载 ZIP（{count} 个文件）",
  "batch.export.downloadMany": "下载 ZIP（{count} 个文件）",
  "batch.export.lastExportOne":
    "上次导出覆盖 {count} 个文件 — 你随时可以再次导出（有后续修复的文件会直接重新打包）。",
  "batch.export.lastExportMany":
    "上次导出覆盖 {count} 个文件 — 你随时可以再次导出（有后续修复的文件会直接重新打包）。",
};
