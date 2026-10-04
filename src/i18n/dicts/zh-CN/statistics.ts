/**
 * Simplified Chinese — stats panel, splits, elevation profile (Phase 21).
 *
 * TEMPORARILY untyped while extraction proceeds; tightened to
 * Record<keyof typeof statistics, string> once the keys land (the i18n
 * gate enforces completeness).
 *
 * Vocabulary (docs/i18n-extraction-pattern.md): recorded=已记录,
 * reconstructed=重建, estimated=估算, mixed=混合, pace=配速,
 * split=分段, moving time=移动时间, elapsed/wall time=总耗时,
 * elevation=海拔, working copy=工作副本.
 */

export const zhStatistics: Record<string, string> = {
  /** ProvenanceBadge — the §L-2 vocabulary. */
  "stats.provenance.recorded": "已记录",
  "stats.provenance.estimated": "估算",
  "stats.provenance.mixed": "混合",
  /** The lowercase inline variants. */
  "stats.provenanceWord.recorded": "已记录",
  "stats.provenanceWord.estimated": "估算",
  "stats.provenanceWord.mixed": "混合",

  /** StatsPanel. */
  "stats.title": "统计",
  "stats.desc.working":
    "从工作副本重新计算 — 包含已确认的修复，原始文件未被改动。",
  "stats.desc.repairs": "原始记录加上已提交的修复 — 每个估算值都标注了来源。",
  "stats.desc.original": "仅原始记录 — 尚未包含修复。",
  "stats.statsCsv": "统计 CSV",
  "stats.print": "打印",

  /** The working-copy disclosure. */
  "stats.working.label": "已修改：",
  "stats.working.pointsRemoved.one": "删除了 {count} 个点",
  "stats.working.pointsRemoved.many": "删除了 {count} 个点",
  "stats.working.segmentsSplit.one": "拆分了 {count} 段",
  "stats.working.segmentsSplit.many": "拆分了 {count} 段",
  "stats.working.copiesInserted.one": "插入了 {count} 份副本",
  "stats.working.copiesInserted.many": "插入了 {count} 份副本",
  "stats.working.manualReorders.one": "{count} 次手动重排",
  "stats.working.manualReorders.many": "{count} 次手动重排",
  "stats.working.segmentsSorted.one": "按时间排序了 {count} 段",
  "stats.working.segmentsSorted.many": "按时间排序了 {count} 段",
  "stats.working.elevationsSmoothed.one": "平滑了 {count} 个海拔值",
  "stats.working.elevationsSmoothed.many": "平滑了 {count} 个海拔值",
  "stats.working.suffix": "此处的数字反映工作副本，而非原始文件。",

  /** The outcome banner. */
  "stats.outcome.original": "原始",
  "stats.outcome.repaired": "+ 修复",
  "stats.outcome.outcome": "结果",
  "stats.outcome.moving": "移动时间 {duration}",
  "stats.outcome.durationPending": "时长待定",
  "stats.outcome.estTime": "+{duration}（估算）",

  /** The stats table's scaffolding. */
  "stats.metric": "指标",
  "stats.value": "数值",
  "stats.source": "来源",
  "stats.group.distance": "距离",
  "stats.group.time": "时间",
  "stats.group.pace": "配速",
  "stats.group.elevation": "海拔",

  /** Row labels — distance. */
  "stats.recordedDistance": "已记录距离",
  "stats.repairedDistance": "修复距离",
  "stats.totalWithRepairs": "含修复的总距离",
  "stats.totalDistance": "总距离",

  /** Row labels — time. */
  "stats.recordedMovingTime": "已记录移动时间",
  "stats.wallTime": "总耗时",
  "stats.repairTime": "修复时间",
  "stats.movingInclRepairs": "含修复的移动时间",
  "stats.totalDurationEntered": "总时长（手动输入）",

  /** The unsupported-statistic em dash's reasons. */
  "stats.noTiming": "此文件没有时间数据",
  "stats.notMonotonic": "时间戳非单调递增",
  "stats.needDurations": "修复仍缺少时长",
  "stats.enterDuration": "请输入总时长",
  "stats.noRecordedEle": "此文件没有已记录的海拔",
  "stats.insufficientEle": "海拔数据不足 — 仅 {percent}% 的点带有海拔",

  /** The §L-1 pace rows. */
  "stats.paceRecorded": "配速（已记录）",
  "stats.paceRepairs": "配速（修复）",
  "stats.paceOverall": "整体配速",
  "stats.notComputableTitle": "无法计算",
  "stats.notComputable": "无法计算",

  /** The §L-1 elevation rows. */
  "stats.eleGainLoss": "海拔爬升 / 下降",
  "stats.eleGainRecorded": "海拔爬升（已记录）",
  "stats.eleGainRepairs": "海拔爬升（修复）",
  "stats.eleGainTotal": "海拔爬升（总计）",
  "stats.eleLossRecorded": "海拔下降（已记录）",
  "stats.eleLossRepairs": "海拔下降（修复）",
  "stats.eleLossTotal": "海拔下降（总计）",
  "stats.eleGain": "海拔爬升",
  "stats.eleLoss": "海拔下降",

  /** The notes under the table. */
  "stats.note.insufficient":
    "海拔数据不足 — 仅 {percent}% 的点带有海拔，因此不给出爬升和下降，也不做估算。",
  "stats.note.thresholdRepairs":
    "爬升/下降使用 {threshold} 米噪声阈值（小于该值的变化视为 GPS/DEM 噪声）；修复路段根据 {sources} 的地形估算。",
  "stats.note.thresholdOriginal":
    "爬升/下降使用 {threshold} 米噪声阈值（小于该值的变化视为 GPS/DEM 噪声）；仅使用原始海拔 — 没有估算的修复不参与计算。",
  "stats.note.eleService": "海拔服务",
  "stats.note.repairsWithoutEle.one":
    "{count} 处修复没有海拔估算 — 打开该修复并使用“估算海拔”将其计入。",
  "stats.note.repairsWithoutEle.many":
    "{count} 处修复没有海拔估算 — 打开该修复并使用“估算海拔”将其计入。",
  "stats.note.reimport":
    "{count} 个点在此文件中由先前的修复重建 — 它们计入修复距离而非已记录距离，地图上也按修复绘制。",
  "stats.note.noTiming":
    "此文件没有时间数据 — 除非输入时长（逐个修复，或整个活动的总时长），时间和配速统计不可用。",
  "stats.note.repairDuration.one":
    "{count} 处修复仍需要时长 — 其时间尚未计入（打开该修复的编辑器添加）。",
  "stats.note.repairDuration.many":
    "{count} 处修复仍需要时长 — 其时间尚未计入（打开该修复的编辑器添加）。",
  "stats.note.discrepancy.one":
    "{count} 个手动时长与已记录的缺口跨度不一致 — 时间戳以手动值为准；已记录的时间戳从不改动。",
  "stats.note.discrepancy.many":
    "{count} 个手动时长与已记录的缺口跨度不一致 — 时间戳以手动值为准；已记录的时间戳从不改动。",
  "stats.note.gapSpan.one":
    "总耗时包含 {duration}，分布在 {count} 个缺口跨度上（不计入移动时间）。",
  "stats.note.gapSpan.many":
    "总耗时包含 {duration}，分布在 {count} 个缺口跨度上（不计入移动时间）。",
  "stats.note.reversedLegs.one": "{count} 段时间戳倒序的路段 — 按 0 时长计。",
  "stats.note.reversedLegs.many": "{count} 段时间戳倒序的路段 — 按 0 时长计。",
  "stats.note.untimedLegs.one":
    "{count} 段没有可用时间戳的路段 — 不计入移动时间。",
  "stats.note.untimedLegs.many":
    "{count} 段没有可用时间戳的路段 — 不计入移动时间。",
  "stats.note.excludedLegs.one":
    "排除了 {count} 段距离路段 — 坐标损坏（无效：{invalid}，超出范围：{outOfRange}，零坐标：{zero}）。",
  "stats.note.excludedLegs.many":
    "排除了 {count} 段距离路段 — 坐标损坏（无效：{invalid}，超出范围：{outOfRange}，零坐标：{zero}）。",

  /** The per-split honesty flags. */
  "stats.flags.gapLeg.one": "{count} 段缺口",
  "stats.flags.gapLeg.many": "{count} 段缺口",
  "stats.flags.untimedLeg.one": "{count} 段未计时",
  "stats.flags.untimedLeg.many": "{count} 段未计时",
  "stats.flags.reversedLeg.one": "{count} 段倒序",
  "stats.flags.reversedLeg.many": "{count} 段倒序",

  /** TimeInMotionCard. */
  "stats.motion.title": "移动中的时间",
  "stats.motion.desc":
    "停顿指隐含速度低于 {speed} m/s 的时间 — 已记录的缺口不计入（设备停止写入，未必是停止移动）。按导出时的路线计算。",
  "stats.motion.inMotion": "移动中",
  "stats.motion.inMotionOf": "占 {wall} 总耗时",
  "stats.motion.stopped": "已停止",
  "stats.motion.stopsSummary.one": "{count} 次停顿 · 最长 {longest}",
  "stats.motion.stopsSummary.many": "{count} 次停顿 · 最长 {longest}",
  "stats.motion.noStops": "未检测到停顿",
  "stats.motion.colTimeBucket": "时间类别",
  "stats.motion.movingTime": "移动时间",
  "stats.motion.excludesGap.one": "不含 {count} 段缺口（{gapTime}）",
  "stats.motion.excludesGap.many": "不含 {count} 段缺口（{gapTime}）",
  "stats.motion.stoppedTime": "停止时间",
  "stats.motion.bookkeepingTail": "— 已计数，绝不猜测归入上方各类别。",
  "stats.motion.hideStops": "隐藏停顿列表",
  "stats.motion.listStops.one": "列出 {count} 次停顿",
  "stats.motion.listStops.many": "列出 {count} 次停顿",
  "stats.motion.colIndex": "#",
  "stats.motion.colStarted": "开始时间",
  "stats.motion.colAt": "位置",
  "stats.motion.colDuration": "时长",

  /** StatsPrintHeader; the wordmark stays English. */
  "stats.print.sheet": "活动统计表",
  "stats.print.privacyLine": "全部在浏览器中本地计算 — 没有数据离开这台设备。",

  /** SplitsCard. */
  "splits.title": "分段与配速",
  "splits.kilometer": "公里",
  "splits.mile": "英里",
  "splits.desc":
    "导出时路线的每{unit} — 工作副本加已提交的修复。跨越重建路段的分段会标注；单位跟随上方的配速开关。",
  "splits.ariaPaceChart":
    "每{unit}的平均配速 — 越慢的分段柱越高；橙色柱包含重建（估算）路段。",
  "splits.noTiming": "此文件没有时间数据 — 下方分段仅显示距离和海拔。",
  "splits.hideTable": "隐藏分段表",
  "splits.showTable": "显示分段表",
  "splits.capNote": "正在显示 {total} 个分段中的 {shown} 个 — 统计 CSV 包含每一个。",
  "splits.colSplit": "分段",
  "splits.colDistance": "距离",
  "splits.colTime": "时间",
  "splits.colAvgPace": "平均配速",
  "splits.colGain": "爬升",
  "splits.partialTimeTitle": "部分时间 — 这些路段计入了距离但没有时间",
  "splits.est": "估",
  "splits.showMore": "再显示 {count} 个分段",
  "splits.total": "总计",
  "splits.totalRow.one":
    "共 {count} 个分段，每段 1 {unit} — 爬升使用 {threshold} 米滞回死区，在每段爬升完成处计入。",
  "splits.totalRow.many":
    "共 {count} 个分段，每段 1 {unit} — 爬升使用 {threshold} 米滞回死区，在每段爬升完成处计入。",
  "splits.denseNote": "{count} 根柱 — 此密度下已关闭悬停读数",
  "splits.barTitle": "分段 {index} — {pace}（{provenance}）",
  "splits.barNoTime": "无时间",

  /** ElevationProfileChart. */
  "profile.title": "海拔剖面",
  "profile.desc":
    "{min} 至 {max}，全程 {distance} — 已记录路段为实线，重建路段为估算。",
  "profile.readoutHint": "悬停，或聚焦后用方向键读取数值",
  "profile.readout.noEle": "在 {distance} — 无海拔记录",
  "profile.readout.at": "在 {distance} — {elevation}（{kind}）",
  "profile.kindRecorded": "已记录",
  "profile.kindReconstructed": "重建，估算",
  "profile.ariaLabel":
    "海拔剖面，自 {min} 至 {max}，全程 {distance}{gainLoss}。重建路段为估算值。聚焦此图并使用方向键读取数值。{cursor}",
  "profile.ariaCursor": "光标：{readout}",
  "profile.legendReconstructed": "重建（估算）",
  "profile.hideTable": "隐藏剖面表",
  "profile.showTable": "显示剖面表",
  "profile.tableNote":
    "与图表所绘相同的显示序列（为便于阅读做了轻度平滑） — 共 {count} 个距离区间。",
  "profile.colInterval": "距离区间",
  "profile.colStart": "起点",
  "profile.colEnd": "终点",
  "profile.colMin": "最小",
  "profile.colMax": "最大",
};
