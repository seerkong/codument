# Design: add-codument-timeline-report

## 上下文

Git 根目录（`.git` 可以是目录或 worktree 的文件）是扫描边界和仓库去重键。发现一个根目录后，分析器只枚举其直接子目录 `codument/` 中的 Track/Mission 生命周期目录和历史 archive，不再进入该仓库其余内容。

## 方案概览

1. `discoverRepositories(home)` 递归目录名，遇到 `.git` 后以 `realpath` 规范化根目录并停止向其内部递归。
2. `scanCodumentRepository(repo)` 只检查 `codument/tracks`、`codument/missions` 与 legacy `codument/archive`；按资源目录选择当前 authority 优先级：XNL、XML、`plan.xml`/`tasks.xml`。
3. 解析器对 XNL root attributes、XML `<Metadata>` 以及 legacy `metadata.json` 提取创建/更新时间；所有成功日期被标准化为 ISO 8601 UTC。每条记录保留原始格式、生命周期、资源 ID、Git 根及 source path。
4. 输出 `resources.json`、`resources.csv`、`timeline.json` 和 `timeline.html`。时间线按 `created_at` 与 `updated_at` 分桶，分别给 Track/Mission/合计生成序列；HTML 内嵌 SVG，无网络或运行时依赖。

### HTML 分组切换

`timeline.html` 内嵌规范化后的资源记录，而不是只内嵌运行脚本时选择的 buckets。浏览器端在 UTC 下从创建/更新时间即时重算 `quarter`、`month`、`week`（周一开始）和 `day` bucket，并重绘 SVG 与数据表。因此切换按钮不访问网络、不重新扫描磁盘，也不会改变 JSON/CSV 基础数据。

表格按实体类型分栏：Track 的创建、更新、累计在前，Mission 的创建、更新、累计在后。SVG 保留四条事件曲线；鼠标移动到绘图区时，按最近 bucket 显示该 period 的四项数值和垂直指示线。

### Git remote host 过滤

`--remote-host <host>` 在扫描到 Git 根之后读取其全部 `remote.*.url` 配置。解析 SSH URL、HTTPS URL 和 SCP-like `git@host:path` URL 的 host；仅保留至少一个 remote host 与筛选值（大小写无关）相等的仓库。资源扫描、JSON/CSV、时间线和 HTML 都只使用匹配仓库；报告元数据和 HTML 摘要显示该筛选条件。

## 命令接口

```text
bun run codument:timeline -- --home "$HOME" --out ./codument-timeline --group-by week
```

- `--home <dir>`：扫描根，默认用户 home。
- `--out <dir>`：输出目录，默认 `./codument-timeline`。
- `--group-by quarter|month|week|day`：导出 `timeline.json` 的默认统计桶，默认 `week`；HTML 始终可切换四种粒度。
- `--json`：只写 JSON/CSV，跳过 HTML。

## 格式兼容

| Kind | 当前 | 兼容格式 | 元数据优先级 |
| --- | --- | --- | --- |
| Track | `track.xnl` | `track.xml`、`plan.xml`、`tasks.xml` | 根属性/`Metadata`，再到 `metadata.json` |
| Mission | `mission.xnl` | `mission.xml` | 根属性/`Metadata` |

同一资源目录若有多 authority，记录优先级最高的一份，并写入 warning；不同 archive 目录中的历史资源保留为不同记录。

## 风险 / 权衡

- 历史 XML 可能不合法：采用容错字段提取并给出 warning，避免一个坏文件阻断整体统计。
- 日期缺失或不可解析：保留资源记录，但不计入相应时间桶。
- `~` 可能很大：扫描仅读取目录项，发现 `.git` 即截断递归；默认不跟随目录符号链接。

## 验收

- 构造的多个 Git 根能被去重，且不会因仓库嵌套而重复统计。
- 当前和 legacy Track/Mission 格式都能抽取创建和更新时间。
- JSON、CSV、按时间聚合数据和离线 HTML 图表可以生成并彼此一致。
