/**
 * Simplified Chinese — reconstruction editor panels (draw editor, vertex list, time strategy, manual repairs, gap list) (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof reconstruction, string> once the keys land (the i18n
 * gate enforces completeness).
 *
 * Editor vocabulary (kept consistent with every other surface):
 * Draw/Move/Pan mode = 绘制/移动/平移模式， Curve pen = 曲线笔，
 * Roads/Footpaths/Straight lines = 道路/步行道/直线，
 * road snapping = 道路吸附， undo/redo = 撤销/重做。
 */

export const zhReconstruction: Record<string, string> = {
  // --- draw-editor-panel.tsx -------------------------------------------
  "drawEditor.title": "重建路线",
  "drawEditor.closeAria": "关闭编辑器（保留已绘制的路线）",
  "drawEditor.from": "起点",
  "drawEditor.fromOpen": "路线起点（开放）",
  "drawEditor.to": "终点",
  "drawEditor.toOpen": "开放 — 你的每次点击都会延伸路线",
  "drawEditor.openEndInstructions":
    "在地图上任意位置点击即可补上缺失的路线 — 每次点击都从 {coords} 延伸这条线。你看到的就是修复后的样子；不会有任何自动连接。",
  "drawEditor.pen.groupAria": "画笔",
  "drawEditor.pen.label": "画笔",
  "drawEditor.pen.default": "默认笔",
  "drawEditor.pen.defaultHint":
    "经典铅笔：逐个点击放置点 — 在弯道前后各点一下，线就会跟着走。",
  "drawEditor.pen.curve": "曲线笔",
  "drawEditor.pen.curveHint":
    "按住并拖动即可手绘曲线 — 应用会把你的笔迹平滑成路线。适用于所有路径样式；轻点一下仍会放置单个点。",
  "drawEditor.pen.curveActiveHint":
    "在地图上拖动绘制你的曲线 — 松开即放置。轻点一下仍会添加单个点。（C 切换画笔，D/M/P 切换模式。）",
  "drawEditor.pen.inactiveNote":
    "画笔只在绘制模式下可用 — 按 D（或铅笔工具）开始绘制。现在指针{action}。",
  "drawEditor.pen.actionDrag": "正在拖动你的点",
  "drawEditor.pen.actionNavigate": "正在平移地图",
  "drawEditor.pathStyle.groupAria": "路径样式",
  "drawEditor.pathStyle.label": "新点跟随",
  "drawEditor.pathStyle.perSegmentNote":
    "每一段保留绘制时的样式 — 随时可切换，你已放置的内容不会重绘。",
  "drawEditor.pathStyle.roads": "道路",
  "drawEditor.pathStyle.roadsHint":
    "线沿你的点之间的可行驶道路绘制 — 在弯道前后各点一下，弯道会自己画出来。",
  "drawEditor.pathStyle.footpaths": "步行道",
  "drawEditor.pathStyle.footpathsHint":
    "同样的思路，但走的是步行路径 — 小径、步道、台阶。更适合穿过公园或沿河的跑步。",
  "drawEditor.pathStyle.straight": "直线",
  "drawEditor.pathStyle.straightHint":
    "不进行道路吸附 — 下一段直接连接你的点。任何数据都不会离开浏览器。用曲线笔绘制的段保持平滑；切换样式不会重绘它们。",
  "drawEditor.pathStyle.privacyNote":
    "在弯道前后点击或拖动 — 线会吸附到你两点之间的道路上。道路/步行道只会把你放置的点发送到公共路由服务（OSRM / Valhalla）；你的 GPX 文件永远不会离开这个浏览器。曲线笔和直线完全在本地。",
  "drawEditor.roadStatus.finding": "正在寻找道路…",
  "drawEditor.roadStatus.unavailable":
    "道路跟随暂时不可用 — 恢复前先使用直线。",
  "drawEditor.roadStatus.dragHint":
    "拖动任意点即可调整 — 道路会自动重新寻找。",
  "drawEditor.roadStatus.switchToMove":
    "切换到移动模式（M）来拖动点 — 道路会自动重新寻找。",
  "drawEditor.consent.notice":
    "道路吸附会把你绘制的点发送到公共路由服务 — 绝不会发送你的文件。在你启用之前它一直处于关闭状态。",
  "drawEditor.consent.enable": "启用道路吸附…",
  "drawEditor.consent.onForSession": "道路吸附在本会话中已开启 —",
  "drawEditor.consent.turnItOff": "关闭它",
  "drawEditor.consent.anyTime": "随时可以。",
  "drawEditor.snap.button": "吸附到道路",
  "drawEditor.snap.offline":
    "离线 — 道路吸附需要网络；直线和曲线仍可使用。",
  "drawEditor.snap.needPoints":
    "先绘制至少一个点，再把整条线吸附到道路上。",
  "drawEditor.snap.failed":
    "无法将这条线匹配到道路 — 保持手绘的原样。",
  "drawEditor.snap.idle":
    "一次性把整条线匹配到道路 — 先预览，可撤销。",
  "drawEditor.snap.previewTitle": "道路预览",
  "drawEditor.snap.yourLine": "你的线",
  "drawEditor.snap.onTheRoad": "沿道路",
  "drawEditor.snap.apply": "应用 — 保留道路线",
  "drawEditor.snap.keepDrawing": "保留我的手绘",
  "drawEditor.snap.previewNote":
    "你看到的线就是你将得到的线。应用后，你绘制的点会被道路途经点替换 — 一步撤销即可找回你的手绘。",
  "drawEditor.vertexCount": "{count} / {max} 个点",
  "drawEditor.vertexCountLimit": "{count} / {max} 个点 — 已达上限",
  "drawEditor.straightWarning.title": "几乎是一条直线",
  "drawEditor.straightWarning.body":
    "每个点都几乎正好落在两个锚点之间。如果你确实是沿直线跑的，这没问题 — 否则请在地图上描出实际路线，让修复保持诚实。",
  "drawEditor.spacing.title":
    "完成后，应用会按此间距把你的绘图加密为均匀分布的点 — 有些平台需要规则的点。",
  "drawEditor.spacing.label": "重采样间距",
  "drawEditor.spacing.off": "关闭（仅保留点）",
  "drawEditor.spacing.every": "每 {meters} m",
  "drawEditor.snapToggle.title":
    "点击靠近已记录点时会精确落在该点上 — 便于把你的修复接入原路线。",
  "drawEditor.snapToggle.ariaLabel": "将绘制的点吸附到已记录的路线点",
  "drawEditor.snapToggle.label": "吸附到已记录点",
  "drawEditor.removeSpan": "移除修复段",
  "drawEditor.markSkipped": "标记为跳过",
  "drawEditor.done": "完成",

  // --- elevation-controls.tsx ------------------------------------------
  "elevation.groupAria": "海拔",
  "elevation.label": "海拔",
  "elevation.status.notFetched": "未估算",
  "elevation.status.fetching": "正在估算…",
  "elevation.status.complete": "已估算",
  "elevation.status.partial": "部分完成",
  "elevation.status.failed": "失败",
  "elevation.status.stale": "已过期",
  "elevation.estimateHintTitle": "估算海拔",
  "elevation.estimateHintDescription":
    "查询你所绘各点的地形海拔（{provider}，一个公共地形数据库）。需要主动选择：发送任何内容之前，会先显示一份说明，确切列出哪些数据会离开你的浏览器。",
  "elevation.estimateButton": "估算海拔",
  "elevation.progress":
    "正在获取 {provider} 地形 — {answered}/{sent} 个点…",
  "elevation.progressSampled":
    "正在获取 {provider} 地形 — {answered}/{sent} 个点（采样自 {total} 个）…",
  "elevation.staleNote":
    "估算之后路线发生了变化 — 重新估算之前，旧数值不会计入统计和导出。",
  "elevation.reEstimate": "重新估算",
  "elevation.tryAgain": "重试",
  "elevation.partialNote":
    "{sent} 个地形点已解析 {resolved} 个 — 空缺处在已解析的点之间插值。",

  // --- elevation-disclosure-dialog.tsx ----------------------------------
  "elevationDialog.title": "从 {provider} 估算海拔？",
  "elevationDialog.description":
    "海拔需要从地形数据库查询，因此部分数据必须离开此浏览器。以下是确切会离开的内容：",
  "elevationDialog.coordinateOne": "{count} 个坐标",
  "elevationDialog.coordinateMany": "{count} 个坐标",
  "elevationDialog.ofYourPoints": "来自你重建的点",
  "elevationDialog.sampledSuffix":
    "（采样自 {total} 个 — 其余部分由这些点插值得出）",
  "elevationDialog.everyPointSuffix": "（你绘制的每一个点）",
  "elevationDialog.willSendOne": "将以 {count} 个请求发送到",
  "elevationDialog.willSendMany": "将以 {count} 个请求发送到",
  "elevationDialog.sentenceEnd": "。",
  "elevationDialog.resultPrefix": "结果会被标记为",
  "elevationDialog.estimatedWord": "估算",
  "elevationDialog.resultSuffix":
    "出现在所有地方 — 统计、海拔剖面图以及导出文件的来源标记中都是如此。文件中已记录的海拔永远不会被修改。",
  "elevationDialog.cancel": "取消",
  "elevationDialog.sendOne": "发送 {count} 个点",
  "elevationDialog.sendMany": "发送 {count} 个点",

  // --- file-timing-card.tsx ---------------------------------------------
  "fileTiming.title": "无时间数据",
  "fileTiming.description":
    "此文件没有可用的时间戳。输入你已知的信息 — 由此推导出的每个数值都会标注为估算。",
  "fileTiming.startLabel": "活动开始时间（可选）",
  "fileTiming.totalLabel": "总时长（可选）",
  "fileTiming.totalFieldAria": "总时长（{unit}）",
  "fileTiming.noneEntered": "未输入总时长。",
  "fileTiming.entered": "已输入：{minutes} 分钟。",
  "fileTiming.note":
    "开始时间为周围没有时间戳的修复提供锚点；总时长决定整体配速。每个修复各自的时长在其编辑器中设置。导出功能（后续版本）会按距离把这些时间分摊到整个活动。",

  // --- gap-list.tsx ------------------------------------------------------
  "gapList.title": "检测到的缺口",
  "gapList.oneSite": "1 个候选修复位置",
  "gapList.manySites": "{count} 个候选修复位置",
  "gapList.empty": "当前阈值下未检测到缺口。",
  "gapList.beginPick": "仍觉得有问题？手动绘制修复",
  "gapList.editorOpenTitle": "修复编辑器已打开 — 请先完成或关闭它。",
  "gapList.from": "起点",
  "gapList.to": "终点",
  "gapList.noTime": "无时间",
  "gapList.rowAria": "缺口 {kind}，{severity}。{action}。",
  "gapList.deselect": "取消选择",
  "gapList.selectFocus": "选择并在地图上聚焦",
  "gapList.elapsed": "耗时 {duration}",
  "gapList.elapsedUnknown": "耗时未知",
  "gapList.straightLine": "直线距离：",
  "gapList.impliedSpeed": "· 隐含速度 {speed}",
  "gapList.editRoute": "编辑路线",
  "gapList.drawRoute": "绘制路线",

  // --- manual-duration-dialog.tsx ----------------------------------------
  "manualDuration.hours": "小时",
  "manualDuration.minutes": "分钟",
  "manualDuration.seconds": "秒",
  "manualDuration.gapTitle": "缺失的那段用了多长时间？",
  "manualDuration.fileTitle": "活动总时长",
  "manualDuration.gapDescription":
    "修复内部的时间戳将恰好跨越这一时长 — 已记录的时间戳绝不会被更改。",
  "manualDuration.fileDescription":
    "用于整体配速，导出时也用于把时间戳分摊到整个活动。",
  "manualDuration.error": "每个字段请输入 0 或更大的数字。",
  "manualDuration.cancel": "取消",
  "manualDuration.save": "保存时长",

  // --- manual-repairs-card.tsx -------------------------------------------
  "manualRepairs.title": "手动修复",
  "manualRepairs.description":
    "自己添加或重绘路线 — 检测只是一个辅助。",
  "manualRepairs.anchorLabel": "补上缺失的路线",
  "manualRepairs.anchorHint":
    "在地图上任意位置点击一次 — 修复会附着到已记录路线的最近一端，你的后续点击从那里开始、沿道路向外绘制缺失的路线。适用于手表从未记录的开头或结尾缺失。",
  "manualRepairs.pairLabel": "重绘一段",
  "manualRepairs.pairHint":
    "在已记录路线上点击两个点 — 两点之间的内容会被你的绘图替换。适用于手表把你实际跑过的绕行画成直线的情况。",
  "manualRepairs.empty":
    "还没有手动修复。在路线上的任何位置开始一个 — 手表画成直线的绕行、缺失的开头或结尾 — 即使没有检测到缺口也可以。",
  "manualRepairs.anchorInstructions":
    "在缺失路线大致经过的位置点击地图任意地方 — 修复会锚定到已记录路线的最近一端，之后的每次点击都从那里向外绘制。按 Esc 取消。",
  "manualRepairs.pairInstructions":
    "在已记录路线上点击两个点 — 你要替换的就是两点之间的那一段。平移和缩放仍可使用；按 Esc 取消。",
  "manualRepairs.cancelPicking": "取消拾取",
  "manualRepairs.toolsLocked":
    "修复编辑器已打开 — 开始另一个修复之前，请先完成或关闭它。",
  "manualRepairs.from": "起点",
  "manualRepairs.to": "终点",
  "manualRepairs.noTime": "无时间",
  "manualRepairs.spanMeters": "跨度 {distance}",
  "manualRepairs.openEndNote":
    "开放端 — 绘制的路线延伸到未记录的部分；不会再连接到其他地方。",
  "manualRepairs.editRoute": "编辑路线",
  "manualRepairs.drawRoute": "绘制路线",
  "manualRepairs.removeAria": "移除手动修复段 {id}",
  "manualRepairs.remove": "移除",

  // --- time-strategy-controls.tsx ----------------------------------------
  "timeStrategy.groupAria": "时间估算",
  "timeStrategy.label": "此修复的时间戳",
  "timeStrategy.byDistance": "按距离",
  "timeStrategy.byDistanceHint":
    "时间戳按每个点沿绘制路线的位置比例分布 — 均匀发力跑步的自然选择。",
  "timeStrategy.evenly": "均匀分布",
  "timeStrategy.evenlyHint":
    "时间戳按点数均匀分布，忽略距离 — 主要在关闭重采样时有用。",
  "timeStrategy.paceLabel": "按你的配速",
  "timeStrategy.paceHint":
    "应用会估算这一段用了多长时间：你绘制的距离除以你在此文件中实际保持的配速。无需输入任何数字 — 估算值随绘制实时更新。",
  "timeStrategy.manual": "手动",
  "timeStrategy.manualHint":
    "由你说明缺失的那段用了多长时间。即使与已记录的时间段不一致，修复的时间戳也遵循你的数值 — 分歧会被展示，绝不隐藏。",
  "timeStrategy.paceIntro": "这一段未被测量 — 应用估算它用时",
  "timeStrategy.atYourPace": "，按你记录的配速（",
  "timeStrategy.paceOutro": "）。继续绘制，估算会随之更新。",
  "timeStrategy.pausedFor": "手表曾暂停",
  "timeStrategy.pausedSuffix":
    "— 你绘制的路线点将恰好横跨这段时间，按均匀发力估算。",
  "timeStrategy.yourEstimatePrefix": "你的估算（",
  "timeStrategy.yourEstimateSuffix":
    "）替换此修复内部的已记录时间段 — 已记录的时间戳绝不会被更改。",
  "timeStrategy.beforeOnly":
    "此缺口只有起点有时间戳。输入缺失那段用了多长时间，内部时间会从起点向前分布。",
  "timeStrategy.afterOnly":
    "此缺口只有终点有时间戳。输入缺失那段用了多长时间，内部时间会从终点往回推算。",
  "timeStrategy.noBoundaries":
    "此缺口周围没有时间戳。输入一个时长来估算其内部",
  "timeStrategy.noBoundariesAnchored":
    " — 它将从你输入的活动开始时间起算（其在活动中的位置是一种假设）。",
  "timeStrategy.noBoundariesUnanchored":
    "（在为此文件输入活动开始时间之前，导出的点不带时间）。",
  "timeStrategy.editDuration": "编辑时长（{duration}）",
  "timeStrategy.addDuration": "添加时长",
  "timeStrategy.yourEstimate": "你的估算",
  "timeStrategy.paceEstimate": "配速估算",
  "timeStrategy.gapDuration": "缺口时长",
  "timeStrategy.estimatedPace": "估算配速",
  "timeStrategy.discrepancyTitle": "与已记录的时间段不一致",
  "timeStrategy.discrepancyPace":
    "配速估算（{estimate}）与此处文件显示的时间（{recorded}）不一致 — 这一段不在记录中。绘制的点遵循估算值；原始时间戳保持不变，差异会体现在统计中。",
  "timeStrategy.discrepancyManual":
    "你的时长（{duration}）与已记录的缺口（{recorded}）不一致。修复的时间戳遵循你的数值；原始时间戳保持不变，差异会体现在统计中。",

  // --- undo-redo-bar.tsx --------------------------------------------------
  "undoRedo.groupAria": "绘制历史",
  "undoRedo.undo": "撤销",
  "undoRedo.undoOne": "撤销（{count} 步）",
  "undoRedo.undoMany": "撤销（{count} 步）",
  "undoRedo.undoEmpty": "撤销（无可撤销）",
  "undoRedo.redo": "重做",
  "undoRedo.redoOne": "重做（{count} 步）",
  "undoRedo.redoMany": "重做（{count} 步）",
  "undoRedo.redoEmpty": "重做（无可重做）",
  "undoRedo.clear": "清除",
  "undoRedo.clearAria": "清除所有绘制的点",

  // --- vertex-entry-list.tsx ----------------------------------------------
  "vertexList.header":
    "已绘制的点 — 在地图上拖动它们，或直接输入：这里的每个字段都是画布的键盘孪生。",
  "vertexList.nudgeStep": "微调步长",
  "vertexList.nudgeStepTitle": "每按一次方向键，聚焦的点移动多远",
  "vertexList.stepOption": "{step} m",
  "vertexList.capNote":
    "已达点数上限（{max}）— 这条线已达到此工具允许的最大密度。",
  "vertexList.addByCoordinates": "按坐标添加点",
  "vertexList.addPoint": "添加点",
  "vertexList.insertAfter": "在点 {index} 之后插入",
  "vertexList.insertPoint": "插入点",
  "vertexList.latitude": "纬度",
  "vertexList.longitude": "经度",
  "vertexList.latPlaceholder": "52.5206",
  "vertexList.lonPlaceholder": "13.4055",
  "vertexList.fieldAriaLat": "{label} — 纬度",
  "vertexList.fieldAriaLon": "{label} — 经度",
  "vertexList.roundedNote":
    "超过 7 位小数 — 已四舍五入到 7 位（约一厘米，即导出精度）。",
  "vertexList.nudgeAria":
    "微调点 {index} — 方向键每次移动 {step} m，按 Shift 为十倍",
  "vertexList.nudgeTitle":
    "方向键每次微调此点 {step} m（Shift = ×10）。上/下 = 纬度，左/右 = 经度。",
  "vertexList.pointLatitude": "点 {index} 纬度",
  "vertexList.pointLongitude": "点 {index} 经度",
  "vertexList.snapped": "已吸附",
  "vertexList.snappedTitle":
    "已吸附到已记录点 {pointId} — 输入或微调会解除吸附",
  "vertexList.insertAfterAria": "在点 {index} 之后插入一个点",
  "vertexList.deleteAria": "删除点 {index}",

  "snap.profile.roads": "道路",
  "snap.profile.footpaths": "步道",
  "router.reason.scheme": "URL 必须以 https:// 开头（本地测试服务器可用 http://）。",
  "router.reason.parse": "这无法解析为 URL — 请检查主机名。",

  "elevation.privacyNote.openMeteo": "重建点的坐标会以请求 URL 的形式发送到 api.open-meteo.com（Open-Meteo 海拔 API）。只发送重建点 — 从不发送完整文件，从不发送已记录路线。该服务与任何 Web 服务器一样会记录请求。",
};
