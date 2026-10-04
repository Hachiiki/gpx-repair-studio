/**
 * Simplified Chinese — shared cards (sessions manager, restore prompt, reveal, etc.) (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof shared, string> once the keys land (the i18n
 * gate enforces completeness).
 */

export const zhShared: Record<string, string> = {
  /** gap-vocabulary.tsx */
  "shared.gapVocab.kindTimeGap": "时间缺口",
  "shared.gapVocab.kindSpeedAnomaly": "速度异常",
  "shared.gapVocab.kindSegmentBreak": "分段断裂",
  "shared.gapVocab.kindManual": "手动修复",
  "shared.gapVocab.kindManualInsert": "添加的路线",
  "shared.gapVocab.severitySevere": "严重",
  "shared.gapVocab.severitySuspect": "可疑",
  "shared.gapVocab.severityInfo": "提示",
  "shared.gapVocab.statusNew": "未修复",
  "shared.gapVocab.statusInProgress": "编辑中",
  "shared.gapVocab.statusReconstructed": "已重建",
  "shared.gapVocab.statusSkipped": "已跳过",

  /** hint-tip.tsx */
  "shared.hint.toSwitch": "以切换",

  /** pace-unit-toggle.tsx */
  "shared.paceUnit.groupAria": "配速单位",

  /** router-consent-dialog.tsx */
  "shared.consent.titleManaging": "道路吸附已开启",
  "shared.consent.titleGrant": "开启道路吸附？",
  "shared.consent.managePrefix":
    "道路吸附已在本会话中启用。你使用道路、步道或吸附到道路绘制的每条线的各个点，正在发送到",
  "shared.consent.manageSuffix":
    "。除此之外不会有任何内容离开 — 不是你的文件，也不是你已记录的点。关闭此标签页时它会自动关闭，也可以现在就关闭：",
  "shared.consent.noticeLead":
    "道路吸附会把绘制的线发送到第三方路由服务：你在一条线上用",
  "shared.consent.roads": "道路",
  "shared.consent.footpaths": "步道",
  "shared.consent.snapToRoad": "吸附到道路",
  "shared.consent.sepComma": "，",
  "shared.consent.sepOr": "，或",
  "shared.consent.controlsGoTo": "工具放置的点会发送到",
  "shared.consent.toFindRoads": "以找出它们之间的道路。",
  "shared.consent.neverLine": "绝不是你的 GPX 文件，也绝不是你已记录的点",
  "shared.consent.neverRest":
    "— 只发送你自己绘制的内容。直线和曲线笔无论如何都完全在本地，你也可以随时从页脚关闭此功能。",
  "shared.consent.customPrefix":
    "你已配置自己的路由服务器 — 绘制的点会发送到",
  "shared.consent.customSuffix": "，而不是公共服务。",
  "shared.consent.sessionScope":
    "此权限仅在本会话内有效 — 重新加载页面后会再次询问。",
  "shared.consent.privacyLink": "隐私与数据",
  "shared.consent.privacyRest": "中列出了完整清单和自托管说明。",
  "shared.consent.done": "完成",
  "shared.consent.turnOff": "在本会话中关闭",
  "shared.consent.keepLocal": "让线条保持在本地",
  "shared.consent.enable": "在本会话中启用",

  /** sessions-manager.tsx */
  "shared.sessions.title": "你的会话",
  "shared.sessions.description":
    "会话只保存在这台设备的浏览器中 — 没有账号，也不会向任何地方发送内容。一个会话文件（.gpxrepair.json）承载全部内容：原始记录、每一处修复、每一段绘制的修缮。",
  "shared.sessions.saveSectionAria": "保存当前会话",
  "shared.sessions.saveHeading": "保存你正在进行的工作",
  "shared.sessions.nameLabel": "会话名称",
  "shared.sessions.savePlaceholder": "为这个{section}会话命名…",
  "shared.sessions.savePlaceholderEmpty":
    "还没有可保存的内容 — 先绘制或修复一些东西",
  "shared.sessions.saveButton": "保存会话",
  "shared.sessions.exportCurrent": "导出文件",
  "shared.sessions.importedNotice": "已导入 — “{name}”已在架上。",
  "shared.sessions.shelfSectionAria": "已保存的会话",
  "shared.sessions.shelfHeading": "在这台设备上",
  "shared.sessions.unavailable":
    "会话存储不可用（被阻止或处于隐私模式）— 保存和导出仍然可用，但这里不会保留任何内容。",
  "shared.sessions.empty":
    "还没有已保存的会话。在上方保存一个，或在下方导入会话文件。",
  "shared.sessions.filesSectionAria": "会话文件",
  "shared.sessions.filesHeading": "会话文件",
  "shared.sessions.importButton": "导入到架上",
  "shared.sessions.openFileButton": "打开会话文件",
  "shared.sessions.openFileNote":
    "“打开会话文件”会把它直接载入应用 — 当前会话将被替换，就像上传一个新文件一样。",
  "shared.sessions.renameLabel": "{name} 的新名称",
  "shared.sessions.renameCommit": "重命名",
  "shared.sessions.renameCancel": "取消",
  "shared.sessions.renameAria": "重命名 {name}",
  "shared.sessions.exportAria": "将 {name} 导出为会话文件",
  "shared.sessions.deleteAria": "删除 {name}",
  "shared.sessions.updated": "更新于 {date}",
  "shared.sessions.deleteConfirm": "删除这个会话？",
  "shared.sessions.deleteButton": "删除",
  "shared.sessions.keepButton": "保留",
  "shared.sessions.openButton": "打开这个会话",
};
