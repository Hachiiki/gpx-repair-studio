/**
 * Simplified Chinese — recovery tool surfaces (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof recovery, string> once the keys land (the i18n
 * gate enforces completeness).
 */

export const zhRecovery: Record<string, string> = {
  // RecoveryGuideCard
  "recovery.guide.title": "缺口找回",
  "recovery.guide.status.empty":
    "未检测到缺失路段 — 你仍可在下方绘制你丢失的路线。",
  "recovery.guide.status.onlyDrawn":
    "没有检测到任何缺口 — 你绘制的路段承载这次找回。",
  "recovery.guide.status.allRecovered": "每个检测到的路段都已找回路线。",
  "recovery.guide.status.drawing": "绘制中 — 点击地图补上缺失的路线。",
  "recovery.guide.status.invite":
    "在下方打开一个路段，绘制你实际走过的路线。",
  "recovery.guide.step.detect": "检测缺失路段 —",
  "recovery.guide.step.found": "找到 {count} 个",
  "recovery.guide.step.draw": "绘制缺失路线 —",
  "recovery.guide.step.recovered": "已找回 {recovered}/{detected}",
  "recovery.guide.step.drawn": "已绘制 {count} 个",
  "recovery.guide.step.preview": "预览补全后的路线并导出",

  // RecoveryPreviewCard
  "recovery.preview.title": "补全后的路线",
  "recovery.preview.desc.recoveredOne":
    "已找回 {total} 个缺失路段中的 {count} 个 — 导出前先预览。",
  "recovery.preview.desc.recoveredMany":
    "已找回 {total} 个缺失路段中的 {count} 个 — 导出前先预览。",
  "recovery.preview.desc.drawnOne":
    "已绘制 {count} 个未计量路段 — 时间根据你文件中的配速估算。",
  "recovery.preview.desc.drawnMany":
    "已绘制 {count} 个未计量路段 — 时间根据你文件中的配速估算。",
  "recovery.preview.desc.empty":
    "绘制一个缺失路段，补全后的路线就会显示在这里 — 无论是否检测到缺口，随时都可以绘制。",
  "recovery.preview.recoveredTime": "找回的时间",
  "recovery.preview.recoveredTimeHint":
    "来自路段已记录的边界区间 — 未计量路段则根据你文件的平均配速估算。",
  "recovery.preview.distance": "距离",
  "recovery.preview.distanceHint":
    "已记录的路段（不含缺口）→ 已记录距离加上绘制的路段。",
  "recovery.preview.elapsedTime": "总耗时",
  "recovery.preview.elapsedTimeHint":
    "从第一个到最后一个已记录的时间戳 — 原始记录永远不会被改写，所以它不会变化。",
  "recovery.preview.avgSpeed": "补全后的平均速度",
  "recovery.preview.avgSpeedHint":
    "补全距离 ÷ 已记录的总耗时，再加上文件时钟从未计入的估算时间 — 几何是绘制的，时钟是真实的。",
  "recovery.preview.pointsGenerated": "生成的点",
  "recovery.preview.pointsGeneratedHint":
    "沿你在缺失区间内的绘制插入 — 导出时带有估算时间戳和来源标记。",
  "recovery.preview.needsDurationHint":
    "还有一个找回的路段缺少时长（或时间戳），在此之前这个数字并不诚实。",
  "recovery.preview.unchanged": "不变",
  "recovery.preview.estimatedNote":
    "生成的点是估算数据，不是原始 GPS 定位 — 导出会标记每一个点，重新读取该文件的平台会看到这些标记。",
  "recovery.preview.emptyNote":
    "在导出之前，任何改动都不会写入文件 — 即使导出，也是一个新文件：原文件保持原样，你找回的路段插在它未改动的点之间。",

  // RecoveryStudio — the recovery-voiced ManualRepairsCard copy
  "recovery.manual.title": "未计量路段",
  "recovery.manual.description":
    "绘制你丢失的路线 — 应用会根据你在此文件中的配速估算其时间。",
  "recovery.manual.anchorLabel": "绘制未计量路段",
  "recovery.manual.anchorHint":
    "在地图任意位置点击一次 — 路段会附着到你已记录路线最近的端点，之后的每次点击从那里向外绘制丢失的路线，并沿道路连接。手表从未计量过的任何路段都可以用它，即使没有检测到缺口。",
  "recovery.manual.pairLabel": "重画一段路线",
  "recovery.manual.pairHint":
    "在已记录的路线上点击两个点 — 它们之间的一段就是你要替换的部分。手表把你实际走的路画成直线时用它；时间来自文件。",
  "recovery.manual.empty":
    "还没有绘制任何内容。从路线上的任意位置开始 — 手表抄直穿过的隧道、它从未计量的路段 — 即使没有检测到缺口也可以。",
  "recovery.manual.anchorInstructions":
    "在地图上丢失路段所在位置附近任意点击 — 它会锚定到你已记录路线最近的端点，之后的每次点击都从那里向外绘制。按 Esc 取消。",
  "recovery.manual.pairInstructions":
    "在已记录的路线上点击两个点 — 它们之间的一段就是你要替换的部分。平移和缩放仍然可用；按 Esc 取消。",

  // RecoveryWorkspace
  "recovery.workspace.mapA11y": "找回地图与工具",
  "recovery.workspace.toolsLabel": "找回工具",
  "recovery.workspace.scrollCue": "预览与统计",
  "recovery.workspace.detailsA11y": "补全后的路线预览与统计",
  "recovery.workspace.detailsTitle": "补全后的路线 — 预览与统计",
  "recovery.workspace.detailsBlurb":
    "原始记录加上你找回的路段 — 总耗时保持不变，每个生成的点都标为估算。",
  "recovery.workspace.backToMap": "返回地图",
};
