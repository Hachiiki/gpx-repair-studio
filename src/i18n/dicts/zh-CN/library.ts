/**
 * The library dictionary, Simplified Chinese (Phase 24 — 训练库：卡片、
 * 个人纪录、趋势、Riegel 预测).
 *
 * Mirrors the English domain file key for key; `Record<MessageKey,
 * string>` makes a missing key a compile error before it is a test
 * failure. Param placeholders `{name}` match English's exactly (the
 * param-parity gate enforces it).
 *
 * Vocabulary: 纪录 for records, 最佳成绩 for best efforts, 趋势 for
 * trends, 健身/疲劳/状态 for fitness/fatigue/form (运动科学常用译法),
 * 估算 stays "estimate", 补画路段 for drawn-in repair stretches.
 */



export const zhLibrary: Record<string, string> = {
  // -- Tabs ------------------------------------------------------------
  "library.tab.sessions": "会话",
  "library.tab.records": "个人纪录",
  "library.tab.trends": "趋势",
  "library.tab.sessionsAria": "会话架",
  "library.tab.recordsAria": "个人纪录",
  "library.tab.trendsAria": "训练趋势",

  // -- The library cards (24.1) ----------------------------------------
  "library.card.distance": "距离",
  "library.card.time": "移动时间",
  "library.card.pace": "配速",
  "library.card.gain": "爬升",
  "library.card.avgHr": "平均心率",
  "library.card.planned":
    "规划路线 — 不是记录文件，不参与训练库统计。",
  "library.card.pending": "正在索引…",
  "library.card.failed": "无法重新读取此文件 — 它的数字暂不进入训练库。",
  "library.card.repaired": "含 {distance} 补画路段",
  "library.card.activityDate": "活动日期",
  "library.sort.label": "排序",
  "library.sort.recent": "最近优先",
  "library.sort.oldest": "最早优先",
  "library.sort.name": "名称",
  "library.sort.distance": "距离最长",
  "library.sort.duration": "移动时间最长",
  "library.filter.label": "按名称筛选",
  "library.filter.placeholder": "筛选会话…",
  "library.selectAria": "选择 {name}",
  "library.selectAll": "全选",
  "library.selectAllAria": "选中所有可见会话",
  "library.bulk.count": "已选 {count} 项",
  "library.bulk.delete": "删除所选",
  "library.bulk.deleteConfirm": "删除 {count} 个会话？此操作无法撤销。",
  "library.bulk.deleteYes": "删除",
  "library.bulk.deleteNo": "保留",
  "library.bulk.export": "导出所选",
  "library.indexing": "正在索引 {count} 个会话…",
  "library.csv.button": "导出 CSV",
  "library.csv.ready": "训练库 CSV 已生成（{count} 个会话）。",
  "library.csv.empty": "还没有索引 — 先保存一个会话。",

  // -- Records (24.2) ----------------------------------------------------
  "records.title": "个人纪录",
  "records.desc":
    "在设备上由已保存会话计算。最长距离、最长时间与最大爬升只读记录数据；最佳成绩按总耗时规则统计。",
  "records.farthest": "最远",
  "records.longest": "最久",
  "records.mostGain": "最大爬升",
  "records.none": "还没有索引的会话 — 保存一个文件类会话后重新打开训练库。",
  "records.untimedNote": "{count} 个会话没有时间戳，无法创造时间纪录。",
  "records.ladderTitle": "最佳成绩",
  "records.colDistance": "距离",
  "records.colBest": "最佳",
  "records.colWhen": "时间",
  "records.colSession": "会话",
  "records.effort.interpolated": "含插值标记",
  "records.effort.rank": "第 {rank} 名",
  "records.rules":
    "总耗时口径 — 计时不停止，GPS 中断也计入。经过补画路段的成绩被排除：补出来的纪录不是纪录。每个距离取生涯前三；插值标记会被标注。",

  // The ladder's names (Strava 词表).
  "records.dist.400m": "400 米",
  "records.dist.1k": "1 公里",
  "records.dist.halfmi": "½ 英里",
  "records.dist.1mi": "1 英里",
  "records.dist.2mi": "2 英里",
  "records.dist.5k": "5 公里",
  "records.dist.10k": "10 公里",
  "records.dist.15k": "15 公里",
  "records.dist.10mi": "10 英里",
  "records.dist.20k": "20 公里",
  "records.dist.hm": "半程马拉松",
  "records.dist.30k": "30 公里",
  "records.dist.marathon": "马拉松",
  "records.dist.50k": "50 公里",

  // -- Riegel predictions (24.5) -----------------------------------------
  "riegel.title": "比赛时间预测",
  "riegel.desc":
    "自愿开启，并且如实说明它是什么：基于你最佳成绩的 Riegel 经典指数模型，本地计算。没有群体数据，不上传。",
  "riegel.enable": "显示预测",
  "riegel.seedLabel": "以你的最佳成绩为基准",
  "riegel.colDistance": "距离",
  "riegel.colPredicted": "预测",
  "riegel.formula": "t₂ = t₁ · (d₂ / d₁)^1.06 — Riegel 指数模型。",
  "riegel.caveat":
    "这是一条曲线，不是教练：公式对地形、天气和你的训练一无所知，并如实说明。距基准越远，偏差越大。",
  "riegel.noSeed": "还没有可以用于预测的最佳成绩。",

  // -- Trends (24.3) ------------------------------------------------------
  "trends.title": "训练趋势",
  "trends.desc":
    "按周/按月的运动量，以及健身-疲劳曲线 — 仅由带日期的会话在设备上计算。",
  "trends.volume.title": "运动量",
  "trends.volume.window": "最近 {count} 个{period}，最多显示 {max} 个。",
  "trends.volume.windowOne": "最近 1 个{period}，最多显示 {max} 个。",
  "trends.noun.week": "周",
  "trends.noun.weeks": "周",
  "trends.noun.month": "月",
  "trends.noun.months": "月",
  "trends.granularity.week": "按周",
  "trends.granularity.month": "按月",
  "trends.metric.distance": "距离",
  "trends.metric.time": "时间",
  "trends.empty": "还没有带日期的会话 — 会话需要时间戳才能进入日历。",
  "trends.readout.volume": "{label}：{distance}，{time}，{activities} 次活动",
  "trends.readout.fitness": "{date}：健身 {ctl}，疲劳 {atl}，状态 {form}",
  "trends.table.show": "显示表格",
  "trends.table.hide": "隐藏表格",
  "trends.table.note": "同一序列的文字版 — {count} 个{period}。",
  "trends.col.period": "时段",
  "trends.col.distance": "距离",
  "trends.col.time": "移动时间",
  "trends.col.activities": "活动数",
  "trends.col.day": "日期",
  "trends.col.ctl": "健身",
  "trends.col.atl": "疲劳",
  "trends.col.form": "状态",
  "trends.fitness.title": "健身与疲劳",
  "trends.fitness.desc":
    "Banister（1975）脉冲-响应模型，按 Coggan 的用法：健身是每日移动时间的 42 天滚动平均，疲劳是 7 天，状态为两者之差。",
  "trends.fitness.gated":
    "健身曲线需要更多历史才有意义 — 至少 {days} 天、{sessions} 个会话。你目前有 {spanDays} 天、{sessionCount} 个会话。",
  "trends.fitness.legend.fitness": "健身（42 天）",
  "trends.fitness.legend.fatigue": "疲劳（7 天）",
  "trends.fitness.legend.form": "状态（差值）",
  "trends.fitness.notAdvice": "这是运动量模型，不是训练建议。",
  "trends.fitness.untimed": "{count} 个会话没有时间戳，不参与模型。",
  "trends.fitness.empty": "模型从你第一个活动的零负荷起步 — 在此之前它一无所知。",
  "trends.aria.volume": "按周运动量柱状图，共 {count} 个时段，距离从 {min} 到 {max}",
  "trends.aria.fitness": "健身与疲劳曲线，跨度 {days} 天，健身从 0 到 {max}",
  "trends.aria.cursor": " 光标：{readout}。",
};
