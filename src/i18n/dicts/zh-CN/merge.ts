/**
 * Simplified Chinese — merge tool surfaces (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof merge, string> once the keys land (the i18n
 * gate enforces completeness).
 */

export const zhMerge: Record<string, string> = {
  // MergeIntake — the tool page's multi-file intake.
  "merge.intake.dropTitle": "把你的 GPX、TCX 或 FIT 文件拖到这里",
  "merge.intake.twoOrMore": "两个或更多 — 或",
  "merge.intake.browse": "点击浏览文件",
  "merge.intake.privacyLine": "文件只在本标签页内读取 — 不会上传到任何地方。",
  "merge.intake.noFilesHandy": "手边没有文件？",
  "merge.intake.trySamplePair": "试试一对示例文件",
  "merge.intake.collectedFiles": "已收集的文件",
  "merge.intake.reading": "读取中…",
  "merge.intake.filePoints": "{count} 个点",
  "merge.intake.fileSegment": "{count} 个段",
  "merge.intake.fileSegments": "{count} 个段",
  "merge.intake.fileWaypoint": "{count} 个途经点",
  "merge.intake.fileWaypoints": "{count} 个途经点",
  "merge.intake.removeFile": "移除 {fileName}",
  "merge.intake.combine": "合并为一条路线",
  "merge.intake.needTwo": "至少添加两个轨迹文件才能合并。",
  "merge.intake.oneMore": "还差一个文件 — 合并至少需要两个。",
  "merge.intake.joinOrder": "它们按上面的顺序拼接 — 下一页可以随意调整。",

  // MergeFilesCard — the arrangement list.
  "merge.arrangement.title": "本次合并的文件",
  "merge.arrangement.intro":
    "它们按此顺序拼接 — 从上到下，一条路线。可以调整、移除或添加文件；地图和导出会随之更新。",
  "merge.arrangement.orderLabel": "合并顺序",
  "merge.arrangement.position": "位置 {index}",
  "merge.arrangement.reading": "读取中…",
  "merge.arrangement.filePoints": "{count} 个点",
  "merge.arrangement.noTimestamps": "无时间戳",
  "merge.arrangement.moveUp": "上移 {fileName}",
  "merge.arrangement.moveDown": "下移 {fileName}",
  "merge.arrangement.showOnMap": "在地图上显示 {fileName}",
  "merge.arrangement.removeFile": "从合并中移除 {fileName}",
  "merge.arrangement.addFiles": "添加文件",
  "merge.arrangement.sortByTime": "按开始时间排序",

  // MergeDetailsCard — the merged identity.
  "merge.details.title": "合并后的活动",
  "merge.details.intro":
    "一条轨迹、一个名称 — 这就是 Strava 等平台为合并文件显示的内容。",
  "merge.details.nameLabel": "活动名称",
  "merge.details.namePlaceholder": "例如：周末双份",
  "merge.details.nameHint":
    "写入文件的元数据和它的单条轨迹。留空则为未命名文件，如同手表的原始导出。",
  "merge.details.factFiles": "合并的文件数",
  "merge.details.factPoints": "已记录的点",
  "merge.details.factDistance": "距离",
  "merge.details.factWaypoints": "途经点",

  // MergeExportCard — the download + honesty.
  "merge.export.title": "下载合并后的文件",
  "merge.export.introOne":
    "一条轨迹：来自 {count} 个文件的全部 {points} 个点，按上面的顺序，使用你选择的名称。",
  "merge.export.introMany":
    "一条轨迹：来自 {count} 个文件的全部 {points} 个点，按上面的顺序，使用你选择的名称。",
  "merge.export.download": "下载 .gpx",
  "merge.export.needTwo": "合并至少需要两个文件 — 请在上方再添加一个。",
  "merge.export.honesty":
    "每个已记录的点、海拔、时间戳和途经点都会原样保留。单文件的元数据（作者、版权、各轨迹描述）不会保留 — 多个文件的这些内容无法诚实地合并。",

  // MergeStudio — the composition root's labels.
  "merge.studio.sectionLabel": "合并地图与文件编排",
  "merge.studio.toolsLabel": "合并工具",
  "merge.studio.detailsTitle": "合并后的记录",
  "merge.studio.detailsIntro":
    "应用对合并文件所知的一切 — 每个点都从来源原样保留，按你设定的顺序。",
  "merge.studio.scrollCueLabel": "统计与文件详情",
  "merge.studio.srNote": "这是 {count} 段记录合并而成的路线。",
  "merge.studio.defaultFileName": "合并后的记录",
  "merge.studio.emptyDetails":
    "还没有可合并的内容 — 添加至少两个文件后，合并路线、它的统计和导出会显示在这里。",

  // ShareMergeDialog — the Share gate.
  "merge.shareDialog.title": "分享你的合并记录",
  "merge.shareDialog.intro":
    "接下来会发生这些 — 无论怎么选，都不会有任何数据离开这个浏览器。",
  "merge.shareDialog.step1Lead": "你的合并 GPX 现在就会下载",
  "merge.shareDialog.step1Mid": "—",
  "merge.shareDialog.step1Tail":
    "，与下载按钮生成的文件完全相同。可以导入 Strava 或任何 GPX 平台。",
  "merge.shareDialog.step2Lead": "分享卡片会打开",
  "merge.shareDialog.step2Mid": "— 你的合并路线以 Strava 风格的图形呈现，带着",
  "merge.shareDialog.step2Fallback": "合并文件的距离、配速和时间",
  "merge.shareDialog.step2Tail": "。在那里可以下载为 PNG。",
  "merge.shareDialog.honesty":
    "每个已记录的点都保持来源记录时的原样 — 合并只重排文件，从不改动数值。你可以从分享视图直接回到文件编排。",
  "merge.shareDialog.confirm": "下载 GPX 并打开分享卡片",
  "merge.shareDialog.cancel": "暂不",

  // MergeShareView — the share card view.
  "merge.shareView.title": "分享卡片",
  "merge.shareView.intro":
    "一张 Strava 风格的合并记录图形 — 透明背景，由合并路线及其携带的时间渲染而成。",
  "merge.shareView.transparentNote": "透明背景 — 以深色展示",
  "merge.shareView.toolsLabel": "分享卡片工具",
  "merge.shareView.summaryTitle": "卡片上有什么",
  "merge.shareView.summaryIntro": "与统计面板相同的数字 — 合并文件所携带的内容。",
  "merge.shareView.statDistance": "距离",
  "merge.shareView.statPace": "配速",
  "merge.shareView.statTime": "时间",
  "merge.shareView.pngResolution": "PNG 分辨率",
  "merge.shareView.scale1": "1×",
  "merge.shareView.scale1Detail": "1080 × 1920",
  "merge.shareView.scale2": "2×",
  "merge.shareView.scale2Detail": "2160 × 3840",
  "merge.shareView.downloadPng": "下载 PNG",
  "merge.shareView.backToArrangement": "回到文件编排",
  "merge.shareView.numbersTitle": "这些数字的含义",
  "merge.shareView.numbersIntro": "一段如实标注的合并记录。",

  "merge.shareDialog.andGlue": "，以及 ",
};
