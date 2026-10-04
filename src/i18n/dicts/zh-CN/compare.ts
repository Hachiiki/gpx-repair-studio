/**
 * Simplified Chinese — compare card, side-by-side dialog, repair summary (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof compare, string> once the keys land (the i18n
 * gate enforces completeness).
 *
 * Vocabulary (docs/i18n-extraction-pattern.md): recorded=已记录,
 * modified=已修改, estimated=估算, mixed=混合, track=轨迹,
 * working copy=工作副本, repair=修复, batch=批量.
 */

export const zhCompare: Record<string, string> = {
  /** The mode segmented control. */
  "compare.mode.off": "关闭",
  "compare.mode.overlay": "叠加",
  "compare.mode.sideBySide": "并排对比",

  /** The delta table's flag chips. */
  "compare.flag.recorded": "已记录",
  "compare.flag.modified": "已修改",
  "compare.flag.estimated": "估算",
  "compare.flag.mixed": "混合",

  /** Delta-table column heads. */
  "compare.table.metric": "指标",
  "compare.table.original": "原始",
  "compare.table.after": "之后",
  "compare.table.change": "变化",
  "compare.table.provenance": "来源",

  /** CompareCard. */
  "compare.card.title": "修复前后",
  "compare.card.descChanged": "相对原始记录的变化 — 地图上和数字里。",
  "compare.card.descUnchanged": "尚未发生任何变化 — 工作副本仍与原始记录一致。",
  "compare.card.modeA11y": "对比模式",
  "compare.card.overlayNote":
    "地图现在将原始记录以虚线幽灵显示在工作副本下方；你的修复涉及的路段为橙色虚线。图例中说明了两者。",
  "compare.card.overlayNoteNoChanges":
    "尚无任何变化时，幽灵与工作副本完全重合 — 编辑落在哪里，它就会在哪里分开。",

  /** CompareSideBySideDialog. */
  "compare.sideBySide.title": "修复前后，并排对比",
  "compare.sideBySide.desc":
    "两幅图使用同一比例尺 — 相同的轨迹形状、相同的缩放。左面板是原始记录；右面板是导出将包含的内容。",
  "compare.sideBySide.empty": "暂无可对比的内容 — 文件解析后即可生成面板。",
  "compare.sideBySide.panelOriginal": "原始 — 记录原样",
  "compare.sideBySide.panelOriginalDesc": "不可更改的记录。变化的路段为橙色虚线。",
  "compare.sideBySide.panelAfter": "之后 — 编辑与修复",
  "compare.sideBySide.panelAfterDesc":
    "工作副本加已提交的修复。下方的幽灵即原始记录。",
  "compare.sideBySide.legendTrack": "轨迹（实线）",
  "compare.sideBySide.legendGhost": "原始幽灵",

  /** The shared changed-stretch legend word. */
  "compare.legendChanged": "已更改 / 已修复",

  /** BatchSummarySection. */
  "compare.batch.title": "批量汇总",
  "compare.batch.desc":
    "{parsed} 个已解析 · {changed} 个已更改 · 修复删除了 {points} 个点。打印表单会列出每个文件各自的数字和缩略图。",
  "compare.batch.print": "打印",
  "compare.batch.subject.one": "{count} 个文件",
  "compare.batch.subject.many": "{count} 个文件",
  "compare.batch.colFile": "文件",
  "compare.batch.colPoints": "点数",
  "compare.batch.colDistance": "距离",
  "compare.batch.colChanges": "更改",
  "compare.batch.colTrack": "轨迹",
  "compare.batch.statusParsed": "已解析",
  "compare.batch.statusFailed": "失败",
  "compare.batch.statusReading": "读取中",
  "compare.batch.changeRemoved": "删除 {count}",
  "compare.batch.changeSorted": "排序 {count}",
  "compare.batch.changeSmoothed": "平滑 {count}",
  "compare.batch.noChanges": "无",
  "compare.batch.thumbA11y": "{fileName} 的轨迹缩略图",

  /** SummaryPrintHeader; the wordmark stays English. */
  "compare.print.repairTitle": "修复汇总表",
  "compare.print.batchTitle": "批量修复汇总",
  "compare.print.privacyLine": "全部在浏览器中本地计算 — 没有数据离开这台设备。",

  /** RepairSummaryCard. */
  "compare.summary.title": "修复汇总",
  "compare.summary.desc.one": "每一处修改都有计数和说明 — 共 {count} 处更改。",
  "compare.summary.desc.many": "每一处修改都有计数和说明 — 共 {count} 处更改。",
  "compare.summary.descNone": "尚未进行任何修改 — 导出将与原始记录一致。",
  "compare.summary.print": "打印",
  "compare.summary.modifications": "修改项",
  "compare.summary.colWhat": "项目",
  "compare.summary.colCount": "数量",
  "compare.summary.colDisclosure": "说明",
  "compare.summary.empty":
    "此文件尚未应用任何修复、手术或重建。你确认的任何操作都会在此计数 — 磁盘上的原始文件永远不会被改动。",
  "compare.summary.appliedFixes": "已应用的修复，按顺序",
  "compare.summary.snapshot": "轨迹快照",
  "compare.summary.snapshotA11y":
    "轨迹快照：工作副本为墨色，原始记录在其下方以幽灵显示，变化的路段为橙色",
  "compare.summary.snapshotFallback": "无可渲染的轨迹几何。",
  "compare.summary.legendWorking": "工作副本",
  "compare.summary.legendGhost": "原始（幽灵）",

  "compare.stat.points": "已记录点数",
  "compare.stat.distance": "距离",
  "compare.stat.movingTime": "移动时间",
  "compare.stat.elevation": "海拔爬升",
};
