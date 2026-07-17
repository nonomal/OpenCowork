# SSH 子系统重写设计

> 前置阅读：`01-current-design-analysis.md`。
> 目标：单一传输栈、凭据加密、连接复用 + 断线重连、类型化 IPC 契约、可维护的模块边界。功能对齐现有产品面（终端多 tab、SFTP 双窗格、导入导出、密钥链、监控）。

## 0. 首要决策：统一到哪条传输栈

| | 方案 A（推荐）：主进程 ssh2 单栈多路复用 | 方案 B：sidecar + 系统 OpenSSH 单栈 |
|---|---|---|
| 原理 | 每个活跃连接一个 ssh2 `Client`，认证一次；terminal shell / SFTP subsystem / exec channel 全部复用同一条已认证连接 | 终端改为 node-pty spawn `ssh`，文件/exec 维持现状 |
| 密码认证 | 原生支持，无 askpass hack | 必须保留 askpass 临时脚本 hack |
| 连接复用 | 天然复用（SSH channel 多路复用是协议内建） | OpenSSH ControlMaster 可做，但 Windows named pipe 支持差 |
| 跨平台一致性 | 完全一致（纯 JS 协议栈，不依赖用户机器） | 依赖系统 OpenSSH 版本/配置，Windows 需另装 |
| 用户 ~/.ssh/config、FIDO2、硬件 key | 弱（ssh2 不读 config，agent 支持一般） | 强（免费获得全部 OpenSSH 能力） |
| 大文件传输性能 | JS SFTP 中等（几十 MB/s 级，够用） | 原生 scp/sftp 快 |
| 迁移成本 | 栈 A 已在用 ssh2，SFTP/exec 是增量；可删 sidecar 7.3k 行 SSH 代码 | 终端重写 + 保留全部 askpass/进程管理复杂度 |

**推荐 A**：本产品的核心诉求是"应用内一致、可控的连接体验 +Agent 工具调用"，而不是复刻本机 ssh CLI。A 消除双栈、消除明文 askpass、每连接认证一次、SFTP 不再按操作 spawn 进程。若日后大目录传输成为瓶颈，可在契约不变的前提下给 transfer 加 sidecar fast-path（决策点，见 M4）。

以下设计按方案 A 展开；所有 IPC 契约刻意做到**传输实现无关**，选 B 也不影响第 2、4、5 节。

## 1. 目标架构

```
┌──────────────────────── Renderer ────────────────────────┐
│ features/ssh/                                            │
│   stores/   connections-store · sessions-store           │
│             sftp-store · transfers-store · ssh-ui-store  │
│   rpc/      ssh-rpc.ts —— 唯一 IPC 出入口，类型来自 shared │
│   views/    library/ · connect/ · workspace/（拆小组件）   │
└───────────────────────────┬──────────────────────────────┘
                            │ 类型化 MessagePack IPC
┌───────────────────────────▼──────────────────────────────┐
│ src/main/ssh/                                            │
│   ipc.ts                薄注册层，逐 channel 绑定契约类型   │
│   connection-manager.ts 连接池：connectionId → Handle      │
│   connection-handle.ts  状态机+认证+keepalive+重连+引用计数 │
│   auth.ts               凭据解析 · agent · proxyJump 链    │
│   terminal-service.ts   shell channel ×N · OutputRing     │
│   sftp-service.ts       fs 操作 · 目录流式分页             │
│   transfer-service.ts   任务队列 · 并发限流 · 进度 · 重试   │
│   exec-service.ts       exec channel（监控/安装公钥复用）   │
│   repository.ts         native db RPC + safeStorage 加密   │
│   openssh-config.ts     ~/.ssh/config 解析（导入/别名跳板） │
│   import-export.ts      两源导入 · 冲突策略（保留现有语义）  │
└──────────────────────────────────────────────────────────┘
src/shared/ssh/contract.ts   channel 名 + 全部 req/res/event 类型（单一事实源）
```

删除：`ssh-connection-payload.ts`、`ssh-dao.ts`、sidecar `Modules/Ssh/*`（M4 收尾时）、`ssh-config.ts` 的轮询缓存。

## 2. 持久化与凭据安全（重写"保存"流程）

### 2.1 存储

> 修正（2026-07-17 实施前核实）：主进程已不再直接开 SQLite——`src/main/db/database.ts` 整体委托 native worker（`db/initialize`）。因此仓储不引入 better-sqlite3，而是**复用现成的 `db/ssh-*` native RPC**（`ssh-dao.ts` + sidecar `DbSshTools.cs`，即原分析中的"死代码"路径——它正是与当前 DB 架构一致的预留实现，本次接线启用）。

- 存储：native SQLite 表 `ssh_groups` / `ssh_connections`（含现成的 `encrypted_password` / `encrypted_passphrase` 列）。
- **加解密只发生在主进程**：`safeStorage.encryptString` 产出的密文以 `v1:safe:<base64>` 格式写入 encrypted_* 列；sidecar 只见密文，不持有密钥。解密按需（建连/注入 stack B payload 时），不进常驻缓存。
- **secret 永不出主进程（不发往渲染端）**：`ssh:connection:list/get` 返回的 DTO 只带 `hasPassword/hasPassphrase`。表单沿用"留空 = 不修改"的只写语义；`null` 显式清除。
- `safeStorage.isEncryptionAvailable()` 为 false 时（Linux 无 keyring）降级为 `v1:plain:<base64>` 标记落库并在 UI 提示，不静默。

### 2.2 迁移

首次启动检测 `~/.open-cowork.json`：导入全部 groups/connections（secret 即时加密入库）→ 原文件改写为去 secret 版本并备份 `.bak`。迁移幂等（以 id 去重）。

### 2.3 同步

删除 30s 轮询。所有 mutation 在 repository 层完成后**直接广播 delta 事件** `ssh:config:event = {type:'group-upserted'|'connection-upserted'|'deleted', payload}`，渲染端增量更新，不再 `loadAll()` 全量重载。

## 3. 连接运行时（重写"连接"流程）

### 3.1 ConnectionHandle：一个连接一个句柄，所有消费者共享

```ts
type HandleState =
  | 'idle' | 'connecting' | 'ready'
  | 'reconnecting'   // 掉线后自动重试（指数退避，上限可配）
  | 'closed' | 'failed'

interface ConnectionHandle {
  connectionId: string
  state: HandleState
  client: Ssh2Client            // 唯一已认证连接（含 jump 链）
  channels: {
    terminals: Map<terminalId, TerminalChannel>  // N 个 shell
    sftp: SftpSession | null                     // 懒建，共享
  }
  refs: Set<ConsumerRef>        // terminal tab / sftp pane / monitor
}
```

- **引用计数生命周期**：第一个消费者触发建连，最后一个释放后延迟（如 60s）关闭，期间新消费者直接复用。终端、SFTP 双窗格、进程监控不再各自认证。
- **认证一次**：password/passphrase 由 repository 解密 → 建连 → 立即从局部变量置空。私钥读取改 `fs.promises`，读取前校验文件 mode（非 0600 给警告）。
- **proxyJump 链**：保留三形态解析语义，支持多级（`a,b,c`），每级复用已有 Handle（跳板本身是保存的连接时）。
- **keepalive + 自动重连**：ssh2 keepalive 判死 → 进入 `reconnecting`，指数退避重连；重连成功后终端 channel 重建并注入提示行，SFTP session 懒重建。渲染端状态机同步展示 `reconnecting`。
- 超时统一用 `AbortSignal` 贯穿（消除 setTimeout 双 resolve 竞态）；Handle 销毁时集中 `removeAllListeners`。

### 3.2 终端数据面（保留现有亮点，独立成模块）

- `TerminalChannel` = shell channel + `OutputRing`（seq + 环形缓冲，默认 1MB/终端，从会话结构中拆出、可独测）。
- IPC 面不变理念、改名对齐契约：`ssh:terminal:open/close/write/resize`，事件 `ssh:terminal:data {terminalId, seq, data}`、`ssh:terminal:replay` 拉历史。
- 一个连接开多个终端 tab = 同 Handle 多 shell channel（现状是多次完整连接）。

### 3.3 SFTP / exec / 传输

- 全部 `ssh:fs:*` 改由 Handle 的共享 SFTP session 服务：list（流式分页 cursor 真实现）、read/write（保留 beforeContent 乐观锁）、stat/mkdir/delete/move、glob/grep（exec channel 跑 `find`/`grep`，保留现有远端命令语义）。
- `transfer-service`：任务队列（全局并发 2-3），单文件流式 + 节流进度事件（≥100ms 合并）、可暂停/取消/**失败重试**（断点续传 REST offset 可选，M3 决策）；任务终态自动出注册表，杜绝泄漏。
- `ssh:exec` 走 exec channel，进程监控/系统监控/安装公钥复用，不再 spawn 本地 ssh 进程。

## 4. IPC 契约（`src/shared/ssh/contract.ts`）

- 所有 channel 名、请求/响应/事件 payload 类型集中定义；主进程 `ipc.ts` 与渲染端 `ssh-rpc.ts` 共享导入，**渲染端不再手写 typeof 解析**。
- 统一错误模型：`{ code: SshErrorCode, stage?: 'jump'|'auth'|'connect'|'channel', message, retryable: boolean }`，两端一套。
- channel 命名收敛为 5 组：`ssh:config:*`（CRUD+事件）、`ssh:conn:*`（open/close/test/状态事件）、`ssh:terminal:*`、`ssh:fs:*`、`ssh:transfer:*`。
- 渲染端入口只有 `ssh-rpc.ts` 一个文件，事件订阅在此集中建立/清理（替代 4 个模块级布尔 guard）。

## 5. 渲染端重构

- **store 按域拆五个**：`connections`（配置+分组+导入导出）、`sessions`（Handle 状态+终端 tab）、`sftp`（双窗格+浏览器缓存）、`transfers`（任务）、`ssh-ui`（视图模式/工作区/inspector）。跨域派生用 selector，消除 sessions↔tabs 双写。
- **组件拆三层容器**：`SshLibraryView`（列表+inspector）、`SshConnectStage`（连接中）、`SshWorkspaceView`（终端+文件+右栏），SshPage 只剩模式路由与主题变量。900+ 行组件按面板继续下拆。
- 目录/文件列表虚拟化（react-window 或等价）；列表项按 id 细粒度订阅。
- 保留：SshWindowApp 隔离入口、主题 tone 系统、xterm 重放逻辑（改为消费新契约）。

## 6. 里程碑（每步可独立合入、可回退）

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M0 契约+存储** | `shared/ssh/contract.ts`；repository（native db RPC + safeStorage）+ JSON 迁移；mutation 直接广播变更事件、删 30s 轮询；**导入/导出/openssh config 解析用 TS 重写**（原实现绑死 sidecar JSON 存储，必须随存储同迁）。旧运行时暂不动，handlers 改读新 repository | 旧 UI 全功能不回归；`~/.open-cowork.json` 不再含明文 secret |
| **M1 连接运行时** | ConnectionManager/Handle + terminal-service 替换 `ssh:connect/data/output` 路径；断线重连 | 终端多 tab 共享一条连接；拔网线 → 自动重连恢复 |
| **M2 SFTP/exec 归一** | sftp/exec/transfer service 上线，`ssh:fs:*` 切到共享连接；下线 sidecar SSH 调用 | SFTP 双窗格/浏览器/监控全功能；目录浏览无进程 spawn |
| **M3 渲染端拆分** | store×5 + 容器组件拆分 + 虚拟化；ssh-rpc 集中订阅 | lint/typecheck 过；交互无回归 |
| **M4 清理+决策点** | 删 ssh-dao/ssh-connection-payload/sidecar Modules/Ssh 与 DbSshTools；评估是否需要 sidecar 传输 fast-path | 死代码为零；`rg 'open-cowork.json'` 仅剩迁移代码 |

风险备注：M1/M2 期间新旧 channel 并存（新名 `ssh:terminal:*` vs 旧 `ssh:data`），渲染端按模块切换，避免大爆炸式替换；Agent 工具链（`AgentRuntimeSshToolExecutor.cs` 及渲染端 ssh 工具）在 M2 一并切到新契约，需单独回归。

## 7. 开放决策（2026-07-17 已确认）

1. **栈选择：方案 A**（主进程 ssh2 单栈多路复用）。✅
2. Linux 无 keyring 降级：**标记明文落库 + UI 提示**（不强制每次输密码）。✅
3. 断点续传：**不纳入 M2**，后置为独立优化。✅
4. sidecar SSH 模块：**M4 删除**；若日后大文件传输成为瓶颈，再按契约加 fast-path。✅

另：页面/交互流程重设计见 `03-ui-flow-redesign.md`（左 Rail + Tab 工作区，连接状态 tab 内化，UI 变化按 M1-M4 渐进落地）。
