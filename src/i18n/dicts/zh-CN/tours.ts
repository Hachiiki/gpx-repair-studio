/**
 * Simplified Chinese — onboarding tour + seven tool tours (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof tours, string> once the keys land (the i18n
 * gate enforces completeness).
 */

export const zhTours: Record<string, string> = {
  /** The first-run onboarding tour (onboarding-tour.tsx). */
  "onboarding.step1.kicker": "隐私优先",
  "onboarding.step1.title": "你的文件只留在这台设备上",
  "onboarding.step1.body":
    "上传、解析、缺口检测、绘制、统计与导出全部在这个浏览器标签页中完成。这里没有账户，你打开的任何内容都不会在其他地方留有副本。仅有的网络请求是地图瓦片 — 以及你主动触发的道路跟随与海拔查询。",
  "onboarding.step2.kicker": "工作台",
  "onboarding.step2.title": "选择一个工具",
  "onboarding.step2.body":
    "六张卡片，六种工作：修复一段记录、制作分享卡片、找回 GPS 缺口、根据数据创建活动、合并多段记录，或规划一条路线。每个工具都有自己的工作区 — 同一张地图、同一套画笔，以及各自的文件。",
  "onboarding.step3.kicker": "绘制",
  "onboarding.step3.title": "先绘制，再调整",
  "onboarding.step3.body":
    "默认画笔沿真实道路或步道放置点；曲线笔自由手绘。切换到移动模式 (M) 可把任何一点拖到合适位置 — 一切都可逐步撤销。",
  "onboarding.step4.kicker": "这些保证",
  "onboarding.step4.title": "不丢失，不虚构",
  "onboarding.step4.body":
    "统计始终将已记录的数据与你的重建区分开，导出时这些标记也会带入 Strava 和其他所有平台。未完成的工作会自动保存在这台设备上，下次返回时会重新交还给你。",
  "onboarding.skip": "跳过",
  "onboarding.back": "上一步",
  "onboarding.next": "下一步",
  "onboarding.getStarted": "开始使用",
  "onboarding.stepCount": "第 {current} 步，共 {count} 步",

  /** The per-tool guided walkthroughs (tool-tour.tsx). */
  "tour.repair.title": "修复一段记录",
  "tour.repair.blurb": "找出缺陷，带预览地修复，看清每一处改动。",
  "tour.repair.step1.kicker": "修复 · 第 1 步",
  "tour.repair.step1.title": "从一段记录开始",
  "tour.repair.step1.body":
    "把 GPX、TCX 或 FIT 文件拖到上传区 — 或加载内置的示例骑行，它带有两处 GPS 缺口和一些可练习的深度缺陷。一切都在这个标签页中解析；磁盘上的文件绝不会被触碰。",
  "tour.repair.step1.action": "加载示例骑行",
  "tour.repair.step2.kicker": "修复 · 第 2 步",
  "tour.repair.step2.title": "找出问题",
  "tour.repair.step2.body":
    "深度校验卡片会遍历整段记录，搜寻瞬移、重复点、倒序时间戳、海拔尖峰、GPS 漂移和缺失海拔。每一项发现都会在确认前预览其修复 — 已确认的修复落在可撤销的工作副本上。",
  "tour.repair.step3.kicker": "修复 · 第 3 步",
  "tour.repair.step3.title": "看到改了什么",
  "tour.repair.step3.body":
    "前后对比卡片把原始路线作为虚线轮廓叠在你的工作副本之下，并用橙色高亮每一处被改动的路段；并排视图以同一比例展示两张图，差异表统计不同之处。修复摘要可打印成一页备查。",
  "tour.repair.step4.kicker": "修复 · 第 4 步",
  "tour.repair.step4.title": "带溯源导出",
  "tour.repair.step4.body":
    "审阅并导出会写入修复后的文件，并带有披露每一处改动的 gpxr 标记 — Strava 和其他所有平台都会保留它们，所以不会有任何内容冒充已记录的数据。原始文件在你的磁盘上保持原样。",

  "tour.share.title": "分享卡片",
  "tour.share.blurb": "把一次干净的跑步变成值得发布的图片。",
  "tour.share.step1.kicker": "分享卡片 · 第 1 步",
  "tour.share.step1.title": "一张关于你活动的图片",
  "tour.share.step1.body":
    "上传你想展示的记录 — 连续干净的跑步效果最好 — 或加载内置的匀速跑步示例。卡片与所有其他工具一样，基于同一份解析数据在这个标签页中渲染。",
  "tour.share.step1.action": "加载示例跑步",
  "tour.share.step2.kicker": "分享卡片 · 第 2 步",
  "tour.share.step2.title": "做成你的风格",
  "tour.share.step2.body":
    "主题、配图、单位和路线取景都在卡片本身 — 到处点点看，它会实时重新渲染。数字与统计面板一样带有各自的溯源。",
  "tour.share.step3.kicker": "分享卡片 · 第 3 步",
  "tour.share.step3.title": "PNG，本地渲染",
  "tour.share.step3.body":
    "满意后把卡片下载为图片。它完全在你的浏览器中绘制 — 没有任何服务器见过这个文件。",

  "tour.recovery.title": "缺口找回",
  "tour.recovery.blurb": "重绘 GPS 丢失的那段路线，时间戳诚实可信。",
  "tour.recovery.step1.kicker": "缺口找回 · 第 1 步",
  "tour.recovery.step1.title": "一段有洞的记录",
  "tour.recovery.step1.body":
    "上传一个 GPS 中途丢失了一段的文件 — 缺口两侧需要都有时间戳，才能检测出缺失的区间。内置的示例骑行正是如此；加载它跟着走一遍。",
  "tour.recovery.step1.action": "加载示例骑行",
  "tour.recovery.step2.kicker": "缺口找回 · 第 2 步",
  "tour.recovery.step2.title": "绘制缺失的路线",
  "tour.recovery.step2.body":
    "打开缺口并绘制：默认画笔沿真实道路或步道放置点，曲线笔自由手绘，移动模式 (M) 事后可拖动任何一点。一切都可逐步撤销。",
  "tour.recovery.step3.kicker": "缺口找回 · 第 3 步",
  "tour.recovery.step3.title": "时间是估算的 — 并且有标注",
  "tour.recovery.step3.body":
    "找回路段的时间戳是插值估算的，应用在所有地方都如实说明：配速行、统计面板、导出标记。任何虚构的内容都不会被当作已记录的数据呈现。",
  "tour.recovery.step4.kicker": "缺口找回 · 第 4 步",
  "tour.recovery.step4.title": "导出整个活动",
  "tour.recovery.step4.body":
    "导出会把这个文件中的已记录数据和你的找回路段写在一起，用 gpxr 标记披露哪个是哪个。",

  "tour.create.title": "根据数据创建",
  "tour.create.blurb": "把来自其他应用的数据变成手绘路线。",
  "tour.create.step1.kicker": "根据数据创建 · 第 1 步",
  "tour.create.step1.title": "从你的数据出发",
  "tour.create.step1.body":
    "输入你的手表在其他地方记录的距离、时长和海拔。如果只是想看看它如何工作，表单会预填示例数据 — 不会有任何内容被上传到任何地方。",
  "tour.create.step2.kicker": "根据数据创建 · 第 2 步",
  "tour.create.step2.title": "绘制路线",
  "tour.create.step2.body":
    "画出你实际走过的路线：跟随道路逐点点击，或用曲线笔自由手绘。实时距离读数会与你的目标对账。",
  "tour.create.step3.kicker": "根据数据创建 · 第 3 步",
  "tour.create.step3.title": "调整到吻合为止",
  "tour.create.step3.body":
    "移动点位、撤销任何操作，看着数字逐渐对上。当画出的路线与真实活动吻合时，就完成了 — 没有任何隐藏的猜测。",
  "tour.create.step4.kicker": "根据数据创建 · 第 4 步",
  "tour.create.step4.title": "愿意的话就分享",
  "tour.create.step4.body":
    "审阅路线可以像上传的活动一样变成分享卡片。你的原始数据会留在会话中，方便回来再调整。",

  "tour.merge.title": "合并记录",
  "tour.merge.blurb": "把两段或更多记录合并成一条诚实的路线。",
  "tour.merge.step1.kicker": "合并 · 第 1 步",
  "tour.merge.step1.title": "两段或更多记录",
  "tour.merge.step1.body":
    "按你骑行或跑步的顺序添加文件 — 分成两段的通勤、中途没电的表、被暂停打断的活动。内置的示例文件对正是一段两部分的通勤，一键即可加载。",
  "tour.merge.step1.action": "加载示例文件对",
  "tour.merge.step2.kicker": "合并 · 第 2 步",
  "tour.merge.step2.title": "安排链条",
  "tour.merge.step2.body":
    "把文件拖入顺序，或按开始时间排序。链式预览展示各段如何首尾相连，并披露每一处衔接。",
  "tour.merge.step3.kicker": "合并 · 第 3 步",
  "tour.merge.step3.title": "一条路线，诚实呈现",
  "tour.merge.step3.body":
    "合并后的路线会调和重叠部分，并承载合并后的统计 — 每个文件自己的数字仍是一键即达。",
  "tour.merge.step4.kicker": "合并 · 第 4 步",
  "tour.merge.step4.title": "导出合并后的文件",
  "tour.merge.step4.body":
    "输出一个 GPX，溯源保留：导出会注明各段来自哪里。",

  "tour.plan.title": "规划路线",
  "tour.plan.blurb": "为你在构思的那条路线准备的绘制测量草稿本。",
  "tour.plan.step1.kicker": "规划 · 第 1 步",
  "tour.plan.step1.title": "是草稿本，不是会话",
  "tour.plan.step1.body":
    "无需任何文件 — 开始规划，地图就是你的。画出你在构思的路线，从零开始，或围绕一个你熟悉的地方。",
  "tour.plan.step2.kicker": "规划 · 第 2 步",
  "tour.plan.step2.title": "边画边量",
  "tour.plan.step2.body":
    "与其他地方相同的画笔：跟随道路逐点点击、自由手绘曲线、可拖动的点位。距离读数随每次改动更新。",
  "tour.plan.step3.kicker": "规划 · 第 3 步",
  "tour.plan.step3.title": "检查你的成果",
  "tour.plan.step3.body":
    "规划的数字 — 距离、路线形状、需要时的海拔剖面 — 在你调整时保持实时。一切皆可逐步撤销。",
  "tour.plan.step4.kicker": "规划 · 第 4 步",
  "tour.plan.step4.title": "当你觉得对了",
  "tour.plan.step4.body":
    "规划只留在这台设备上 — 这里刻意不提供导出，只等你觉得合适时，把清晰的路线画进你常用的规划应用。未完成的规划会自动保存，下次到访时重新提供。",

  "tour.batch.title": "批量清理",
  "tour.batch.blurb": "一个预设处理整个文件夹，输出一个 ZIP，会话可保留。",
  "tour.batch.step1.kicker": "批量 · 第 1 步",
  "tour.batch.step1.title": "多个文件，一次通过",
  "tour.batch.step1.body":
    "一次最多排队五十个文件 — 整个赛季的导出、旧手表里的文件夹。每个文件依次解析、各有状态；不会有任何内容被上传。加载两个示例文件看看流程。",
  "tour.batch.step1.action": "加载两个示例文件",
  "tour.batch.step2.kicker": "批量 · 第 2 步",
  "tour.batch.step2.title": "一个预设，逐文件预览",
  "tour.batch.step2.body":
    "选定一个预设后，每个文件都会精确预览它将做出的改动 — 逐点、逐文件。确认后会应用到整个队列，任何文件最近的一次修复都可单独撤销。",
  "tour.batch.step3.kicker": "批量 · 第 3 步",
  "tour.batch.step3.title": "输出一个 ZIP",
  "tour.batch.step3.body":
    "一次下载全部：每个文件一个修复后的 GPX，外加一份 MANIFEST.txt，逐文件说明改了什么、没改什么。没有问题的文件原样导出。",
  "tour.batch.step4.kicker": "批量 · 第 4 步",
  "tour.batch.step4.title": "随时回来",
  "tour.batch.step4.body":
    "队列可以保存为命名会话 — 导出为 .gpxrepair.json 文件，内含原始文件和每一处修复，可在任何设备上在这里重新打开。",

  /** The walkthrough dialog's footer. */
  "tour.skip": "跳过",
  "tour.back": "上一步",
  "tour.next": "下一步",
  "tour.getStarted": "开始使用",
  "tour.stepCount": "第 {current} 步，共 {count} 步",

  /** The dismissible first-visit strip above a tool's workspace. */
  "tour.offer.new": "新功能：{title} 演练。",
  "tour.offer.meta": "{count} 步，约一分钟",
  "tour.offer.samples": " — 附带教学示例",
  "tour.offer.start": "开始",
  "tour.offer.dismiss": "关闭",

  /** The command palette (command-palette.tsx). */
  "palette.title": "命令面板",
  "palette.description":
    "搜索应用中的每一个操作。方向键移动，回车运行，Esc 关闭。",
  "palette.placeholder": "搜索命令…",
  "palette.empty": "没有匹配项 — 试试工具名称、“撤销”或“主题”。",
  "palette.recentSessions": "最近的会话",
  "palette.commands": "命令",
  "palette.footerMove": "移动",
  "palette.footerRun": "运行",
  "palette.footerClose": "关闭",
  "palette.editor": "编辑器",

  /** The session-recovery prompt (restore-prompt.tsx). */
  "restore.ariaLabel": "这台设备上未保存的会话",
  "restore.title": "这台设备上有未完成的工作",
  "restore.blurb":
    "刷新浏览器或关闭标签页会丢失这些工作。恢复即可从你离开的地方继续。",
  "restore.kicker.repair": "修复",
  "restore.kicker.recovery": "缺口找回",
  "restore.kicker.create": "根据数据创建",
  "restore.kicker.plan": "路线规划",
  "restore.restoring": "恢复中…",
  "restore.restore": "恢复",
  "restore.discard": "丢弃",
  "restore.clearAll": "清除所有已保存的会话",
  "restore.privacy":
    "已保存的会话 — 你的文件和你绘制的编辑 — 保存在这台设备上此浏览器的存储中。它们绝不会被上传，恢复时会原样重新打开。",
  "restore.morePrivacy": "了解更多关于隐私与数据的信息",
  "restore.savedJustNow": "刚刚保存",
  "restore.savedMinuteOne": "1 分钟前保存",
  "restore.savedMinuteMany": "{count} 分钟前保存",
  "restore.savedHourOne": "1 小时前保存",
  "restore.savedHourMany": "{count} 小时前保存",
  "restore.savedDayOne": "1 天前保存",
  "restore.savedDayMany": "{count} 天前保存",

  /** The shared two-section workspace's default (repair) labels. */
  "workspace.sectionLabel": "修复地图与工具",
  "workspace.toolsLabel": "修复工具",
  "workspace.detailsTitle": "统计与文件详情",
  "workspace.detailsIntro":
    "应用对原始记录的全部了解 — 诚实的数字及其溯源，绝不虚构。",
  "workspace.detailsAria": "统计与文件详情",
  "workspace.backToMap": "回到地图",

  "restore.desc.drawn.one": "已画 1 个点",
  "restore.desc.drawn.many": "已画 {count} 个点",
  "restore.desc.manualSpans.one": "1 段手动区间",
  "restore.desc.manualSpans.many": "{count} 段手动区间",
  "restore.desc.skippedGaps.one": "1 个跳过的缺口",
  "restore.desc.skippedGaps.many": "{count} 个跳过的缺口",
  "restore.desc.fixes.points.one": "1 项修复（{points} 个点）",
  "restore.desc.fixes.points.many": "{count} 项修复（{points} 个点）",
  "restore.desc.fixes.plain.one": "1 项修复",
  "restore.desc.fixes.plain.many": "{count} 项修复",
  "restore.desc.createLabel": "来自统计数据的活动",
  "restore.desc.createKm": "已输入 {km} 公里",
  "restore.desc.planLabel": "路线规划",
  "restore.desc.join": " · ",
};
