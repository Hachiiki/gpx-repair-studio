/**
 * Simplified Chinese — help dialog, info dialog, cheat sheet copy (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof help, string> once the keys land (the i18n
 * gate enforces completeness).
 *
 * Vocabulary (docs/i18n-extraction-pattern.md + the shipped dicts):
 * local-first=本地优先, road snapping=道路吸附, elevation lookup=海拔查询,
 * Roads/Footpaths/Straight lines=道路/步行道/直线, Curve pen=曲线笔,
 * share card=分享卡片, session=会话, gap=缺口, basemap=底图,
 * map tiles=地图瓦片, recorded=已记录, reconstructed=重建.
 */

export const zhHelp: Record<string, string> = {
  /** help-dialog.tsx */
  "help.dialog.title": "快捷键与帮助",
  "help.dialog.description":
    "应用里的每一个键盘快捷键，以及每个工具的位置。按",
  "help.dialog.descriptionSuffix": "即可随时重新打开。",

  /** help-content.tsx — the keyboard cheat sheet's own copy. */
  "help.keyboard.fieldNote": "在输入框中输入时，字母键不会触发任何操作。",

  /** help-content.tsx — the map-gesture rows. */
  "help.map.title": "地图",
  "help.map.gestureScroll": "滚动",
  "help.map.gesturePinch": "捏合",
  "help.map.zoom": "放大与缩小",
  "help.map.gestureDrag": "拖动",
  "help.map.pan": "平移地图（编辑器中的平移模式）",
  "help.map.gestureDoubleClick": "双击",
  "help.map.zoomStep": "放大一级",

  /** help-content.tsx — the guided walkthroughs list. */
  "help.tours.title": "引导式导览",
  "help.tours.blurb":
    "每个工具都有一段简短的任务式导览 — 3 到 4 步，途中还能加载教学示例。想重温多少次都可以。",
  "help.tours.start": "开始",

  /** help-content.tsx — the "where everything lives" guide. */
  "help.where.title": "一切都在哪里",
  "help.where.body":
    "首页是七张工具卡片 — 修复、分享卡片、找回缺口、从数据创建、合并、规划路线和批量清理。点开一张卡片即可了解该工具如何工作，并看到它的上传或启动控件；“全部工具”会返回卡片页。第一次用？首页的“跟着导览走一遍”链接随时可以重放导览，每个工具在上面的部分里还有自己的引导式导览。你保存的会话位于页头的“会话”按钮之后（也就是首页的“继续已保存的会话”链接）— 那个对话框可以保存、重新打开、重命名、导出和导入会话文件（.gpxrepair.json）。",

  /** info-dialog.tsx */
  "info.tablistAria": "关于本应用",
  "info.tab.about": "关于",
  "info.tab.privacy": "隐私与数据",
  "info.tab.aboutTitle": "关于 GPX Repair Studio",
  "info.tab.privacyTitle": "隐私与数据",

  /** PrivacyPane — the promise. */
  "info.privacy.promise.title": "其余一切都在这台设备上运行",
  "info.privacy.promise.body":
    "读取文件、解析、缺口检测、绘制、测地计算、时间戳重建、统计、合并与导出，全部在这个浏览器标签页中执行。没有账户，没有服务器副本，没有数据分析，也没有 Cookie。关闭标签页，内存中的一切随之销毁。",

  /** PrivacyPane — the egress table. */
  "info.privacy.egress.title": "什么会离开这个浏览器 — 完整清单",
  "info.privacy.egress.whenWhere": "何时与去向",
  "info.privacy.egress.whatSent": "发送的内容",
  "info.privacy.egress.tiles.trigger": "地图处于可见状态",
  "info.privacy.egress.tiles.destination":
    "地图瓦片 — OpenFreeMap（默认）或 OpenStreetMap 栅格",
  "info.privacy.egress.tiles.payload":
    "可见区域的瓦片坐标（x/y/z），外加任何网络请求都会携带的标准元数据（IP 地址、用户代理）。仅瓦片级别 — 低缩放级别下约为公里级。绝不会发送你的 GPX，也绝不会发送精确位置。",
  "info.privacy.egress.road.trigger":
    "你启用道路吸附（道路 / 步行道 / 吸附到道路 — 你同意之前保持关闭，每个会话都会重新询问）",
  "info.privacy.egress.road.destination":
    "公共路由服务 — OSRM（道路）与 Valhalla（步行道），或你自己的 OSRM 兼容服务器",
  "info.privacy.egress.road.payload":
    "你绘制线条的点 — 路径样式发送逐段的端点，“吸附到道路”发送所画线条的点。绝不会发送文件，也绝不会发送已记录的点。在你启用之前不会发送任何内容；启用期间页脚会如实说明，而直线与曲线笔完全在本地 — 不发出任何请求。",
  "info.privacy.egress.elevation.trigger":
    "你主动选择进行一次海拔查询（每次重建一次，之前会先展示披露说明）",
  "info.privacy.egress.elevation.destination":
    "Open-Meteo 海拔 API（Copernicus DEM GLO-90）",
  "info.privacy.egress.elevation.payload":
    "仅重建点的坐标 — 确认之前会显示点数。绝不会发送整个文件，也绝不会发送已记录的路线。默认关闭；你不请求就不会有任何获取。",
  "info.privacy.egress.footnote":
    "以上就是全部清单。核心流程 — 上传、检查、用直线或曲线绘制、时间重建、统计、合并、导出、分享卡片 — 不发出任何请求；而且有一个自动化测试用严格的网络白名单运行这条流程，一旦联系了其他任何东西就会失败。道路吸附是唯一由你自己打开的一行：它保持关闭、不发送任何内容，直到你为某个会话启用它。",

  /** PrivacyPane — offline behavior（阶段 22：Service Worker 把应用本身与看过的瓦片留在设备上）。 */
  "info.privacy.offline.title": "离线使用",
  "info.privacy.offline.body":
    "首次访问之后，应用本身会保存在这台设备上，断网也能打开 — 在浏览器菜单里“安装应用 / 添加到主屏幕”，它就能独立运行，山里也一样。你看过的底图瓦片也会保留（有上限），所以浏览过的地图离线时依然清晰；缺少瓦片时，底图会退回纯色背景 — 路线、缺口和每一条画出的线仍会渲染在上面。除上面三行以外的一切都可以在断网时使用：上传、解析、检查、绘制（直线与曲线）、时间重建、统计、合并、导出，以及分享卡片。",

  /** PrivacyPane — provider switching. */
  "info.privacy.providers.title": "选择服务提供方",
  "info.privacy.providers.basemapLabel": "底图：",
  "info.privacy.providers.basemapBody":
    "地图工具栏的底图控件（图层图标）可在 OpenFreeMap 与 OpenStreetMap Standard 栅格之间切换 — 随你的设置一起记住。",
  "info.privacy.providers.roadLabel": "道路跟随：",
  "info.privacy.providers.roadBody":
    "在你启用之前保持关闭 — 绘图工具会先询问，启用期间页脚会如实说明，每次重新加载页面都会再次询问。默认由 OSRM 服务“道路”路径样式，Valhalla 服务“步行道” — 公共演示服务器，设计上就是尽力而为。某个服务不可达时，线条会退回直线段，直到它恢复，编辑器也会如实说明。你也可以把两种样式 — 以及“吸附到道路”命令 — 指向你自己的服务器：",
  "info.privacy.providers.elevationLabel": "海拔：",
  "info.privacy.providers.elevationBody":
    "Open-Meteo（Copernicus DEM GLO-90）是目前唯一的服务方，且每次重建都需要单独选择 — 发送任何内容之前，会先展示带有精确点数的披露说明。",

  /** PrivacyPane — on-device storage. */
  "info.privacy.storage.title": "这台设备存储了什么",
  "info.privacy.storage.settingsTitle": "设置 — localStorage",
  "info.privacy.storage.settingsBody":
    "你的缺口阈值、底图选择、单位、导出偏好，以及最后打开的工具。只有设置 — 绝不是 GPX 数据。",
  "info.privacy.storage.sessionsTitle": "未完成的工作 — IndexedDB",
  "info.privacy.storage.sessionsBody":
    "在你绘制期间，原始文件的字节和你的编辑（点、范围、设置）会自动保存 — 每个工具一条记录，最多四条，这样重新加载或关闭标签页时会帮你找回工作，而不是丢失它。绝不会上传。可以用“放弃”或首页的“清除所有已保存的会话”、工作区里的“重新开始”，或在浏览器中清除本站数据来清空它。",

  /** PrivacyPane — 阶段 22 的两个设备端缓存（海拔地形 + Service Worker 的离线副本），各带清除按钮。 */
  "info.privacy.storage.elevationTitle": "海拔地形 — IndexedDB",
  "info.privacy.storage.elevationBody":
    "海拔工具解析过的每个点都保存在这台设备上 — 坐标四舍五入到约一米，上限 5,000 个点 — 这样同一片山坡不会被重复获取（也不会被重复发送），重新加载后也一样。清除它不会影响其他任何数据；新的获取只是从头开始积累。",
  "info.privacy.storage.elevationCount": "已存储 {count} 个点",
  "info.privacy.storage.elevationClear": "清除地形缓存",
  "info.privacy.storage.elevationCleared": "已清除 — 移除了 {count} 个点。",
  "info.privacy.storage.offlineTitle": "离线应用与看过的瓦片 — Cache Storage",
  "info.privacy.storage.offlineBody":
    "Service Worker 会保留应用自身的文件（预缓存 + 运行时缓存）和你看过的底图瓦片（上限 800 块），工作室因此可以断网打开并继续工作。清除时也会注销该 Worker — 下次联网访问时会重新安装并重新下载所需的内容。",
  "info.privacy.storage.offlineClear": "清除离线缓存",
  "info.privacy.storage.offlineCleared": "已清除 — 应用会在下次联网访问时重新安装。",
  "info.privacy.storage.unavailable":
    "此浏览器无法使用持久化存储（无痕模式或存储被阻止）— 缓存仅存在于本次会话的内存中。",
  "info.privacy.storage.footnote":
    "没有 Cookie，没有数据分析，没有账户。如果你清除站点数据并关闭标签页，任何地方都不会留下任何东西。",

  /** PrivacyPane — the routing provider setting. */
  "info.privacy.router.title": "你自己的路由服务器（可选）",
  "info.privacy.router.label":
    "OSRM 兼容的基础 URL — 例如 https://osrm.example.com",
  "info.privacy.router.saved":
    "已保存 — 路由现在会前往你的服务器（启用道路吸附之后）。",
  "info.privacy.router.save": "保存 URL",
  "info.privacy.router.reset": "使用公共服务器",
  "info.privacy.router.note":
    "OSRM 兼容服务器提供与演示服务器相同的路线 API — 自建的 osrm-routed 以其构建时的 profile 为准，因此“道路”和“步行道”都会跟随它。README 的自建章节有完整说明；这里不填 URL 时，使用上面的公共演示服务器。",

  /** AboutPane. */
  "info.about.title": "一个本地优先的 GPX 文件工作台",
  "info.about.p1":
    "GPX Repair Studio 的存在，是因为 GPS 记录总会以可预料的方式出问题 — 隧道和市中心楼宇间的信号丢失、只留下数字却丢了地图的手表、把一次活动拆成几段的平台。六个工具负责修复这些文件，而每一个都完全在你的浏览器中运行：你在这里打开的任何内容都不会被上传。",
  "info.about.p2Prefix": "整个应用建立在一个原则之上：",
  "info.about.p2Principle": "已记录的数据与重建的数据绝不混淆",
  "info.about.p2Rest":
    "。统计会标明哪些是实测、哪些是绘制；导出会标记每一个重建点，让 Strava 这类平台能看出差别；原始记录绝不会被修改 — 修复只是添加在它旁边，而撤销总能带你回到原样。",
  "info.about.attributionsTitle": "基于开放数据与开放软件构建",
  "info.about.credit.mapLibre": "开源的 WebGL 地图渲染（BSD-2-Clause）。",
  "info.about.credit.tiles":
    "地图瓦片 — 经 OpenFreeMap 提供的 Positron 样式，以及经典栅格瓦片。地图数据 © OpenStreetMap 贡献者。",
  "info.about.credit.routing":
    "“道路”与“步行道”画笔的道路跟随，由其公共演示服务器提供（OpenStreetMap 数据）。",
  "info.about.credit.elevation":
    "需要主动选择的海拔查询。© Open-Meteo.com — 包含经过修改的 Copernicus 数据。",
  "info.about.credit.fonts":
    "字体系统 — 随应用自托管，运行时不发出任何字体请求。",
  "info.about.version": "版本 {version} · 本地优先 · 无跟踪",
};
