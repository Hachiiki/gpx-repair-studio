/**
 * The Simplified Chinese dictionary (Phase 21 — §EE 21.3).
 *
 * Domain files mirror the English domain files one for one;
 * `Record<MessageKey, string>` makes a missing key a compile error
 * before it is a test failure. Param placeholders `{name}` must match
 * English's exactly (the param-parity gate enforces it).
 *
 * Translation register: 工具性、克制、诚实 — the app's Field Plot
 * voice (plain words, no marketing) rendered in the vocabulary Chinese
 * sports apps use: 公里/米 for distance, 配速 for pace, 海拔 for
 * elevation, 轨迹 for track. The honesty dashes and provenance words
 * keep their plain declarative tone.
 */

import type { MessageKey } from "../en";
import { zhToolpages } from "./toolpages";
import { zhRepair } from "./repair";
import { zhCommands } from "./commands";
import { zhReconstruction } from "./reconstruction";
import { zhRecovery } from "./recovery";
import { zhCreate } from "./create";
import { zhMerge } from "./merge";
import { zhPlan } from "./plan";
import { zhStatistics } from "./statistics";
import { zhZones } from "./zones";
import { zhLibrary } from "./library";
import { zhSegments } from "./segments";
import { zhPhotos } from "./photos";
import { zhCompare } from "./compare";
import { zhBatch } from "./batch";
import { zhShare } from "./share";
import { zhMap } from "./map";
import { zhShared } from "./shared";
import { zhHelp } from "./help";
import { zhTours } from "./tours";
import { zhShell } from "./shell";
import { zhHooks } from "./hooks";

/**
 * The chrome half (common + layout domains). The tool-page half
 * lives in ./toolpages; the two merge below, and `Record<MessageKey,
 * string>` on the MERGED object keeps the full key set honest.
 */
const zhChrome: Partial<Record<MessageKey, string>> = {
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.confirm": "确认",
  "common.continue": "继续",
  "common.back": "返回",
  "common.remove": "移除",
  "common.retry": "重试",
  "common.open": "打开",
  "common.undo": "撤销",
  "common.redo": "重做",
  "common.points": "{count} 个点",
  "common.loading": "加载中…",

  "ui.dataTable": "数据表格",

  "footer.language": "语言",
  "footer.languageA11y": "选择应用语言",
  "footer.languageChanged": "语言已更新 — 已应用到所有界面。",

  "footer.privacyLine": "所有处理都在你的浏览器中完成 — 文件永远不会离开这台设备。",
  "footer.routerConsentPrefix": "道路吸附已开启 — 手绘点将发送至",
  "footer.navA11y": "关于、帮助与隐私",
  "footer.about": "关于",
  "footer.help": "快捷键与帮助",
  "footer.privacy": "隐私与数据",

  "theme.groupA11y": "配色主题",
  "theme.system": "跟随系统主题",
  "theme.light": "浅色主题",
  "theme.dark": "深色主题",

  "language.groupA11y": "语言",
  "language.optionA11y": "使用{locale}",

  "header.wordmark": "GPX Repair Studio",
  "header.badgeLocalFirst": "本地优先",
  "header.shareCard": "分享卡片",
  "header.backToReview": "返回路线审阅",
  "header.backToArrangement": "返回排序调整",
  "header.repairMap": "修复地图",
  "header.navWorkspace": "工作区分区",
  "header.mapTools": "地图与工具",
  "header.statistics": "统计",
  "header.navRecovery": "恢复工作区分区",
  "header.previewStats": "预览与统计",
  "header.navMerge": "合并工作区分区",
  "header.mapOrder": "地图与顺序",
  "header.sessions": "会话",
  "header.newFile": "新文件",
  "header.startOver": "重新开始",

  "landing.heading": "你想做什么？",
  "landing.subline":
    "七个工具，一张工作台 — 点开任意一个，先看它如何工作，再开始。所有处理都在这个浏览器里完成，你的文件永远不会离开这台设备。",
  "landing.startTour": "第一次用？跟着导览走一遍",
  "landing.continueSession": "继续已保存的会话 — 或打开一个会话文件",
  "landing.tileA11y": "{title} — 打开这个工具",
  "landing.open": "打开",
  "landing.repair.kicker": "修复",
  "landing.repair.title": "修复一段记录",
  "landing.repair.blurb": "检查带缺口或损坏的 GPX，亲手补画缺失的路线。",
  "landing.repair.imageAlt": "插画：地图路线中缺失的一段正被用橙色重新画出来",
  "landing.share.kicker": "分享",
  "landing.share.title": "制作分享卡片",
  "landing.share.blurb": "把任意一次活动变成 Strava 风格的分享图 — 一张透明 PNG。",
  "landing.share.imageAlt": "插画：一部手机上显示着带路线和统计数据的分享卡片",
  "landing.recovery.kicker": "找回",
  "landing.recovery.title": "找回 GPS 信号断开的路段",
  "landing.recovery.blurb": "GPS 掉线了，但计时没有停 — 把丢失的那段画回来。",
  "landing.recovery.imageAlt": "插画：一块运动手表和一条路线，两个图钉之间是虚线表示的缺失段",
  "landing.create.kicker": "创建",
  "landing.create.title": "从数据创建路线",
  "landing.create.blurb": "手表记下了数字却没有地图 — 输入数据，画出路线。",
  "landing.create.imageAlt": "插画：一块运动手表旁边，一支铅笔正在画一条全新的路线",
  "landing.merge.kicker": "合并",
  "landing.merge.title": "合并多段记录",
  "landing.merge.blurb": "两个或多个 GPX 文件合成一条路线 — 每个点都保留。",
  "landing.merge.imageAlt": "插画：两条分开的地图路线汇聚成一条连续的线",
  "landing.plan.kicker": "规划",
  "landing.plan.title": "规划一条路线",
  "landing.plan.blurb": "在地图上勾勒路线，读出它的距离、海拔和配速。",
  "landing.plan.imageAlt": "插画：一条蜿蜒的路线，旁边是刻度尺和圆规在测量",
  "landing.batch.kicker": "批量",
  "landing.batch.title": "批量清理多个文件",
  "landing.batch.blurb": "把几十个记录排进队列，用一套修复预设统一处理，导出一个 ZIP。",
  "landing.batch.imageAlt": "插画：一叠带路线的文件卡片，其中一张正被盖上对勾",
};

/** The merged Chinese dictionary (the runtime gate checks key parity). */
export const zhCN: Record<string, string> = {
  ...zhChrome,
  ...zhToolpages,
  ...zhRepair,
  ...zhCommands,
  ...zhReconstruction,
  ...zhRecovery,
  ...zhCreate,
  ...zhMerge,
  ...zhPlan,
  ...zhStatistics,
  ...zhZones,
  ...zhLibrary,
  ...zhSegments,
  ...zhPhotos,
  ...zhCompare,
  ...zhBatch,
  ...zhShare,
  ...zhMap,
  ...zhShared,
  ...zhHelp,
  ...zhTours,
  ...zhShell,
  ...zhHooks,
};
