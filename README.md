# lolPing

<p align="center">
  <img src="assets/textures/generic_ping.png" width="56" alt="lolPing icon"><br>
  <strong>lolPing</strong>
</p>

<p align="center">
  A Windows desktop wheel for League of Legends pings, emotes, shortcuts and room play.
</p>

<p align="center">
  <a href="https://github.com/DreamingBetter/lolPing-moyudazi/releases/latest"><b>Download for Windows</b></a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/DreamingBetter/lolPing-moyudazi/actions/workflows/ci.yml"><img src="https://github.com/DreamingBetter/lolPing-moyudazi/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/DreamingBetter/lolPing-moyudazi/releases/latest"><img src="https://img.shields.io/github/v/release/DreamingBetter/lolPing-moyudazi" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/DreamingBetter/lolPing-moyudazi" alt="MIT license"></a>
</p>

> **Windows only.** This fork is built and tested for Windows 11 x64. macOS is not supported by the 0.6.x release line.

## What is new in 0.6.0

Version 0.6.0 adds a configurable desktop action wheel and several social and cosmetic features while preserving the original ping and emote wheels.

- **Action wheel:** hold **Shift** and drag to launch screenshots, mute or volume controls, show desktop, lock screen, browser, websites, apps, files and folders. Every slot can be replaced from the built-in library and configured with its own parameters.
- **Room chat:** rooms now have encrypted plain-text chat with a 200-message in-memory history for members joining later.
- **Message danmaku:** chat messages can appear as a lightweight overlay with adjustable area, speed, size and opacity.
- **League cursor skins:** apply the bundled modern Summoner cursor or the classic cursor pack to Windows, with automatic restore when disabled.
- **Heartsteel mode:** play the Heartsteel desktop mini-game solo or with room members, with shared targets, hit results, health growth and a compact desktop status widget.
- **Windows-first release:** the packaging, release workflow and update source now point to this fork, `DreamingBetter/lolPing-moyudazi`.

### Feature screenshots

**Action wheel:** edit all eight slots and choose actions from the built-in library.

<p align="center"><img src="docs/media/action-wheel-0.6.0.png" width="920" alt="Action wheel editor and built-in action library"></p>

**Room chat and danmaku:** chat in a room and adjust the desktop message overlay.

<p align="center"><img src="docs/media/chat-danmaku-0.6.0.png" width="920" alt="Room chat and danmaku settings"></p>

**League cursor skins:** switch between system, modern Summoner and classic cursors.

<p align="center"><img src="docs/media/cursor-skins-0.6.0.png" width="700" alt="System, modern Summoner and classic cursor choices"></p>

**Heartsteel:** solo and room play with pacing options and a desktop status widget.

<p align="center"><img src="docs/media/settings-0.6.0.png" width="920" alt="Heartsteel room settings and health display"></p>

## Use

| Action | Gesture |
| --- | --- |
| Ping | Hold **Alt**, drag, release on a slice |
| Emote | Hold **Ctrl**, drag, release on an emote |
| Desktop action | Hold **Shift**, drag, release on an action |
| Cancel | Release in the centre, right-click or press **Esc** |
| Pause or resume | **Ctrl + Alt + P** |
| Open settings | Click the tray icon |

The trigger keys and wheel layouts are configurable in Settings. The action wheel runs desktop operations in the Electron main process, so paths, URLs and system actions stay behind the application boundary.

## Rooms and chat

Create or join a room from **Settings → Room**. Room traffic is end-to-end encrypted with a key derived from the room code. Chat is plain text only, is kept in memory, and is removed when the room is left. The chat page also controls danmaku display settings.

## Installation

1. Download `lolPing-moyudazi-Setup-0.6.0.exe` from the [0.6.0 release](https://github.com/DreamingBetter/lolPing-moyudazi/releases/tag/v0.6.0).
2. Run the installer. The build is not code-signed, so Windows SmartScreen may require **More info → Run anyway**.
3. lolPing starts in the system tray. Open Settings to change triggers, actions, room options, cursor skins or Heartsteel mode.

## Build from source

You need Node 22.12 or later, Windows 11 x64, and Visual Studio 2022 or later with the **Desktop development with C++** workload.

```powershell
npm ci
npm run build:helper
npm run dev
```

Useful checks:

```powershell
npm run typecheck
npm run test:helper
npm test
npm run dist
```

## Credits and attribution

lolPing 0.6.0 is a Windows-focused second development based on [darrenprx/lolPing](https://github.com/darrenprx/lolPing). We are building on the original project's architecture, input model and wheel renderer while adding the features described above. Please visit the original project, review its work and consider giving it a star:

**Original project:** <https://github.com/darrenprx/lolPing>

League of Legends assets are property of Riot Games. This project is not endorsed by Riot Games. The source code is available under the [MIT License](LICENSE).
