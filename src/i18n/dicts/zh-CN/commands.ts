/**
 * Simplified Chinese — command registry (Phase 21).
 *
 * The palette's searchable face in Chinese. Search aliases (.kw) let
 * Chinese queries find commands (修复 finds the repair door); the
 * English keywords stay in the registry and always match too, so
 * power users can keep typing English in a Chinese UI.
 */

import type { commands } from "../en/commands";

export type CommandKey = keyof typeof commands;

export const zhCommands: Record<CommandKey, string> = {
  "cmd.group.navigate": "前往",
  "cmd.group.sessions": "会话",
  "cmd.group.editing": "编辑",
  "cmd.group.view": "视图",
  "cmd.group.help": "帮助与导览",

  "cmd.open-repair": "修复一段记录",
  "cmd.open-share": "制作分享卡片",
  "cmd.open-recovery": "找回 GPS 断开的路段",
  "cmd.open-create": "从统计数据创建活动",
  "cmd.open-merge": "合并多段记录",
  "cmd.open-plan": "规划一条路线",
  "cmd.open-batch": "批量修复文件",

  "cmd.go-home": "返回工具卡片",
  "cmd.open-sessions": "打开已保存的会话",

  "cmd.editor-undo": "撤销",
  "cmd.editor-redo": "重做",
  "cmd.editor-clear": "清除已画的路线",
  "cmd.editor-draw-mode": "绘制模式 — 点击放置点",
  "cmd.editor-move-mode": "移动模式 — 拖动任意已放置的点",
  "cmd.editor-pan-mode": "平移模式 — 普通地图导航",
  "cmd.editor-pen-toggle": "切换曲线笔",

  "cmd.theme-system": "主题：跟随系统",
  "cmd.theme-light": "主题：浅色",
  "cmd.theme-dark": "主题：深色",

  "cmd.open-help": "快捷键与帮助",
  "cmd.command-palette": "打开命令面板",
  "cmd.open-about": "关于本应用",
  "cmd.open-privacy": "隐私与数据",
  "cmd.replay-tour": "重看操作导览：{name}",

  "cmd.escape": "关闭对话框，或取消当前的选择 / 编辑",
  "cmd.tab": "在控件之间移动 — “跳到正文”链接是页面顶部的第一个",

  "cmd.cheat.everywhere": "全局",
  "cmd.cheat.editors": "绘制编辑器（修复、找回、创建、规划）",

  "cmd.kw.go-home": "首页 主页 落地 返回",
  "cmd.kw.open-sessions": "架子 恢复 管理 会话",
  "cmd.kw.editor-undo": "撤销 后退",
  "cmd.kw.editor-redo": "恢复 前进",
  "cmd.kw.editor-clear": "删除 点 清空",
  "cmd.kw.editor-draw-mode": "指针 画笔 绘制",
  "cmd.kw.editor-move-mode": "指针 拖动 移动",
  "cmd.kw.editor-pan-mode": "指针 导航 平移",
  "cmd.kw.editor-pen-toggle": "徒手 笔画 铅笔 曲线",
  "cmd.kw.theme-system": "深色 浅色 颜色 跟随",
  "cmd.kw.theme-light": "深色 颜色 浅色",
  "cmd.kw.theme-dark": "浅色 颜色 深色",
  "cmd.kw.open-help": "键盘 速查 键位 帮助",
  "cmd.kw.command-palette": "搜索 动作 命令",
  "cmd.kw.open-privacy": "离线 本地 隐私",
};
