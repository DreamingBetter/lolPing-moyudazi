# lolPing-moyudazi

<p align="center">
  <img src="assets/textures/generic_ping.png" width="56" alt="lolPing-moyudazi 图标"><br>
  <strong>lolPing-moyudazi</strong>
</p>

<p align="center">把熟悉的英雄联盟式轮盘手势带到 Windows 桌面。</p>

<p align="center">按住一个按键，拖到对应扇区后松开：发信号、打开工具、和朋友聊天，或来一局短暂的心之钢，都不需要离开当前桌面。</p>

<p align="center">
  <a href="https://github.com/DreamingBetter/lolPing-moyudazi/releases/latest"><b>下载 Windows 版</b></a> ·
  <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/DreamingBetter/lolPing-moyudazi/actions/workflows/ci.yml"><img src="https://github.com/DreamingBetter/lolPing-moyudazi/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/DreamingBetter/lolPing-moyudazi/releases/latest"><img src="https://img.shields.io/github/v/release/DreamingBetter/lolPing-moyudazi" alt="最新版本"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/DreamingBetter/lolPing-moyudazi" alt="MIT 许可证"></a>
</p>

> **仅支持 Windows。** lolPing-moyudazi 面向并测试于 Windows 11 64 位，0.6.x 版本不支持 macOS。

<p align="center"><img src="docs/media/demo.zh-CN.gif" width="920" alt="lolPing-moyudazi 轮盘操作演示"></p>

## 🎮 为什么值得试试？

lolPing-moyudazi 保留了游戏里“按住、拖动、松开”的爽快节奏，把它扩展成一套可以覆盖整个桌面的操作轮盘。那些不值得打开菜单、但又经常需要完成的动作，现在都可以用一次拖动解决；普通桌面操作也因此多了一点游戏感。

- ⚡ **办公时：** 快速截图、会议静音、调节音量、显示桌面或锁定 Windows。
- **日常操作时：** 把常用网站、应用、文件和文件夹放到轮盘里，少一些搜索和切换。
- 💬 **和朋友一起时：** 创建房间，发信号、发表情、聊天，还能把消息作为弹幕飘在桌面上。
- 🖱️ **想换个氛围时：** 在新版召唤师指针、经典版英雄联盟指针和系统指针之间切换。
- ❤️‍🔥 **想休息几分钟时：** 单人开启心之钢，或者邀请房间成员一起抢目标、叠加最大生命值。

## ✨ 0.6.0 新功能

0.6.0 保留原有的信号轮盘和表情轮盘，并新增桌面动作轮盘，以及房间社交、指针皮肤和轻量娱乐玩法。

### ⚡ 动作轮盘：把桌面操作变成一次拖动

按住 **Shift** 拖动即可打开默认动作轮盘。松开后可以直接进入 Windows 截图流程、静音或调节音量、显示桌面、锁定屏幕、打开浏览器，或者打开预先配置的网站。8 个槽位都可以从内置动作库重新安排，每个动作都能编辑名称、网址、应用路径、文件路径、文件夹路径或音量步进。

<p align="center"><img src="docs/media/action-wheel-0.6.0.png" width="920" alt="lolPing-moyudazi 动作轮盘编辑器和内置动作库"></p>

### 💬 房间聊天室与消息弹幕：不打开游戏也能保持同一个房间

在设置中创建房间，复制房间码发给朋友即可加入。同一网络或开启互联网连接后，最多 8 人可以在同一个房间里互相发送信号、表情和聊天消息。房间消息采用端到端加密，只支持纯文本，并在有人留在房间时保留最近记录。打开消息弹幕后，聊天内容会像直播弹幕一样飘过桌面；显示区域、速度、字号和透明度都可以调整。

<p align="center"><img src="docs/media/chat-danmaku-0.6.0.png" width="920" alt="lolPing-moyudazi 房间聊天与弹幕设置"></p>

### 🖱️ 英雄联盟指针皮肤：让桌面也有熟悉的手感

可以选择系统指针、新版召唤师指针或经典版英雄联盟指针。关闭皮肤后，lolPing-moyudazi 会自动恢复启用前的 Windows 指针方案。

<p align="center"><img src="docs/media/cursor-skins-0.6.0.png" width="700" alt="lolPing-moyudazi 系统、新版和经典版指针选项"></p>

### ❤️‍🔥 心之钢：不用打开游戏，随时都能开钢

不用打开游戏，随时都能开钢：在房间设置中直接开启心之钢。桌面上会出现限时目标，右键命中即可获得反馈，并永久增加命中者的最大生命值。不在房间时可以单人游玩，进入房间后会变成所有成员看到同一目标的抢点玩法。你可以选择“钢一下”“正常钢”或“爽钢”的生成节奏，并通过可拖动的桌面小组件查看生命值和层数。

<p align="center"><img src="docs/media/settings-0.6.0.png" width="920" alt="lolPing-moyudazi 心之钢设置与桌面生命值小组件"></p>

## 30 秒上手

1. 从 <a href="https://github.com/DreamingBetter/lolPing-moyudazi/releases/tag/v0.6.0">0.6.0 Release</a> 下载并安装 <code>lolPing-moyudazi-Setup-0.6.0.exe</code>。
2. 在 Windows 系统托盘找到 lolPing-moyudazi，点击图标打开<strong>设置</strong>。
3. 第一次体验可以直接使用默认按键，也可以先修改按键和轮盘布局。
4. 按住触发键，把鼠标拖到目标扇区后松开即可执行。中心区域松开、点击右键或按 <strong>Esc</strong> 都可以取消。

默认操作如下：

| 轮盘 | 操作 | 建议第一次尝试 |
| --- | --- | --- |
| 信号轮盘 | 按住 **Alt** 拖动，在扇区上松开 | 给房间发送“正在路上”或“危险” |
| 表情轮盘 | 按住 **Ctrl** 拖动，在表情上松开 | 不打开聊天窗口也能发出反应 |
| 桌面动作轮盘 | 按住 **Shift** 拖动，在动作上松开 | 打开截图流程或切换系统静音 |

按 **Ctrl + Alt + P** 可以暂停或恢复输入捕获。需要修改功能时，随时点击系统托盘图标进入设置。

## 🎯 推荐玩法

### 三个手势完成一段工作流

1. 按住 **Shift**，在**截图**上松开，直接进入 Windows 截图流程。
2. 开会前按住 **Shift**，在**静音 / 取消静音**上松开。
3. 需要查资料时按住 **Shift**，在**打开浏览器**上松开。

熟悉后，可以把其中一个槽位换成每天都会打开的网站、应用、文件或文件夹。

### 五分钟房间体验

1. 打开**设置 → 房间**，点击**创建房间**。
2. 复制房间码，发给最多 7 位朋友。
3. 用信号轮盘和表情轮盘互动，不必切出当前应用。
4. 打开**房间聊天室**发送文字；想让消息出现在桌面上时，再打开**消息弹幕**。
5. 可以随时静音房间、限制收到的信号频率，或离开房间。

### ❤️‍🔥 一局心之钢休息一下

1. 不用打开游戏，在**设置 → 房间**中开启心之钢；单人时独自进行，进入房间后自动变成共享抢点。
2. 留意桌面上出现的目标，在它消失前右键命中。
3. 查看命中反馈和不断增长的最大生命值。
4. 拖动小组件到合适的位置，想放松或加快节奏时再切换目标生成速度。

## 按自己的习惯设置

设置页面提供了完整的自定义选项：

- 修改信号、表情和动作轮盘的触发键，三个按键不能重复。
- 把信号、表情或动作库中的内容拖到轮盘槽位，也可以随时恢复默认布局。
- 为动作填写网址、应用路径、文件路径、文件夹路径或音量调整步进。
- 设置房间名称和颜色，选择是否允许互联网连接，并限制收到的信号频率。
- 调整弹幕显示区域、速度、字号和透明度。
- 选择指针皮肤，调整心之钢目标节奏和桌面小组件显示状态。

## 安装

Windows 安装包位于 <a href="https://github.com/DreamingBetter/lolPing-moyudazi/releases/tag/v0.6.0">0.6.0 Release 页面</a>。安装包没有代码签名，Windows SmartScreen 可能需要点击<strong>更多信息 → 仍要运行</strong>。

## 从源码构建

需要 Node 22.12 或更高版本、Windows 11 64 位，以及安装了“使用 C++ 的桌面开发”工作负载的 Visual Studio 2022 或更高版本。

~~~powershell
npm ci
npm run build:helper
npm run dev
~~~

常用检查命令：

~~~powershell
npm run typecheck
npm run test:helper
npm test
npm run dist
~~~

## 致谢与二次开发说明

lolPing-moyudazi 0.6.0 是基于 <a href="https://github.com/darrenprx/lolPing">darrenprx/lolPing</a> 进行的 Windows 方向二次开发。我们站在原项目的架构、输入模型和轮盘渲染方案之上，加入了动作轮盘、房间聊天室、消息弹幕、英雄联盟指针皮肤和心之钢玩法。感谢原作者的设计与实现，也欢迎大家访问原项目、阅读其文档，并为原作者的项目点一个 Star：

<strong>原项目：</strong> <a href="https://github.com/darrenprx/lolPing">https://github.com/darrenprx/lolPing</a>

英雄联盟相关素材归 Riot Games 所有。本项目与 Riot Games 没有官方关联。源代码采用 <a href="LICENSE">MIT License</a>。
