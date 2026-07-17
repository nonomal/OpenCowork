# SSH 子系统现状设计分析

> 分析日期：2026-07-17。覆盖：新建连接、保存、连接三条主流程 + 全景架构 + 问题清单。
> 代码规模：渲染端 ssh 组件 + store 约 11k 行，主进程约 2.7k 行，C# sidecar SSH 模块约 7.3k 行。

## 1. 全景架构：一个功能、两条互不相通的传输栈

现状最核心的事实是：**同一个"SSH 连接"在运行时走两套完全独立的 SSH 实现**。

```
┌─────────────────────────── Renderer ───────────────────────────┐
│  ssh-store.ts (1984 行, 单一 Zustand store, 7 个业务域混在一起)   │
│  SshPage / SshConnectionList / SshConnectedWorkspace / ...      │
└──────────────┬──────────────────────────────┬───────────────────┘
               │ MessagePack IPC              │ MessagePack IPC
               ▼                              ▼
┌────── 栈 A：终端会话 ──────┐   ┌────── 栈 B：其余全部 SSH 操作 ──────┐
│ ssh-handlers.ts (2282 行) │   │ ssh-handlers.ts 转发 →              │
│ 主进程内嵌 ssh2 (纯JS协议) │   │ C# native worker (AOT sidecar)      │
│ · ssh:connect/data/resize │   │ · exec / 连接测试                    │
│ · shell channel + 1MB     │   │ · SFTP 全部文件操作 (list/read/write)│
│   seq 输出环形缓冲         │   │ · 上传/下载/远程复制 + 进度事件       │
│ · proxyJump: forwardOut   │   │ · glob / grep 远程搜索               │
│ · keepalive: ssh2 内建    │   │ · 连接配置持久化 (SshConfigStore)     │
└───────────────────────────┘   │ · OpenSSH ~/.ssh/config 解析         │
                                │ 实现方式：拉起系统 openssh 客户端进程  │
                                │ (ssh/scp)，密码认证靠 SSH_ASKPASS     │
                                │ 临时脚本 + 环境变量传 secret          │
                                └─────────────────────────────────────┘
```

两条栈各自实现了一遍：认证（密码/私钥/agent）、proxyJump 解析（`ssh-connection-payload.ts` 专门做栈 A 配置 → 栈 B 参数的翻译）、host key 处理、错误格式化。行为必然不一致 —— 例如栈 B 使用 `StrictHostKeyChecking=accept-new` 且完全依赖用户机器上的 OpenSSH 客户端，栈 A 则由 ssh2 库的算法支持决定；同一台服务器可能"终端连得上、SFTP 连不上"（或反之）。

## 2. 保存/持久化设计（新建连接 → 落盘）

### 2.1 数据流

```
SshConnectionForm (SshConnectionForm.tsx:26-196)
  └─ 校验：name/host/username 非空 trim；密码/passphrase 为瞬时 React state，
     编辑时留空 = 不修改（只写语义）
  └─ store.createConnection / updateConnection (ssh-store.ts:1336/1369)
      └─ IPC ssh:connection:create / update
          └─ ssh-handlers → ssh-config.ts applyMutation (ssh-config.ts:179)
              └─ native worker 'ssh/config-connection-*'
                  └─ C# SshConfigStore.cs → 写 ~/.open-cowork.json
```

### 2.2 关键事实

- **凭据明文落盘**。`SshConfigStore.cs:395-412` 把 `password`、`passphrase` 原样序列化进 `~/.open-cowork.json`。整个链路（sidecar → 主进程缓存 → MessagePack IPC）中 secret 全程明文。
- **存在一套设计了加密但从未接线的死代码**：`src/main/db/ssh-dao.ts`（`encrypted_password` / `encrypted_passphrase` 字段，走 `db/ssh-*` RPC，对应 sidecar `DbSshTools.cs`）在 `src/` 中零引用。说明历史上规划过"SQLite + 加密"方案，后来被 JSON 明文方案取代但未删除。
- **主进程持有全量明文缓存**（`ssh-config.ts:59` `cachedConfig`），并用 **30 秒定时轮询** sidecar `ssh/config-snapshot` + `JSON.stringify` 全量 diff 来检测变更（`ssh-config.ts:200-212`）；变更后广播 `ssh:config:changed`，渲染端收到后 `loadAll()` **全量重载**所有 groups/connections/sessions。
- 连接列表 IPC (`ssh:connection:list`) 会把连接对象（含明文 password 字段与否需注意——渲染端类型里没有 password，但传输层是否剥除取决于 handler 映射）返回渲染端。

### 2.3 表单字段

`name/host/port/username/authType(password|privateKey|agent)/password/privateKeyPath/passphrase/groupId/defaultDirectory/startupCommand/proxyJump/keepAliveInterval`。附带能力：扫描 `~/.ssh` 默认密钥、复制公钥、`ssh:auth:install-public-key` 远程安装公钥到 authorized_keys。

## 3. 连接流程（点击 Connect → 终端可用）

### 3.1 状态机与调用链

```
store.connect(connectionId) (ssh-store.ts:1427)
  └─ IPC ssh:connect → ssh-handlers.ts:1898
      ├─ getSshConnection() 从明文缓存取配置
      ├─ new Client()，注册进全局 Map sshSessions（内存态，id = "ssh-N"）
      ├─ connectWithProxyJump (ssh-handlers.ts:803-846)
      │    ├─ 无跳板：client.connect(buildConnectConfig)
      │    │    · password → 明文；privateKey → fs.readFileSync（同步阻塞！）
      │    │    · agent → SSH_AUTH_SOCK / Windows named pipe
      │    │    · keepaliveInterval = keepAliveInterval*1000, countMax 3, readyTimeout 30s
      │    └─ 有跳板：jumpClient 先连 → forwardOut 建隧道 → 目标 client 走 sock
      ├─ client.shell({term:'xterm-256color', cols:120, rows:30})
      ├─ 自动执行 startupCommand / cd defaultDirectory
      └─ 双 30s 超时（setTimeout + readyTimeout 竞态并存）
```

会话状态：`connecting → connected → disconnected | error`，经 `ssh:status` 事件广播；渲染端 `ensureSshStatusSubscribed`（模块级布尔 guard 的全局订阅）更新 store 并在断开时级联清理 tabs/sessionFiles。

### 3.2 终端数据面（现有设计的亮点，值得保留）

- 输出：shell stream data → `recordOutput`：写入 **seq 编号 + 1MB FIFO 环形缓冲**，再 base64 MessagePack 广播 `ssh:output`。
- 渲染端 `SshTerminal.tsx`：xterm + fit/search/webLinks/unicode addon；挂载时先 `ssh:output:buffer` 拉历史（sinceSeq 补偿），期间新事件进 pendingChunks 队列，seq 去重后 write —— **tab 切换/重挂载不丢屏**。
- 输入 `ssh:data`（oneway send），resize `ssh:resize`；ResizeObserver + IntersectionObserver + visualViewport 多路触发 fit。

### 3.3 生命周期缺口

- 会话纯内存（`sshSessions` Map），**无断线自动重连**，无会话恢复；网络闪断 = 终端死亡。
- 连接删除时遍历 Map 级联断开；应用退出 `closeAllSshSessions()`。
- client/shell 的事件监听从不显式移除；30s 超时定时器与异步连接流程存在双重 resolve 竞态窗口。

## 4. SFTP / exec / 传输（栈 B）

- 渲染端所有 `ssh:fs:*`（23 个 channel）、`ssh:exec`、`ssh:connection:test` → 主进程薄转发 → sidecar。
- sidecar `SshOpenSsh.cs`（1101 行）为每类操作 **spawn 系统 `ssh`/`scp` 进程**：
  - 密码认证：生成临时 askpass shell 脚本（`SshOpenSsh.cs:879-889`），secret 经 `OPEN_COWORK_SSH_ASKPASS_SECRET` 环境变量传入，`SSH_ASKPASS_REQUIRE=force`；
  - `StrictHostKeyChecking=accept-new`（静默信任首次 host key）。
- 传输任务：`ssh:fs:transfer:start` 三型（upload/download/remote-copy），taskId 注册进主进程 Map，进度经 native event → `ssh:fs:transfer:events` 广播；native 超时设到 2 小时；任务若 native 崩溃不回调则永久泄漏。
- SFTP 工作区（双窗格）、文件浏览器、进程监控（`ssh:exec` 跑 `ps`）、系统监控（部署脚本到远端 `~/.open-cowork/xterminal/` 定时采样）全部基于此栈。

## 5. 渲染端结构

- **单一 store 覆盖 7 个域**（连接 CRUD / 会话 / tabs / 会话内文件 / 文件浏览器 / SFTP 双窗格 / 传输任务 / UI 态），1984 行；深层嵌套 `Record<string, Record<string, T>>` 状态、手写并发限流（`MAX_CONCURRENT_LIST_DIR=2`）、4 个模块级布尔 guard 的事件订阅。
- **巨型组件**：SshPage 1027 行（三模式状态机 + 主题 CSS 变量系统）、SshConnectionList 1092、SshSupportWorkspaces 1201、SshSftpWorkspace 1168、SshConnectionInspector 894。
- `SshWindowApp` 是刻意与主 App 隔离的独立窗口入口（避免拉起 chat/agent 运行时）——这个隔离设计正确，应保留。
- 组件普遍整体订阅 store，连接状态一变全列表重渲染；目录列表无虚拟化。
- IPC 无共享类型契约（`src/shared/` 下没有 ssh 相关文件），渲染端靠手写 `typeof`/`in` 检查解析返回值。

## 6. 问题清单（按严重度）

| # | 级别 | 问题 |
|---|------|------|
| 1 | 🔴 | **双栈架构**：认证/跳板/host key/错误处理 ×2 实现，行为不一致，每个新功能要选边或做两遍 |
| 2 | 🔴 | **凭据明文存储** `~/.open-cowork.json`，全链路明文流转；askpass 临时脚本 + env 传 secret |
| 3 | 🔴 | 栈 B 每个文件操作 spawn 一个 ssh 进程、重新认证一次（无连接复用），目录浏览延迟高、对服务器不友好 |
| 4 | 🟠 | 无断线重连/会话恢复；30s 超时竞态；listener 不清理 |
| 5 | 🟠 | 死代码整层（ssh-dao.ts / DbSshTools / encrypted_* 字段）误导维护者 |
| 6 | 🟠 | 配置同步 = 30s 轮询 + 全量 stringify diff + 渲染端全量 reload |
| 7 | 🟠 | 巨型文件（handlers 2282 / store 1984 / 5 个 900+ 行组件），职责不拆分 |
| 8 | 🟡 | IPC 无类型契约、无运行时校验；错误格式两套 |
| 9 | 🟡 | 传输任务无重试、native 崩溃泄漏任务；`readFileSync` 阻塞事件循环 |
| 10 | 🟡 | 性能：无虚拟化、O(n²) 追加排序、全量订阅重渲染 |

## 7. 值得保留的设计

- seq + 环形缓冲 + `ssh:output:buffer` 补偿重放（终端不丢屏）。
- SshWindowApp 与主 App 的启动隔离。
- 导入/导出（open-cowork JSON + OpenSSH config 两源、冲突四策略）产品设计完整。
- proxyJump 三形态（连接 ID / OpenSSH alias / `user@host:port`）的解析语义。
- 表单"密码留空 = 不修改"的只写语义。
