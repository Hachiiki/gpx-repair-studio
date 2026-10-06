/**
 * Simplified Chinese — fitness zones & metrics (Phase 23).
 *
 * Mirrors the English domain file key for key; `Record<MessageKey,
 * string>` makes a missing key a compile error before it is a test
 * failure. Param placeholders `{name}` match English's exactly (the
 * param-parity gate enforces it).
 *
 * Vocabulary follows the app's register: 心率 (heart rate), 功率
 * (power), 配速 (pace), 步频/踏频 → 转速 (cadence — kept unit-agnostic
 * as 转速 in copy), 区间 (zone/range), 估算 (estimate).
 */

export const zhZones: Record<string, string> = {
  /** ZonesCard. */
  "zones.title": "训练区间与指标",
  "zones.desc":
    "按导出时的路线统计各区间时间。区间形态沿用 Strava 公开的设定；边界数值是我们的，并在原地注明。",
  "zones.tab.hr": "心率",
  "zones.tab.power": "功率",
  "zones.tab.pace": "配速",
  "zones.tab.cadence": "踏频",

  /** The honesty reasons. */
  "zones.noMetrics.hr": "此文件没有心率数据 — 区间留空，不做猜测。",
  "zones.noMetrics.power": "此文件没有功率数据 — 区间留空，不做猜测。",
  "zones.needTiming": "区间耗时需要时间戳 — 此文件没有。",
  "zones.pace.raceUnset": "先录入一场近期比赛成绩，配速区间由它推导。",
  "zones.cadence.noData": "此文件没有踏频数据。",

  /** The zone tables. */
  "zones.colZone": "区间",
  "zones.colRange": "范围",
  "zones.colTime": "时间",
  "zones.colShare": "占比",
  "zones.range.openFloor": "低于 {value}",
  "zones.range.between": "{from}–{to}",
  "zones.range.openCeil": "{value} 及以上",
  "zones.range.paceFaster": "快于 {value}",

  /** Zone names. */
  "zones.name.hr.1": "耐力",
  "zones.name.hr.2": "中等",
  "zones.name.hr.3": "节奏",
  "zones.name.hr.4": "阈值",
  "zones.name.hr.5": "无氧",
  "zones.name.power.1": "恢复",
  "zones.name.power.2": "耐力",
  "zones.name.power.3": "节奏",
  "zones.name.power.4": "阈值",
  "zones.name.power.5": "最大摄氧量",
  "zones.name.power.6": "无氧",
  "zones.name.power.7": "神经肌肉",
  "zones.name.pace.1": "恢复",
  "zones.name.pace.2": "耐力",
  "zones.name.pace.3": "节奏",
  "zones.name.pace.4": "阈值",
  "zones.name.pace.5": "最大摄氧量",
  "zones.name.pace.6": "无氧",

  /** The reconciliation + no-data notes. */
  "zones.reconcile": "各区间的有效时间加上无数据时间，等于路线 {time} 的移动时间。",
  "zones.noDataNote":
    "其中 {time} 的移动时间没有{metric} — 重建路段不记录这些 — 已计数，绝不猜入任何区间。",
  "zones.metric.hr": "心率",
  "zones.metric.power": "功率",
  "zones.metric.cadence": "踏频",
  "zones.metric.pace": "可用的配速",
  "zones.cadence.desc":
    "按固定 10 单位的踏速区间统计时间。文件无法区分 rpm 与 spm，区间因此不带单位。",
  "zones.pace.gapNote": "配速区间按坡度调整配速（GAP）分桶 — 爬坡的强度按平地等效读取。",

  /** GAP. */
  "zones.gap.title": "坡度调整配速（GAP）",
  "zones.gap.value": "GAP {gap}，实际 {actual}",
  "zones.gap.note":
    "我们的模型：Minetti 坡度-能量曲线（Strava 的曲线不公开）。缺海拔的路段按平地计入并计数。",
  "zones.gap.noElevation": "GAP 需要海拔 — 此文件的点没有海拔，无法诚实地按坡度调整。",

  /** The opt-in calorie estimate. */
  "zones.calories.title": "能量（估算）",
  "zones.calories.power": "{kcal} 千卡 — 基于功率：{time} 内平均 {watts} W，按 24% 人体效率。",
  "zones.calories.metabolic":
    "{kcal} 千卡 — 跑步模型估算：{weight} kg 按 Minetti 成本曲线走完 {distance}。",
  "zones.calories.note": "自愿开启并全程披露：由具名模型得出的估算，不是测量值。",

  /** The per-split zone breakdown. */
  "zones.perSplit.show": "显示分段区间分布",
  "zones.perSplit.hide": "隐藏分段区间分布",
  "zones.perSplit.note": "每个分段在各区间的时间 — 与分段表使用同一套距离分摊规则。",
  "zones.perSplit.noData": "无数据",

  /** The race presets. */
  "zones.race.1mi": "1 英里",
  "zones.race.5k": "5 公里",
  "zones.race.10k": "10 公里",
  "zones.race.half": "半程马拉松",
  "zones.race.30k": "30 公里",
  "zones.race.marathon": "马拉松",

  /** MetricsChart. */
  "metrics.title": "心率、踏频与功率",
  "metrics.desc":
    "随距离绘制，叠加在海拔剖面之上 — 显示序列经轻度平滑（窗口 {window}）；文件未记录处留空。",
  "metrics.series.hr": "心率",
  "metrics.series.cad": "踏频",
  "metrics.series.power": "功率",
  "metrics.readout.at": "在 {distance} — {value} {unit}（海拔 {ele}）",
  "metrics.readout.noEle": "在 {distance} — {value} {unit}（无海拔）",
  "metrics.readout.noValue": "在 {distance} — 无{metric}记录",
  "metrics.ariaLabel":
    "{metric}随距离变化，自 {min} 至 {max}，叠加于海拔剖面之上。聚焦此图并使用方向键读取数值。{cursor}",
  "metrics.colAvg": "平均",
  "metrics.legend.ele": "海拔（背景）",
  "metrics.legend.metric": "{metric}",
  "metrics.showTable": "显示指标表",
  "metrics.hideTable": "隐藏指标表",

  /** ZoneSettings. */
  "zoneSettings.openButton": "区间与指标设置",
  "zoneSettings.note": "这里的每一项都是本地设置 — 不上传，不导出。",
  "zoneSettings.hr.title": "心率区间",
  "zoneSettings.hr.maxLabel": "最大心率",
  "zoneSettings.hr.maxHint":
    "默认 190 bpm（官方文档的兜底值）；220 − 年龄请自行输入。上限 230。修改后会重新推导边界。",
  "zoneSettings.hr.boundariesLabel": "区间边界（bpm）",
  "zoneSettings.hr.boundariesHint":
    "第 2–5 区间的下限，默认为最大心率的 60/70/80/90%。不得重叠；相邻区间至少相差 1。",
  "zoneSettings.power.title": "功率区间",
  "zoneSettings.power.ftpLabel": "FTP",
  "zoneSettings.power.ftpHint":
    "按 Coggan 百分比推导七个区间 — FTP 的 55/75/90/100/120/150%。默认 200 W，上限 500 W。",
  "zoneSettings.pace.title": "配速区间",
  "zoneSettings.pace.raceLabel": "近期比赛",
  "zoneSettings.pace.raceHint":
    "由一场比赛成绩推导六个区间 — Riegel 归一化到一小时配速，乘数为我们的，按 GAP 分桶。",
  "zoneSettings.stop.title": "停顿阈值",
  "zoneSettings.stop.label": "停顿速度",
  "zoneSettings.stop.hint":
    "慢于此速度的时间视为停顿。默认 0.5 m/s，你不改就不变；卡片会披露当前值。",
  "zoneSettings.calories.title": "卡路里估算",
  "zoneSettings.calories.enableLabel": "显示估算",
  "zoneSettings.calories.enableHint":
    "自愿开启。带功率的文件：功率按 24% 人体效率换算。其余：跑步模型。凡出现处均标注为估算。",
  "zoneSettings.calories.weightLabel": "体重",
  "zoneSettings.calories.weightHint": "kg — 仅保存在此浏览器的设置里，绝不导出。",
  "zoneSettings.calories.weightNeeded": "设置体重后才能使用跑步模型估算。",
  "zoneSettings.reset": "恢复默认设置",
  "zoneSettings.error.out-of-range": "超出范围 — 请查看提示。",
  "zoneSettings.error.not-ascending": "边界必须递增。",
  "zoneSettings.error.adjacent-gap": "相邻区间相差不足 1。",

  /** SplitsCard's GAP column. */
  "splits.colGap": "GAP",
  "splits.gapTitle": "坡度调整配速 — Minetti 曲线的平地等效值，我们的模型",
};
