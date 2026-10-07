/**
 * Simplified Chinese — map legend, map controls, road-snap consent (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof map, string> once the keys land (the i18n
 * gate enforces completeness).
 */

export const zhMap: Record<string, string> = {
  /** map-canvas.tsx */
  "map.canvas.applicationAria": "已记录路线及其缺口的交互式地图",
  "map.canvas.loading": "地图加载中…",
  "map.canvas.unavailableTitle": "地图不可用",
  "map.canvas.unavailableBody":
    "此浏览器或设备无法渲染交互式地图（WebGL 不可用或被禁用）。所有检查与修复功能仍可在各面板中完整使用。",
  "map.canvas.recordedExtent": "已记录范围：{extent}",
  "map.canvas.extentUnknown": "未知",
  "map.canvas.extentRange": "纬度 {minLat} 至 {maxLat}，经度 {minLon} 至 {maxLon}",
  "map.canvas.offlineNotice":
    "底图瓦片不可用 — 你可能处于离线状态。已记录的路线和缺口仍会显示。",
  "map.canvas.retry": "重试",
  "map.canvas.emptyRoute": "没有可渲染的路线点 — 所有已记录坐标均已损坏。",
  "map.canvas.pointerModeAria": "指针模式：{state}",
  "map.canvas.modeStateDraw": "绘制中 — 点击切换到移动",
  "map.canvas.modeStateMove": "移动点中 — 点击切换到平移",
  "map.canvas.modeStatePan": "平移中 — 点击切换到绘制",
  "map.canvas.titleDrawCurve":
    "绘制模式，曲线笔 — 按住拖动以绘制曲线（D、C 切换笔型）",
  "map.canvas.titleDraw": "绘制模式 — 点击添加点（D）",
  "map.canvas.titleMove": "移动模式 — 拖动任意点（M）",
  "map.canvas.titlePan": "平移模式 — 拖动以导航（P）",
  "map.canvas.chipCurve": "曲线笔",
  "map.canvas.chipDraw": "绘制中",
  "map.canvas.chipMove": "移动中",
  "map.canvas.chipPan": "平移中",
  "map.canvas.pickAnchor":
    "点击缺失路线要走的位置 — 它会锚定到路线最近的端点 · 按 Esc 取消",
  "map.canvas.pickPair": "在已记录路线上选取两个点 — 按 Esc 取消",

  /** map-canvas.tsx — 阶段 25：路段草稿提示条。 */
  "map.canvas.segmentPick":
    "在轨迹上选取路段的起点和终点 — 按 Esc 取消",
  "map.canvas.segmentDraw": "已放置 {count} 个点",
  "map.canvas.segmentConfirm": "使用这些点",
  "map.canvas.segmentCancel": "取消",
  "map.canvas.srSummary":
    "地图面板：{segments}，{points}，{gaps}。已记录范围：{extent}。从检测到的缺口列表中选择缺口，即可在地图上高亮并聚焦它们。",
  "map.canvas.srSegmentsOne": "{count} 个段",
  "map.canvas.srSegmentsMany": "{count} 个段",
  "map.canvas.srPointsOne": "{count} 个可渲染的已记录点",
  "map.canvas.srPointsMany": "{count} 个可渲染的已记录点",
  "map.canvas.srGapsOne": "{count} 个检测到的缺口",
  "map.canvas.srGapsMany": "{count} 个检测到的缺口",
  "map.canvas.srReconstructionOne": " 重建进行中：{count} 个绘制点。",
  "map.canvas.srReconstructionMany": " 重建进行中：{count} 个绘制点。",

  /** map-legend.tsx */
  "map.legend.ghost": "原始轨迹（虚影 — 编辑前）",
  "map.legend.changed": "原始轨迹中被更改的部分",
  "map.legend.recorded": "已记录路线（实线墨色）",
  "map.legend.gapSpan": "缺口跨度（虚线，按严重程度着色）",
  "map.legend.gapBoundaries": "缺口边界（圆环 = 之前，圆点 = 之后）",
  "map.legend.repaired": "修复后路线（实线橙色）",
  "map.legend.footpath": "步道修复（虚线 — 用步道绘制）",
  "map.legend.openConnection": "开放连接（完成时闭合）",
  "map.legend.drawnPoint": "绘制的点（在移动模式中拖动）",
  "map.legend.toggleAria": "地图图例",
  "map.legend.toggleTitle": "地图线条的含义",
  "map.legend.toggle": "图例",
  "map.legend.heatmap": "你的已保存轨迹（热度密度）",

  /** map-toolbar.tsx */
  "map.toolbar.railAria": "地图工具",
  "map.toolbar.pointerGroupAria": "指针模式",
  "map.toolbar.drawTitle": "绘制模式",
  "map.toolbar.drawDescription":
    "点击地图任意位置添加点；双击一个点可将其删除。使用曲线笔（C）时，按住并拖动即可徒手绘制曲线。绘制时地图停止平移。",
  "map.toolbar.moveTitle": "移动模式",
  "map.toolbar.moveDescription":
    "调整你绘制的内容 — 每个点都会变成可以拖到任何地方的大抓取目标。在这里点击不会添加点，拖动空白处仍可平移地图。",
  "map.toolbar.panTitle": "平移模式",
  "map.toolbar.panDescription":
    "常规地图导航 — 拖动平移，双击缩放。切换到移动（M）可拖动已绘制的点；绘制新点需要绘制模式（D）。",
  "map.toolbar.basemapTitle": "底图",
  "map.toolbar.basemapDescription":
    "切换背景地图 — 矢量 OpenFreeMap 或经典 OSM 栅格。只获取瓦片，绝不获取你的 GPX。",
  "map.toolbar.basemapAria": "底图提供方",
  "map.toolbar.basemapTiles": "底图瓦片",
  "map.toolbar.basemapFootnote":
    "只有地图瓦片会从网络获取 — 绝不包含你的 GPX 数据。",
  "map.toolbar.fitTitle": "框选整个活动",
  "map.toolbar.fitDescription":
    "缩放回整条已记录路线 — 深入缺口查看后很方便。",
  "map.toolbar.fitAria": "将整个活动纳入视野",

  /** map-toolbar.tsx — 阶段 25：训练库热力图开关。 */
  "map.toolbar.heatmapTitle": "热力图",
  "map.toolbar.heatmapDescription":
    "所有已保存会话的轨迹化作路线之下的热度渐变 — 你去过的地方，全部在本设备上计算。",
  "map.toolbar.heatmapPending":
    "正在为已保存的会话建索引 — 每完成一条，热度就多一层。",
  "map.toolbar.heatmapAria": "切换已保存会话的热力图",

  /** draw-distance-badge.tsx */
  "map.drawBadge.vertexCount": "{vertices}/{max} 个点",
  "map.drawBadge.roadLengthNote": "道路长度，非直线距离",

  /** gap-highlight-overlay.tsx */
  "map.gapChip.elapsed": "总耗时",
  "map.gapChip.straightLine": "直线距离",
  "map.gapChip.impliedSpeed": "隐含速度",
  "map.gapChip.note": "标记之间的路径未被记录 — 将在后续步骤中绘制。",
  "map.gapChip.clearAria": "清除缺口选择",

  "map.announce.pointDeleted": "已删除一个点。",
};
