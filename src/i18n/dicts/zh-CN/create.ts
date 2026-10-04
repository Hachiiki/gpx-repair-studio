/**
 * Simplified Chinese — create-from-stats surfaces (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof create, string> once the keys land (the i18n
 * gate enforces completeness).
 */

export const zhCreate: Record<string, string> = {
  // ActivityStatsForm
  "create.statsForm.title": "活动统计",
  "create.statsForm.blurb":
    "你的手表记录了什么 — 那次地图丢失的训练的距离、配速和时间。",
  "create.statsForm.example": "使用示例数字",
  "create.statsForm.units": "单位",
  "create.statsForm.distance": "距离",
  "create.statsForm.distanceA11y": "你的手表记录的距离",
  "create.statsForm.pace": "平均配速",
  "create.statsForm.paceHint": "(分钟：秒 /{unit})",
  "create.statsForm.paceMinutesA11y": "每单位配速 — 分钟",
  "create.statsForm.paceSecondsA11y": "每单位配速 — 秒",
  "create.statsForm.time": "总时间",
  "create.statsForm.timeHint": "(时：分：秒)",
  "create.statsForm.hoursA11y": "总时间 — 小时",
  "create.statsForm.minutesA11y": "总时间 — 分钟",
  "create.statsForm.secondsA11y": "总时间 — 秒",
  "create.statsForm.start": "开始时间",
  "create.statsForm.startHint": "— 平台用它来定位这次活动",
  "create.statsForm.begin": "绘制路线",
  "create.statsForm.noFile": "无需文件 — 一切都在你的浏览器中完成。",

  // ConsistencyNote
  "create.consistency.rounding":
    "你输入的统计数字因四舍五入略有出入 — 路线将按你记录的数值生成。",
  "create.consistency.mismatch":
    "你的时间、距离和配速不太一致 — 距离 × 配速得出 {implied}，你输入的是 {entered}。请检查是否有笔误；路线将按你记录的数值生成。",

  // CreateGuideCard
  "create.guide.title": "绘制你的路线",
  "create.guide.blurb":
    "这是整次活动 — 没有记录可以依靠。你画成什么样，文件就是什么样。",
  "create.guide.recapTitle": "你的手表记录了",
  "create.guide.recapDistance": "距离",
  "create.guide.recapTime": "时间",
  "create.guide.recapPace": "配速",
  "create.guide.instructionsLead": "在地图上找到你的起点（或使用",
  "create.guide.locate": "定位我的位置",
  "create.guide.instructionsTail":
    "），然后逐点点击放置路线 — 线条会沿真实道路连接你的点击。用 P 键或模式芯片平移；用 D 绘制。",
  "create.guide.instructionsMore":
    "继续点击延伸路线。切换到移动（M）拖动任意点，双击删除它，线条与你实际走过的路一致时即可完成。",
  "create.guide.locating": "正在定位…",
  "create.guide.locateDenied": "定位被拒绝 — 请改为平移和缩放到你的起点。",
  "create.guide.locateUnavailable":
    "此浏览器不支持定位 — 请改为平移和缩放到你的起点。",
  "create.guide.privacyNote":
    "道路跟随只把你点击的点发送到公共路由服务（OSRM / Valhalla）；其他任何内容都不会离开这个浏览器。",
  "create.guide.backToStats": "返回统计",

  // RouteDrawPanel
  "create.drawPanel.title": "你的路线",
  "create.drawPanel.blurb":
    "点击添加点 — 切换到移动（M）可拖动任意点，一切皆可撤销。",
  "create.drawPanel.penGroup": "画笔",
  "create.drawPanel.penDefault": "默认画笔",
  "create.drawPanel.penDefaultHint":
    "经典铅笔：逐个点击放置点 — 在弯道前后各点一下，线条自会跟随。",
  "create.drawPanel.penCurve": "曲线笔",
  "create.drawPanel.penCurveHint":
    "按住并拖动即可徒手画曲线 — 应用会把你的笔迹平滑成路线。适用于所有路径样式；轻点一下仍会放置单个点。",
  "create.drawPanel.curveHint":
    "在地图上拖动绘制你的曲线 — 松开即放置。轻点一下仍会添加单个点。（C 切换画笔，D/M/P 切换模式。）",
  "create.drawPanel.penInactiveLead":
    "画笔只在绘制模式下可用 — 按 D（或铅笔工具）开始绘制。现在指针",
  "create.drawPanel.pointerDrags": "正在拖动你的点",
  "create.drawPanel.pointerNavigates": "正在浏览地图",
  "create.drawPanel.pathStyleGroup": "路径样式",
  "create.drawPanel.newPointsFollow": "新点将跟随",
  "create.drawPanel.pathStyleNote":
    "每一段保留它绘制时的样式 — 随时切换，已放置的任何内容都不会重画。",
  "create.drawPanel.roads": "道路",
  "create.drawPanel.roadsHint":
    "线条沿可行驶道路连接你的点 — 在弯道前后各点一下，弯道自会画出。",
  "create.drawPanel.footpaths": "步道",
  "create.drawPanel.footpathsHint":
    "同样的思路，但走行人道路 — 小径、步道、台阶。更适合穿过公园或沿河的跑步。",
  "create.drawPanel.straight": "直线",
  "create.drawPanel.straightHint":
    "不进行道路吸附 — 下一段直接连接你的点。没有任何内容离开浏览器。用曲线笔绘制的段保持平滑；切换样式不会重画它们。",
  "create.drawPanel.findingRoad": "正在寻找道路…",
  "create.drawPanel.roadUnavailable": "道路跟随暂不可用 — 恢复前先用直线。",
  "create.drawPanel.dragAdjust": "拖动任意点进行调整 — 道路会自动重新寻找。",
  "create.drawPanel.switchToDrag":
    "切换到移动（M）拖动某个点 — 道路会自动重新寻找。",
  "create.drawPanel.consentNotice":
    "道路吸附会把你绘制的点发送到公共路由服务 — 绝不会发送你的文件。在你启用之前它一直关闭。",
  "create.drawPanel.consentEnable": "启用道路吸附…",
  "create.drawPanel.consentOnLead": "本次会话中道路吸附已开启 — 随时可以",
  "create.drawPanel.turnItOff": "关闭它",
  "create.drawPanel.consentOnTail": "。",
  "create.drawPanel.compareFirst": "点击地图放置你的第一个点。",
  "create.drawPanel.compareFirstLeg": "继续 — 再加一个点就构成第一段。",
  "create.drawPanel.compareMatches": "与你记录的距离一致。",
  "create.drawPanel.compareLonger":
    "比你记录的 {recorded} 长 {difference} — 文件将以你绘制的为准。",
  "create.drawPanel.compareShorter":
    "比你记录的 {recorded} 短 {difference} — 文件将以你绘制的为准。",
  "create.drawPanel.vertexCount": "{count} / {max} 个点",
  "create.drawPanel.vertexLimit": " — 已达上限",
  "create.drawPanel.spacingLabel": "轨迹点间距",
  "create.drawPanel.spacingHint":
    "轨迹会按此间距生成均匀分布的点 — 有些平台需要规则的点，而不只是你的点击。",
  "create.drawPanel.spacingOff": "关闭（仅保留点击的点）",
  "create.drawPanel.spacingEvery": "每 {meters} {unit}",
  "create.drawPanel.drawnPointsNote":
    "已绘制的点 — 切换到移动（M）在地图上拖动任意一点，双击删除。绘制（D）只添加点 — 铅笔从不拖动。",
  "create.drawPanel.deletePoint": "删除点 {index}",
  "create.drawPanel.finish": "完成路线",
  "create.drawPanel.finishTitle": "结束绘制并查看结果",
  "create.drawPanel.finishDisabledTitle": "至少放置两个点才能完成路线",

  // RouteReviewCard
  "create.review.title": "查看与导出",
  "create.review.blurb":
    "你绘制的路线决定文件的距离 — 你记录的时间始终不变。",
  "create.review.recordedDistance": "记录的距离",
  "create.review.drawnRoute": "绘制的路线",
  "create.review.difference": "差值",
  "create.review.matchA11y": "改用我手表的距离，而不是绘制路线的",
  "create.review.matchTitle": "改用我手表的距离",
  "create.review.matchBody":
    "— 绘制的形状会均匀缩放到你记录的 {recorded}（×{scale}）。保持关闭，文件就原样采用绘制路线的 {drawn}。",
  "create.review.extremeTitle": "差距很大",
  "create.review.extremeBody":
    "相差 {percent}% — 通常是公里/英里搞混，或绘制中漏画了一圈。建议返回检查你的输入，或编辑路线使其与你实际走过的路一致。",
  "create.review.matches": "绘制的路线与你记录的距离一致 — 无需调和。",
  "create.review.summaryTitle": "文件将包含",
  "create.review.distance": "距离",
  "create.review.time": "时间",
  "create.review.avgPace": "平均配速",
  "create.review.start": "开始时间",
  "create.review.route": "路线",
  "create.review.routeValue": "手动重建 — {count} 个点",
  "create.review.elevation": "海拔",
  "create.review.timestampsNote":
    "时间戳为估算 — 你记录的总时间，沿路线按费力程度均匀分布。",
  "create.review.elevationNote":
    "海拔根据 {provider} 地形估算，并在文件中标为估算。",
  "create.review.noElevationNote":
    "不包含海拔：手表没有记录，也不会凭空捏造。",
  "create.review.export": "导出 GPX",
  "create.review.downloaded": "已下载 {file} — 可导入 Strava 或任何 GPX 平台。",
  "create.review.editRoute": "编辑路线",

  // ReconcileDistanceDialog
  "create.reconcile.title": "绘制路线的距离与你输入的不一致",
  "create.reconcile.watchRecorded": "你的手表记录了",
  "create.reconcile.butDrawn": "，但你绘制的路线测得",
  "create.reconcile.shorter": "短了",
  "create.reconcile.longer": "长了",
  "create.reconcile.difference": "— {direction} {percent}%。",
  "create.reconcile.bodyLead": "文件将使用",
  "create.reconcile.drawnDistance": "绘制路线的距离",
  "create.reconcile.bodyMid":
    "— GPS 手表常常误判距离，而你描的路线通常更接近实际。你的总时间",
  "create.reconcile.bodyTail":
    "将原样保留，平均配速会按整条路线重新计算",
  "create.reconcile.bodyTailWithPace":
    "将原样保留，平均配速会按整条路线重新计算（{pace} {unit}）",
  "create.reconcile.extremeHint":
    "如此大的差距通常意味着公里/英里搞混，或绘制中漏画了一圈 — 请仔细检查你的输入，或在导出前关闭此窗口并编辑路线。",
  "create.reconcile.useDrawn": "使用绘制距离（{distance}）",
  "create.reconcile.useRecorded": "使用我手表的距离（{distance}）",

  // CreateShareView
  "create.shareView.title": "分享卡片",
  "create.shareView.blurb":
    "一张 Strava 风格的创建活动图形 — 透明背景，由你绘制的路线和你记录的时间渲染而成。",
  "create.shareView.stageNote": "透明背景 — 以深色背景展示",
  "create.shareView.toolsA11y": "分享卡片工具",
  "create.shareView.cardTitle": "卡片上显示",
  "create.shareView.cardBlurb": "与查看卡片相同的数字 — 文件将包含的内容。",
  "create.shareView.distance": "距离",
  "create.shareView.pace": "配速",
  "create.shareView.time": "时间",
  "create.shareView.pngResolution": "PNG 分辨率",
  "create.shareView.scale1": "1×",
  "create.shareView.scale1Detail": "1080 × 1920",
  "create.shareView.scale2": "2×",
  "create.shareView.scale2Detail": "2160 × 3840",
  "create.shareView.download": "下载 PNG",
  "create.shareView.back": "返回路线查看",
  "create.shareView.meaningTitle": "这些数字的含义",
  "create.shareView.meaningBlurb": "一次如实标注的创建活动。",

  // CreateStudio
  "create.studio.srNote":
    "没有已记录的路线 — 此活动完全根据你输入的统计数字从零绘制。",

  // CreateWorkspace
  "create.workspace.sectionA11y": "创建路线地图与工具",
  "create.workspace.toolsLabel": "创建工具",

  // ShareCreateDialog
  "create.shareDialog.title": "分享你创建的活动",
  "create.shareDialog.blurb":
    "接下来会发生什么，一目了然 — 无论怎么选，都不会有任何内容离开这个浏览器。",
  "create.shareDialog.step1Title": "你的 GPX 现在就会下载",
  "create.shareDialog.step1Tail":
    "，与导出按钮生成的是同一个文件{elevation}。可导入 Strava 或任何 GPX 平台。",
  "create.shareDialog.inclElevation": "，包含估算的海拔",
  "create.shareDialog.step2Title": "分享卡片会打开",
  "create.shareDialog.step2Lead": "— 你绘制的路线呈现在 Strava 风格的图形中，带有",
  "create.shareDialog.trioFallback": "文件的距离、配速和时间",
  "create.shareDialog.step2Tail": "。可在那里下载为 PNG。",
  "create.shareDialog.footer":
    "文件中的每个点都标记为重建 — 平台会知道这条路线是重建的，不是记录的。你可以从分享视图直接回到这个查看页面。",
  "create.shareDialog.confirm": "下载 GPX 并打开分享卡片",
  "create.shareDialog.cancel": "暂不",

  "create.shareDialog.andGlue": "，以及 ",
};
