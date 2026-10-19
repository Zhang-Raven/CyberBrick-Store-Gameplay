# 九辰祈福打印站 · 真实 X2D

出生年月 → 今日运势 → 从七款命名灯符中匹配一款 → MCP 检查切片与实机 → 前端确认 → X2D 打印与状态回读。

本机已配置真实打印机，并生成七个独立的 X2D / 0.4mm / 蓝白 PLA 切片文件。当前界面地址为 http://127.0.0.1:4173 ，只监听本机。打印机与电脑须继续连接同一热点；热点变化后，更新 `.env` 中的打印机 IP。

## 使用

1. 保持打印机开启，仅局域网模式及开发者模式开启，打印机存储可用。
2. 打开本地页面，选择出生年份、月份，点击「生成灯符并准备打印」。
3. 先在顶部填写 IP、完整 SN 和 8 位打印机访问码，点击「连接打印机」；无需独立站点口令。页面显示选中的灯符和实机检查结果。核对 AMS 槽位、喷嘴及打印板，勾选「我已核对耗材，打印板已清空」，点击「开始真实打印」。取消或超时不会发送打印命令。
4. 提交后按任务文件名回读设备状态。只有本次任务的 `FINISH` 才显示完成；断线、重启及不明确的提交结果会保留任务，防止重复打印。

当前耗材映射是文件材料 1 → AMS 槽位 0（蓝色 PLA Basic），材料 2 → AMS 槽位 3（白色 PLA Lite）。这里的槽位编号从 0 开始，对应 AMS 实物第 1、第 4 槽。使用纹理 PEI 板。更换耗材、喷嘴、打印板或 AMS 位置后，应在 Bambu Studio 中重新切片并更新映射；页面底部可以导入单款的已切片 `.gcode.3mf`。

## 仅启用七款命名模型

| 灯符 | 原文件板号 |
| --- | --- |
| 贪狼 | 2 |
| 禄存 | 3 |
| 巨门 | 4 |
| 廉贞 | 5 |
| 武曲 | 6 |
| 破军 | 7 |
| 辅星 | 8 |

原始模型保存在 `data/九辰灯符（上传版）.3mf`，原文件的草稿板和重复板未启用。`data/九辰灯符-X2D-蓝白PLA.3mf` 是供重新切片使用的适配项目；其中原始几何保留，打印配置在切片时由官方 X2D 与 PLA 配置载入。页面显示切片文件前两层的挤出路径预览，采用实际蓝白配色，不是原文件旧颜色缩略图。真正发给设备的是 `data/charms.json` 登记的七个独立切片文件，每个只有所选灯符的一板 G-code。

## 启动与迁移

本机的 `.env` 已配置好，不要把它分享出去。在项目目录中运行：

```sh
npm ci
npm run build:native
npm run dev
```

本机已安装依赖并编译原生辅助程序；可双击 `启动打印站.command`。已经运行时无需再次启动。网页源码使用 React + Vite，后端使用 Node.js；建议 Node.js 22 或更新版本。

迁移到另一台电脑时复制 `.env.example` 为 `.env`，填写完整序列号、8 位访问码、IP、Bambu Studio 和官方网络插件路径。插件一般位于用户的 `Library/Application Support/BambuStudio/plugins`，具体安装位置可能不同；确保与 Bambu Studio 版本匹配，保留同目录框架依赖。macOS 原生辅助程序构建需要 Xcode Command Line Tools。本次验证使用 Bambu Studio 2.6.0.51 和官方网络插件 02.06.00.50。本机使用工作目录中的独立运行时，`.env` 中已记录实际位置；分享的压缩包不包含该运行时和凭据。

X2D 使用社区 [bambu-printer-mcp](https://github.com/DMontgomery40/bambu-printer-mcp) 的 `bambu_native` 传输及官方 Bambu 网络插件。包版本固定为 1.1.25。`postinstall` 会应用三项范围受限的 X2D 官方 G-code 识别修复：空喷嘴校准的 `L-1`、相机宏 `M9711`、`M104` 的 `N0` 来源标记。喷嘴、耗材、温度及 MCP 人工确认检查保留；相关回归测试验证超温及未知参数仍被拒绝。

重新生成全部切片：

```sh
npm run prepare:source
npm run fix:x2d-template
npm run prepare:all
npm run prepare:previews
```

先填写 `CHARM_LOAD_FILAMENTS`，格式为官方 `Bambu PLA Basic @BBL X2D 0.4 nozzle.json` 路径与 `Bambu PLA Lite @BBL X2D 0.4 nozzle.json` 路径，以分号分隔。模板修复脚本只给官方换色模板缺少注释符的标题补一个分号，再重新切片；不改运动或温度命令。上述重新切片命令不会启动打印。

## 运势生成

没有模型 API Key 时使用确定性的离线演示运势；界面会在运势说明中标明。可在私有 `.env` 填写 OpenAI 兼容服务的 Base URL、Key 和模型名称。配置外部 API 后会发送出生年月及当天日期用于生成运势。运势为传统文化体验与娱乐文本。

## 验证范围

22 项自动测试通过，前端生产构建通过。七个实际切片均通过 MCP 文件检查；实机 MQTT 状态、原生插件认证、材料/喷嘴/温度预检成功，能够发起真实 MCP 人工确认。测试覆盖取消确认不发送命令；现场另有一次真实「武曲」任务经原生插件传输成功，设备回读 RUNNING。该任务的最终成品未在此记录中确认。

```sh
npm test
npm run build
```

`npm run dev:sim` 仅用于软件演示，与真实设备任务分开。`.env`、`data/native`、`data/prepared` 和 `data/job.json` 不应进入分享包。

## Cloudflare 免费公网入口

本工程部署到 GitHub 保存代码；真实打印服务运行在与打印机同一局域网的 macOS 电脑，通过 Cloudflare Tunnel 提供 HTTPS 入口。Cloudflare Pages / Workers 的静态托管无法直接连接现场打印机的 MQTT 和原生网络插件。

```sh
npm ci
npm run build:native
npm run build
npm run tunnel
```

先安装官方 `cloudflared`（macOS：`brew install cloudflared`）。脚本会生成免费 `trycloudflare.com` 地址并启动生产服务，无独立站点口令。首次公开部署前先在本机 `.env` 配置打印机 SN 和访问码，以指定允许控制的设备；公网访客直接使用这台打印机的 SN 和访问码建立控制会话。地址保存在本机 `data/public-access.json`，打印机访问码保存在私有 `.env` 或 `data/printer-settings.json`；这三个文件都不上传 GitHub。生产服务提供构建后的静态资源，不公开 Vite 开发服务。

根据 [Cloudflare Quick Tunnel 文档](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)，免费临时地址不需要 Cloudflare 账号或自有域名，但进程停止后失效，重建时域名会变化，且不提供可用性保证。固定域名需要 Cloudflare 账号和正式 Tunnel 配置。停止网页或隧道不会取消已在打印机上开始的任务。

页面始终显示局域网提示：**运行本地服务的电脑须与对应打印机连接同一 Wi-Fi / 热点**；手机可以在其他网络访问域名。页面的打印机参数模块可填写局域网 IP、完整 SN、8 位访问码，点击「连接打印机」验证参数并测试连接。保留访问码时留空即可；更换 SN 必须重新填写访问码。当前模型限制为 X2D / 0.4mm，以匹配七款蓝白 PLA 切片。

公网控制接口使用打印机 SN 与访问码建立会话；访问码不会返回浏览器，也没有额外的站点口令。验证有尝试次数限制，会话 Cookie 使用 HttpOnly、SameSite=Strict，HTTPS 部署使用 Secure；修改配置、打印确认等操作还会检查来源域名。配置文件仅本机用户可读写。
