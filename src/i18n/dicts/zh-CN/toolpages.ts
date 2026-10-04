/**
 * The Simplified Chinese tool-page copy (Phase 21 — §EE 21.3).
 *
 * The teaching surfaces: the hero, the "How it works" trio, the fact
 * strip, and the parse-progress readout. Mirrors en/toolpages.ts key
 * for key (the gates enforce it).
 */

import type { toolpages } from "../en/toolpages";

/** The keys this domain owns (compile-checked against the en file). */
export type ToolpageKey = keyof typeof toolpages;

export const zhToolpages: Record<ToolpageKey, string> = {
  "toolpage.backToCards": "全部工具",
  "toolpage.howItWorks": "它是如何工作的",
  "toolpage.howItWorksSub": "整个流程都在这个标签页里完成 — 无需安装，无需账号。",
  "toolpage.factInput": "输入",
  "toolpage.factOutput": "输出",
  "toolpage.factBestFor": "适合谁",

  "loading.parsing": "正在解析 {file}…",
  "loading.yourFile": "你的文件",
  "loading.aria": "正在解析 {file}",
  "loading.local": "所有处理都在你的浏览器中本地完成。",
  "loading.progressA11y": "解析进度",
  "loading.phase.parse": "解析中",
  "loading.phase.validate": "校验中",
  "loading.phase.gaps": "正在检测缺口",
  "loading.phase.transfer": "正在准备视图",
  "loading.phase.working": "处理中",

  "toolpage.repair.hero.heading": "修复不完整的 GPS 记录",
  "toolpage.repair.hero.description":
    "上传一段有缺口或损坏的 GPX 活动，仔细查看到底记录了什么，然后亲手补画缺失的路线 — 已记录与重建数据之间有一条清晰的界线。",
  "toolpage.repair.step1.title": "检查",
  "toolpage.repair.step1.description":
    "逐段查看轨迹、缺口和异常，统计只基于已记录的数据 — 没有任何编造。",
  "toolpage.repair.step2.title": "修复",
  "toolpage.repair.step2.description":
    "在地图上补画缺失的路线 — 点击会沿真实道路布线，曲线笔可以徒手拖出弧线，移动模式可调整任意一点，且一切可撤销。",
  "toolpage.repair.step3.title": "默认诚实",
  "toolpage.repair.step3.description":
    "下载修复后的 GPX，每个重建点都带标记 — 原始记录永不被修改，即使重新上传，修复也保持标注。",
  "toolpage.repair.fact.input":
    "任意 GPX 1.0 或 1.1 活动文件 — 来自任何手表、手机或平台导出。",
  "toolpage.repair.fact.output":
    "加入修复的同一份文件 — 每个重建点都有标记，原始记录原封不动。",
  "toolpage.repair.fact.bestFor":
    "存在缺失路段或可疑片段、想亲眼看到并亲手修复的记录。",

  "toolpage.share.hero.heading": "用你的 GPX 制作分享卡片",
  "toolpage.share.hero.description":
    "上传一次活动，下载一张 Strava 风格的分享图 — 你的路线，加上这份文件实际记录的距离、配速和时间。需要先修复？上传后一步就能进入修复工作台。",
  "toolpage.share.step1.title": "上传任意 GPX",
  "toolpage.share.step1.description":
    "放入一个活动文件 — 它只在这个标签页里本地读取，不会上传到任何地方。",
  "toolpage.share.step2.title": "预览卡片",
  "toolpage.share.step2.description":
    "你的路线渲染在一张 9:16 的透明画布上，配上文件里实际记录的距离、配速和时间。",
  "toolpage.share.step3.title": "下载 PNG",
  "toolpage.share.step3.description":
    "导出 1080×1920 图片（可选 2160×3840）— 白色透明底，直接用于动态和帖子。",
  "toolpage.share.fact.input": "任意 GPX 活动文件 — 有缺口也没关系，无需先修复。",
  "toolpage.share.fact.output":
    "一张 1080×1920 透明 PNG（2× 时 2160×3840）— 路线、距离、配速和时间都如实呈现。",
  "toolpage.share.fact.bestFor":
    "把完成的活动变成适合 Strava、群聊或任何地方的成品图。",

  "toolpage.recovery.hero.heading": "找回丢失的 GPS 路段",
  "toolpage.recovery.hero.description":
    "上传一段记录中途断掉的 Activity — 计时一直在走，路线却破了个洞。把丢失的那段画出来，得到一份总耗时不变的修正版 GPX。",
  "toolpage.recovery.step1.title": "检测缺口",
  "toolpage.recovery.step1.description":
    "应用会找出手表仍在计时、GPS 坐标却缺失的路段 — 时间区间、持续时长和两端的锚点。",
  "toolpage.recovery.step2.title": "补画缺失路线",
  "toolpage.recovery.step2.description":
    "在地图上描出你实际走过的路 — 点击沿真实道路布线，曲线笔徒手画弧，一切可撤销。原始记录永不被修改。",
  "toolpage.recovery.step3.title": "导出修正文件",
  "toolpage.recovery.step3.description":
    "沿你的画线生成 GPS 点，时间戳按比例填入缺失区间，修正后的完整路线配上重新计算的统计一起预览，导出时每个生成点都标记为估算。",
  "toolpage.recovery.fact.input":
    "一份带时间戳的 GPX，计时在 GPS 断连期间仍在继续。",
  "toolpage.recovery.fact.output":
    "一份修正的 .gpx — 点沿你的画线生成，时间戳填入缺失区间，总耗时保持不变。",
  "toolpage.recovery.fact.bestFor":
    "活动中途信号丢失 — 隧道、高楼峡谷、林间小路：一份原本不错的记录上破的那个洞。",

  "toolpage.create.hero.heading": "从统计数据创建活动",
  "toolpage.create.hero.description":
    "你的手表记下了距离、配速和时间 — 却没有地图。输入这些统计，画出你走过的路线，下载一份可直接进 Strava 和所有平台的 GPX。",
  "toolpage.create.step1.title": "输入你的统计",
  "toolpage.create.step1.description":
    "手表记录的距离、平均配速、总时间和开始时间 — 不需要 GPX。应用会检查它们自洽（时间 ≈ 距离 × 配速），且绝不改写你的数字。",
  "toolpage.create.step2.title": "画出路线",
  "toolpage.create.step2.description":
    "在地图上描出你走过的路 — 点击沿真实道路布线，曲线笔徒手画弧，一切可撤销。这是从零开始画的整段活动。",
  "toolpage.create.step3.title": "导出 GPX",
  "toolpage.create.step3.description":
    "路线按你记录的距离缩放，你记录的时间作为时间戳均匀铺在整条路线上，文件可直接导入 Strava 及其他 GPX 平台。",
  "toolpage.create.fact.input":
    "完全不需要文件 — 只要手表记录的距离、平均配速、总时间和开始时间。",
  "toolpage.create.fact.output":
    "一份按记录距离缩放的 .gpx，你的时间作为时间戳铺在路线上 — 可导入 Strava 和所有 GPX 平台。",
  "toolpage.create.fact.bestFor":
    "跑步机跑和无 GPS 的日子：数字都在，地图不在 — 直到你把它画出来。",

  "toolpage.merge.hero.heading": "把多个 GPX 合成一条路线",
  "toolpage.merge.hero.description":
    "上传两段或更多活动 — 或者同一次活动的多段记录 — 合并成一份 GPX。所有已记录内容都会保留：点、海拔、时间戳和途经点。然后调整顺序、给结果命名、下载一份文件。",
  "toolpage.merge.step1.title": "加入文件",
  "toolpage.merge.step1.description":
    "放入两个或更多 GPX 文件 — 每个都在本地读取并检查，通过后才加入合并。一个坏文件不会拖累其余文件。",
  "toolpage.merge.step2.title": "编排合并",
  "toolpage.merge.step2.description":
    "设定路线的拼接顺序 — 或按开始时间排序 — 移除任意文件，给合并后的活动命名。地图和统计随每次改动实时更新。",
  "toolpage.merge.step3.title": "下载一份 GPX",
  "toolpage.merge.step3.description":
    "一条轨迹包含每个文件的每个已记录点 — 海拔、时间戳和途经点原样搬运，不做任何改写。",
  "toolpage.merge.fact.input":
    "两个或更多 GPX 1.0 / 1.1 活动文件 — 混合来源均可（手表、手机、平台导出）。",
  "toolpage.merge.fact.output":
    "一份单轨迹 .gpx — 每个文件的每个点、途经点和路线，按你选的顺序、用你起的名字。",
  "toolpage.merge.fact.bestFor":
    "多段重复记录、被平台拆分的活动，或想把几天的骑行跑步拼成一条路线。",

  "toolpage.plan.hero.heading": "规划路线，读它的数字",
  "toolpage.plan.hero.description":
    "在地图上勾勒一条路线 — 沿真实道路、步道，或徒手画 — 看着距离、地形和配速逐渐成形。输入一个时间，看它意味着什么。这是规划草稿本：不导出、不分享。",
  "toolpage.plan.step1.title": "画你的路线",
  "toolpage.plan.step1.description":
    "随手勾勒想去的地方 — 点击沿真实道路布线，曲线笔徒手画弧，移动模式调整任意一点，一切可撤销。不需要文件。",
  "toolpage.plan.step2.title": "读取估算",
  "toolpage.plan.step2.description":
    "距离随线条成形实时更新，地形海拔一次可选查询即可获取，直线对比则告诉你这条计划有多绕。",
  "toolpage.plan.step3.title": "用你的时间算配速",
  "toolpage.plan.step3.description":
    "输入目标时间，看它对应的配速和速度，以及沿路线的均匀分段。这是草稿本 — 不导出、不分享。",
  "toolpage.plan.fact.input":
    "完全不需要文件 — 只要地图。用每个编辑器都有的画笔画出你在考虑的路线。",
  "toolpage.plan.fact.output":
    "仅屏幕上的估算 — 距离、海拔、直线对比，以及由你输入的时间推算的配速。不导出、不分享：计划留在这页。",
  "toolpage.plan.fact.bestFor":
    "规划明天的跑步或骑行、测量通勤距离、在真正记录之前比较几条候选路线。",

  "toolpage.batch.hero.heading": "一次性清理一批文件",
  "toolpage.batch.hero.description":
    "把一整个文件夹的记录排进队列，逐文件查看深度检查的发现，用一套修复预设处理整个队列 — 应用前逐文件预览 — 然后下载一个带变更清单的 ZIP。",
  "toolpage.batch.step1.title": "排入你的文件",
  "toolpage.batch.step1.description":
    "放入一个或多个记录 — 每个都在本地解析，报告点数、发现和失败。一个坏文件不会拖累其余文件。",
  "toolpage.batch.step2.title": "先预览，再应用",
  "toolpage.batch.step2.description":
    "选择一套修复预设，逐文件看清它将改什么 — 与单文件预览相同的措辞 — 然后才真正应用。每个修复都可撤销。",
  "toolpage.batch.step3.title": "下载 ZIP",
  "toolpage.batch.step3.description":
    "一个压缩包：每个文件一份修复后的 GPX，外加一份说明各自改了什么的清单。原始文件永不被修改 — 修复帮不上的文件原样导出。",
  "toolpage.batch.fact.input":
    "一个或多个 GPX、TCX 或 FIT 文件（最多 50 个）— 一整文件夹的导出，混合来源均可。",
  "toolpage.batch.fact.output":
    "一个 ZIP：每个文件一份修复后的 GPX，外加逐文件说明改了什么的 MANIFEST.txt — 修复帮不上的文件原样导出。",
  "toolpage.batch.fact.bestFor":
    "迁移后的批量清理、成堆文件的漂移与重复点清扫，以及宁愿一次修完二十个记录、不想一个个来的人。",
};
