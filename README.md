# dsh-billing-hud

DeepSeek Harness 的**计费悬浮条**：一个插件同时做三件事，全部可在设置里开关。

| 位置 | 内容 |
| --- | --- |
| 输入框下方 | 本会话预估花费（`¥0.42`），悬停看缓存命中 / 未命中 / 输出的分行明细 |
| 侧边栏头像上方 | 账户余额 + 高峰/空闲状态点 + 充值入口 |
| 设置 → 插件 | 「计费悬浮条」设置页：两个读数的开关、时段判定、货币符号、刷新间隔、单价表 |

插件还对外提供 `priceBand` 客户端服务：任何插件都能 `ctx.get('priceBand')` 复用同一份
"北京时间高峰/空闲 + 中国法定节假日" 日历，避免各算各的。

> 无账号绑定：插件不读取、不保存、不上传任何凭证。余额那一行只显示本机已登录账号
> 的界面数据，**关掉它就不会再发起任何账户请求**；费用估算完全在浏览器里算。

## 安装

需要 DeepSeek Harness `0.2.2` 或更新版本（含 `dsh.client` 双面包机制）。

### 方式一：界面安装（推荐）

1. 把本仓库克隆或下载到自己的 DSH 工作区，例如 `<工作区>/dsh-billing-hud`：

   ```powershell
   git clone https://github.com/Jinquan-Leung/dsh-billing-hud.git
   ```

2. 打开 DSH → **设置 → 插件** → **添加插件**（Add plugin），选择这个目录。
3. 插件列表里出现 **计费悬浮条 / Billing HUD**，提示已应用即生效（必要时刷新页面）。

### 方式二：让 Agent 装

在 DSH 里对 Agent 说：

> 把 `<路径>/dsh-billing-hud` 这个本地插件装进当前 profile

Agent 会用 `plugin_manager` 的 `install_bundle` 完成同样的操作。

### 方式三：Release 包

从 Releases 下载最新的 `dsh-billing-hud-<版本>.tgz`，解压后按方式一添加目录。

## 配置

**设置 → 插件 → 计费悬浮条**：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| 显示会话花费 | 开 | 关闭后输入框下方不再显示金额 |
| 显示账户余额 | 开 | 关闭后侧边栏不再显示余额，也**不再发起任何账户请求** |
| 按年拉取中国法定节假日 | 开 | 关闭后只用内置的 2026 年区间判断高峰/空闲 |
| 时段判定 | 自动 | 可固定为「高峰」或「空闲」，便于对账或截图 |
| 货币符号 | `¥` | 费用读数用的符号（最长 4 字符） |
| 余额刷新间隔 | 60 秒 | 范围 15–3600 秒；窗口失焦时不轮询 |
| 单价表（JSON） | `{}` | 覆盖内置单价，见下 |

设置保存在**本机浏览器**（`localStorage`，键 `dsh.billing-hud.settings.v1`），不写入
DSH 配置、不同步、不共享。

### 单价表

内置表按 DeepSeek 公开价（元 / 百万 token）写死，高峰与空闲两档：

```json
{
  "models": {
    "deepseek-flash": {
      "peak":    { "cacheRead": 0.04, "cacheMiss": 2, "output": 8 },
      "offPeak": { "cacheRead": 0.02, "cacheMiss": 1, "output": 4 }
    },
    "deepseek-v4-pro": {
      "peak":    { "cacheRead": 0.3, "cacheMiss": 9, "output": 27 },
      "offPeak": { "cacheRead": 0.15, "cacheMiss": 4.5, "output": 13.5 }
    }
  },
  "aliases": { "deepseek-v4-flash": "deepseek-flash" },
  "fallback": "deepseek-flash",
  "unitTokens": 1000000
}
```

只需覆盖要改的部分，其余继承内置表：

```json
{ "models": { "deepseek-flash": { "peak": { "output": 9 } } } }
```

模型键也支持 `provider/model` 精确匹配（优先级最高）；找不到时回落到 `fallback`。
填 `{}` 或点「恢复内置表」即回到默认。

## 工作原理

- **时段**：北京时间周一至周五 09:00–12:00、14:00–18:00 为高峰；周末与中国法定节假日
  全天空闲；空闲单价为高峰的一半。内置 2026 年官方区间，并按年从
  [`NateScarlet/holiday-cn`](https://github.com/NateScarlet/holiday-cn)（国务院办公厅公告的机器可读镜像，
  jsDelivr → GitHub raw 两个源）刷新，缓存 24 小时；失败时静默回落到内置表。
- **花费**：读会话的 `tokenUsage` 投影（缓存命中 / 未命中 / 缓存写入 / 输出四个桶）与
  `modelSelection` 投影（`lastUsed` 优先），按单价表相乘。缓存写入按未命中输入计价。
- **余额**：读 `ctx.remote.account` 的 `getState` + `getBalance`，按配置间隔轮询；
  只展示，不写入。

## 兼容性

- 依赖的槽位：`conversation.composer.dock`、`sidebar.footer.action`、`settings.plugins.tab`
- 提供的服务：`priceBand`（`resolveBand` / `isHoliday` / `getSnapshot` / `subscribe` / `refresh`）
- 验证环境：DSH `0.2.2-rc.5`，Windows 11，Electron Web GUI
- 插件停用后，其他消费方回落到各自的"星期几 + 时间窗口"近似判定，不会报错

## 文件结构

```
package.json       dsh.bundle.patch + dsh.client 声明
cordis.patch.yml   一行：插入本包（Host 半边为空）
index.js           Host 半边：export function apply() {}
client.js          全部逻辑：priceBand 服务 + 两个读数 + 设置页
locale/            插件标题与描述（中 / 英）
icon.svg           插件图标
```

## 开发

```powershell
node --check client.js        # 语法自检
```

改完 `client.js` 后在设置 → 插件里重启本插件即可，无需构建步骤（纯浏览器 ES5+ 语法，
React 从宿主模块表取）。

## English

A billing HUD for DeepSeek Harness: a shared peak/off-peak price calendar (`priceBand`
client service), the session cost beside the composer token stats, and the account
balance above the sidebar avatar. Everything is configurable from
**Settings → Plugins → Billing HUD**, stored per browser in `localStorage`.
No credential is read, stored, or sent anywhere; turning the balance row off stops
every account request. Install by adding this directory through
**Settings → Plugins → Add plugin**. MIT licensed.

## License

[MIT](LICENSE)
