/**
 * 照片词典（阶段 26 — 照片地理标记：导入、校准、实时匹配预览、写回入口）。
 * zh-CN 与英文逐键镜像（i18n 单元门禁）。
 */

export const zhPhotos: Record<string, string> = {
  // -- 卡片表面 -----------------------------------------------------------
  "photos.title": "照片地理标记",
  "photos.desc":
    "把你在活动中拍的照片钉在手表记录的位置上。EXIF 在本设备上写回 — 不会上传任何内容。",
  "photos.needsTrack":
    "需要已加载轨迹的时间戳 — 先加载一个带时间的文件，再添加照片。",
  "photos.noPhotos": "还没有照片 — 添加你在这场活动中拍的 JPEG。",

  // -- 导入 ----------------------------------------------------------------
  "photos.add": "添加照片",
  "photos.addAria": "添加 JPEG 照片",
  "photos.addWrite": "以写入权限添加",
  "photos.addWriteHint":
    "仅 Chromium：通过浏览器文件选择器获得写入权限，才能把 GPS 写回原文件。无论如何，“另存为”仍是默认方式。",

  // -- 校准（§26.1）--------------------------------------------------------
  "photos.tzLabel": "相机时区",
  "photos.tzAria": "相机时区",
  "photos.driftLabel": "相机时钟微调",
  "photos.driftAria": "相机时钟微调（秒）",
  "photos.driftValue": "微调：{value}",
  "photos.toleranceNote":
    "距轨迹 ±120 秒内的照片会匹配；其余按距离列出，绝不悄悄吸附。",

  // -- 规则披露 --------------------------------------------------------------
  "photos.rulesTitle": "照片如何匹配",
  "photos.ruleClock":
    "EXIF 时间戳是相机本地时间、不含时区；轨迹是 UTC。照片按“相机时间 − 所选时区 + 漂移微调”匹配。",
  "photos.ruleMatrix":
    "偏移矩阵：从 UTC−12:00 到 UTC+14:00 每 30 分钟一档（含半小时时区），外加 ±5 分钟的漂移微调 — 两者都会实时刷新匹配预览。",
  "photos.ruleWindow":
    "窗口内的照片在最近的两个轨迹点之间插值 — 记录点越多，位置越精细。窗口外的照片按距离列为未匹配。",
  "photos.ruleHonesty":
    "落在手绘修复段上的位置会被标记 — 该图钉基于估算几何，清单里也会写明。",
  "photos.ruleWrite":
    "默认把 GPS 写入副本（另存为）。只有通过浏览器的文件系统访问 API、且每次明确选择时，才会改动原文件。",

  // -- 行 -------------------------------------------------------------------
  "photos.statusMatched": "已匹配",
  "photos.statusNoTime": "EXIF 中无时间戳",
  "photos.statusOutside": "在轨迹时间之外",
  "photos.outsideBy": "相差 {seconds} 秒",
  "photos.refusedTag": "非 JPEG",
  "photos.refused.heic":
    "HEIC/HEIF — 苹果相机格式。请先转换为 JPEG；本工具只写 JPEG。",
  "photos.refused.raw": "相机 RAW（{detail}）— 请用照片工具导出 JPEG。",
  "photos.refused.fujifilm-raf": "富士 RAF — 请用照片工具导出 JPEG。",
  "photos.refused.png": "PNG 在主流工具中没有 EXIF GPS 块 — 请导出为 JPEG。",
  "photos.refused.webp": "此处不写 WebP 的 EXIF — 请导出为 JPEG。",
  "photos.refused.unknown": "无法识别的照片格式。",
  "photos.alreadyGeotagged": "已带有 GPS — 新位置将替换它。",
  "photos.onReconstructed": "手绘修复段",
  "photos.matchedCount": "{matched}/{total} 已匹配",
  "photos.showOnMap": "在地图上显示",
  "photos.showOnMapAria": "在地图上显示 {name}",
  "photos.saveCopy": "保存标记副本",
  "photos.saveCopyAria": "保存 {name} 的标记副本",
  "photos.removeAria": "移除 {name}",

  // -- 写回（§26.2）----------------------------------------------------------
  "photos.writeInPlace": "写入原文件",
  "photos.writeInPlaceAria": "将 GPS 写入原始的 {name}",
  "photos.writeConfirm":
    "覆盖设备上的原始 {name}？“另存为”副本才是安全的默认选择。",
  "photos.writeYes": "覆盖原文件",
  "photos.writeNo": "保持安全",

  // -- 批量 + 页脚（§26.4）-----------------------------------------------------
  "photos.zip": "下载已标记副本（ZIP）",
  "photos.clear": "清除照片",
  "photos.footer":
    "照片永不离开本设备 — 匹配、EXIF 写入和 ZIP 打包全部在你的浏览器中完成。",
};
