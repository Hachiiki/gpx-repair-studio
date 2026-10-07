/**
 * 路段词典（阶段 25 — 个人路段：创建入口、成绩表、规则披露）。
 * zh-CN 与英文逐键镜像（i18n 单元门禁）。
 */

export const zhSegments: Record<string, string> = {
  // -- 标签页 + 界面 ----------------------------------------------------
  "segments.title": "个人路段",
  "segments.desc":
    "你反复骑行的路段，与自己计时。在地图上定义一条；每条覆盖它的已保存会话都会成为一次成绩，全部在本设备上计算。",

  // -- 创建入口 ----------------------------------------------------------
  "segments.newStretch": "从已加载的轨迹",
  "segments.newDraw": "在地图上绘制",
  "segments.authorNeedsTrack":
    "两个入口都需要修复工作台的地图 — 先加载一个文件，再回到这里。",
  "segments.sourceStretch": "从轨迹上选取",
  "segments.sourceDrawn": "手绘",

  // -- 命名对话框 --------------------------------------------------------
  "segments.nameTitle": "为这条路段命名",
  "segments.nameDesc":
    "{length}，{source}。匹配器会在所有已保存会话中寻找这个起点和终点。",
  "segments.nameLabel": "路段名称",
  "segments.namePlaceholder": "晨间爬坡、河畔绕圈…",
  "segments.nameSave": "保存路段",
  "segments.nameCancel": "放弃",

  // -- 成绩表 -------------------------------------------------------------
  "segments.noEfforts":
    "还没有已保存会话覆盖这条路段 — 出现时会自动生成成绩。",
  "segments.effortTime": "时间",
  "segments.effortSession": "会话",
  "segments.effortDate": "日期",
  "segments.flaggedOnly": "只有被标记的成绩 — 无个人纪录",
  "segments.flaggedTag": "包含绘制的修复",
  "segments.flaggedReason":
    "这次成绩的一部分经过重建点 — 仅作参考展示，绝不计为纪录。",
  "segments.asOf": "成绩计算于 {date} — 新保存后可重新运行。",
  "segments.matching": "正在匹配 {done}/{total} 个会话…",
  "segments.rematch": "重新匹配",

  // -- 规则披露 -----------------------------------------------------------
  "segments.rulesTitle": "成绩如何匹配",
  "segments.ruleElapsed":
    "流逝时间 — 时钟不会停止。路段成绩从经过起点到经过终点计时。",
  "segments.ruleTolerance":
    "距锚点 {meters} 米以内即视为经过 — 轮次间的 GPS 漂移在预期之内；平行街道不会匹配。",
  "segments.ruleHonesty":
    "仅计已记录数据：触碰绘制路段的成绩 — 无论两端还是中间 — 都会被标记，绝不成为个人纪录。",
  "segments.ruleRepair":
    "在 Strava 上，路段内的数据缺口会中断匹配。在这里修复缺口可恢复匹配资格 — 但修复路段仍会被标记，规则同上。",
  "segments.none":
    "还没有路段 — 从已加载的轨迹上选取一段，或在地图上绘制一条。",

  // -- 删除 ---------------------------------------------------------------
  "segments.deleteAria": "删除路段 {name}",
  "segments.deleteConfirm": "删除“{name}”？其成绩历史会一并删除。",
  "segments.deleteYes": "删除",
  "segments.deleteNo": "保留",
};
