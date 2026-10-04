/**
 * Simplified Chinese — planning tool surfaces (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof plan, string> once the keys land (the i18n
 * gate enforces completeness).
 */

export const zhPlan: Record<string, string> = {
  // PlanStartCard — the tool page's intake.
  "plan.start.title": "无需上传任何文件",
  "plan.start.intro": "地图就是输入 — 勾勒一条路线，读出它的数字。",
  "plan.start.estimateBullet":
    "为你绘制的道路和小径估算距离与海拔 — 随着线条成形实时更新。",
  "plan.start.paceBulletLead":
    "输入一个时间，看看它对应的配速 — 一个规划用的草稿本，",
  "plan.start.paceBulletBold": "不导出、不分享",
  "plan.start.paceBulletTail": "：任何东西都不会离开这个页面。",
  "plan.start.begin": "开始规划",

  // PlanGuideCard — the tools column's guide.
  "plan.guide.title": "规划一条路线",
  "plan.guide.intro": "勾勒你可能要走的地方 — 估算随绘制实时更新。",
  "plan.guide.contractLead":
    "点击落点（默认画笔），或按住拖动画出曲线（曲线笔）；切换到移动模式（M）可拖动任意一点。这是一个草稿本：",
  "plan.guide.contractBold": "不导出、不分享",
  "plan.guide.contractTail": " — 路线及其数字只留在这个页面上。",
  "plan.guide.locating": "定位中…",
  "plan.guide.findPosition": "找到我的位置",
  "plan.guide.clearTitleEmpty": "还没有绘制任何内容",
  "plan.guide.clearTitle": "移除所有点，重新开始",
  "plan.guide.clearRoute": "清除路线",
  "plan.guide.locateDenied":
    "位置不可用 — 权限被拒绝。请自行平移地图。",
  "plan.guide.locateUnavailable":
    "这台设备没有地理定位 — 请把地图平移到你的起点。",

  // PlanDrawPanel — the editor card.
  "plan.draw.penDefault": "默认画笔",
  "plan.draw.penDefaultHint":
    "经典的铅笔：逐个点击落点 — 在弯道前后各点一下，线条自会跟上。",
  "plan.draw.penCurve": "曲线笔",
  "plan.draw.penCurveHint":
    "按住并拖动即可手绘曲线 — 应用会把你的笔迹平滑成路线。适用于所有路径样式；轻点一下仍会放置单个点。",
  "plan.draw.deletePoint": "删除点 {index}",
  "plan.draw.title": "你的路线",
  "plan.draw.intro":
    "点击添加点 — 切换到移动模式（M）可拖动任意一点，一切皆可撤销。",
  "plan.draw.penLabel": "画笔",
  "plan.draw.curveHint":
    "在地图上拖动以绘制曲线 — 松开即放置。轻点一下仍会添加单个点。（C 切换画笔，D/M/P 切换模式。）",
  "plan.draw.penInactive":
    "画笔只在绘制模式下工作 — 按 D（或铅笔工具）开始绘制。现在指针正在{action}。",
  "plan.draw.pointerMoves": "拖动你的点",
  "plan.draw.pointerPans": "平移地图",
  "plan.draw.styleGroupLabel": "路径样式",
  "plan.draw.styleLabel": "新点将跟随",
  "plan.draw.styleNote":
    "每个段保留绘制时的样式 — 随时切换，已放置的内容不会重绘。",
  "plan.draw.styleRoads": "道路",
  "plan.draw.styleRoadsHint":
    "线条沿可通行的道路连接你的点 — 在弯道前后各点一下，弯道自会画出。",
  "plan.draw.styleFootpaths": "步道",
  "plan.draw.styleFootpathsHint":
    "同样的思路，但面向步行路线 — 小径、步道、台阶。更适合穿过公园或沿河的跑步。",
  "plan.draw.styleStraight": "直线",
  "plan.draw.styleStraightHint":
    "不做道路吸附 — 下一段直接连接你的点。任何数据都不会离开浏览器。用曲线笔绘制的段保持平滑；切换样式不会重绘它们。",
  "plan.draw.routingPending": "正在寻找道路…",
  "plan.draw.routingFailed": "道路跟随暂时不可用 — 恢复前先用直线。",
  "plan.draw.routingMove": "拖动任意点进行调整 — 道路会自动重新寻找。",
  "plan.draw.routingDraw":
    "切换到移动模式（M）拖动一个点 — 道路会自动重新寻找。",
  "plan.draw.consentNotice":
    "道路吸附会把你要绘制的点发送到公共路线服务 — 绝不会发送你的文件。在启用之前它保持关闭。",
  "plan.draw.consentEnable": "启用道路吸附…",
  "plan.draw.consentOnLead": "道路吸附在本会话中已开启 —",
  "plan.draw.turnItOff": "关闭它",
  "plan.draw.consentOnTail": "随时都可以。",
  "plan.draw.vertexCount": "{count} / {max} 个点",
  "plan.draw.vertexCap": " — 已达上限",
  "plan.draw.vertexListNote":
    "已绘制的点 — 切换到移动模式（M）可在地图上拖动任意一点，双击可移除。绘制模式（D）只添加点 — 铅笔从不拖动。",

  // PlanEstimatesCard — what the map reads back.
  "plan.estimates.title": "估算",
  "plan.estimates.intro": "路线所蕴含的信息 — 只读，不导出任何内容。",
  "plan.estimates.factsLabel": "路线概况",
  "plan.estimates.crowFliesEmpty": "先放置至少两个点，才能得到起点到终点的直线。",
  "plan.estimates.crowFliesNoDetour":
    "起点到终点的直线：{straight} — 路线全长 {distance}。",
  "plan.estimates.crowFliesDetour":
    "起点到终点的直线：{straight} — 路线绕行为其 {factor}×，全长 {distance}。",
  "plan.estimates.paceLabel": "由你输入的时间推算配速",
  "plan.estimates.goalTimeLabel": "目标时间",
  "plan.estimates.hours": "小时",
  "plan.estimates.minutes": "分钟",
  "plan.estimates.seconds": "秒",
  "plan.estimates.goalTimePart": "目标时间（{part}）",
  "plan.estimates.clearTitle": "清除已输入的时间",
  "plan.estimates.clear": "清除",
  "plan.estimates.plannedBadge": "规划值",
  "plan.estimates.paceNeedsRoute": "先在地图上绘制一条路线 — 配速需要一个距离。",
  "plan.estimates.paceNeedsTime": "在上方输入一个时间，即可看到它对应的配速。",
  "plan.estimates.paceNeedsPositiveTime": "时间需要大于零。",
  "plan.estimates.evenSplits": "均匀分段 — 每一个完整 {unit} 的落点：",
  "plan.estimates.kilometer": "公里",
  "plan.estimates.mile": "英里",
  "plan.estimates.splitTail": "最后 {distance}",
  "plan.estimates.splitTailEnds": "结束于 {time}",

  // PlanStudio — the composition root.
  "plan.studio.srNote":
    " 无文件 — 这条路线是你在勾勒的规划；不会导出或分享任何内容。",

  // PlanWorkspace — the layout's labels.
  "plan.workspace.sectionLabel": "规划路线地图与工具",
  "plan.workspace.toolsLabel": "规划工具",
};
