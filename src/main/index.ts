import { app, clipboard, dialog, Menu, powerMonitor, screen, shell, systemPreferences } from 'electron';
import { spawn } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { resolveLang, strings, type Strings } from '../shared/i18n';
import type { HeartsteelCursorKind } from '../shared/heartsteel';
import { SETTINGS_CH, type About, type AppStatus } from '../shared/ipc';
import { hotkeyLabel } from '../shared/keys';
import { announcedEmoteHashes } from '../shared/emotes';
import { configCommand, type HelperStatus } from '../shared/protocol';
import type { JoinResult, RoomState } from '../shared/room';
import { formatRoomCode, parseRoomCode } from '../shared/roomCode';
import { overlaySettings, type Settings } from '../shared/settings';
import { updateErrorText, type UpdateState } from '../shared/update';
import { WINDOWS_APP_ID } from '../shared/branding';
import { registerAppScheme, serveAppScheme } from './appProtocol';
import { executeAction } from './actionExecutor';
import { resolveTarget, toShared } from './displayNumbers';
import { createCursorSkinService } from './cursorSkin';
import { EmoteCache } from './emoteCache';
import { EmoteLibrary, resolveEmoteArt } from './emoteLibrary';
import { EmoteTransfer } from './emoteTransfer';
import { isFile } from './fileState';
import { InputBridge } from './inputBridge';
import { LanTransport } from './lanTransport';
import { RELAYS } from './relays';
import { RelayTransport } from './relayTransport';
import { OverlayManager, type SelectedAction, type SharedEmote, type SharedPing } from './overlayManager';
import { HeartsteelWidgetWindow } from './heartsteelWidgetWindow';
import { assetPath, buildResourcePath, helperExePath, IS_MAC, PLATFORM, settingsDir } from './paths';
import { deriveRoomKeys } from './roomCrypto';
import { RoomManager, type RoomToast } from './roomManager';
import { registerSettingsIpc } from './settingsIpc';
import { SettingsStore } from './settingsStore';
import { onSettingsWindowGone, openSettingsWindow, settingsWindow } from './settingsWindow';
import { AppTray, trayUpdateFrom, type TrayMode } from './tray';
import { trayUpdateHandlers } from './trayUpdate';
import { MacBackend, RELEASES_API } from './updateMac';
import { WinBackend } from './updateWin';
import { Updater } from './updater';

const ACCESSIBILITY_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';

registerAppScheme();
app.setAppUserModelId(WINDOWS_APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettingsWindow());
  app.on('activate', () => openSettingsWindow()); // macOS: opened again from Finder or Launchpad while running
  void app.whenReady().then(start);
}

/** The OS account name: the default name under this machine's pings in a room. */
function osUserName(): string {
  try {
    return userInfo().username;
  } catch {
    return 'Player';
  }
}

/**
 * The relays to use. Development builds take a comma-separated LOLPING_RELAYS instead, so "no relay reachable" can
 * be tried without touching the firewall; packaged builds always use the pinned list.
 */
function relayUrls(): readonly string[] {
  const custom = app.isPackaged ? undefined : process.env.LOLPING_RELAYS;
  const urls = custom?.split(',').map((u) => u.trim()).filter((u) => u.startsWith('wss://')) ?? [];
  return urls.length > 0 ? urls : RELAYS;
}

const runDetached = (command: string, args: string[]): Promise<void> => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true, detached: false, stdio: 'ignore' });
  child.once('error', reject);
  child.once('spawn', resolve);
});

/** macOS: the app, Edit and Window menus, so Cmd+Q, Cmd+W and the clipboard shortcuts work in the settings window. */
function setMacMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
}

function start(): void {
  const library = new EmoteLibrary(join(settingsDir(), 'emotes'));
  const cache = new EmoteCache(join(settingsDir(), 'emote-cache'), Date.now);
  void cache.present();
  serveAppScheme({
    rendererRoot: process.env.ELECTRON_RENDERER_URL ? null : join(__dirname, '../renderer'), // development pages come from Vite
    emoteDirs: () => [library.dir, cache.dir],
  });
  if (IS_MAC) {
    app.dock?.hide(); // a menu bar app: the Dock icon only shows while settings are open
    setMacMenu();
  }
  const store = new SettingsStore(settingsDir(), undefined, PLATFORM, { name: osUserName(), color: randomInt(8) });
  let settings = store.load();
  const cursorSkin = IS_MAC ? undefined : createCursorSkinService({
    platform: PLATFORM,
    sourceDir: assetPath('cursors', 'summoner'),
    classicSourceDir: assetPath('cursors', 'summoner-classic'),
    installDir: join(settingsDir(), 'cursors', 'summoner'),
    classicInstallDir: join(settingsDir(), 'cursors', 'summoner-classic'),
    backupFile: join(settingsDir(), 'cursor-backup.json'),
  });
  // An imported emote whose still is gone is dropped; normalising the shorter list repairs the wheel slots that used it.
  const kept = library.present(settings.customEmotes);
  if (kept.length !== settings.customEmotes.length) settings = store.update({ customEmotes: kept });
  // The language setting, or the system display language when it's 'auto'.
  const text = (): Strings => strings(resolveLang(settings.language, app.getLocale()), PLATFORM);
  let enabled = settings.enabledOnStart;
  let quitting = false; // read by pushStatus: once true, the tray and overlays are gone
  let capturing = false; // the settings page is listening for a key, so the helper must stay suspended

  const overlays = new OverlayManager(
    overlaySettings(settings),
    (ref, remote) => resolveEmoteArt(ref, settings.customEmotes, remote, (hash) => {
      if (!settings.friendEmotes || !cache.has(hash)) return false;
      cache.touch(hash);
      return true;
    }),
  );
  overlays.start();
  const bridge = new InputBridge({ command: helperExePath() });

  // Updates: only in an installed build, or in a development build pointed at a test server with LOLPING_UPDATE_TEST_URL.
  const testUrl = process.env.LOLPING_UPDATE_TEST_URL || undefined;
  const updater = app.isPackaged || testUrl ? createUpdater() : null;
  function createUpdater(): Updater {
    const backend = IS_MAC
      ? new MacBackend({
        apiBase: testUrl ?? RELEASES_API,
        currentVersion: app.getVersion(),
        fetch,
        downloadsDir: app.getPath('downloads'),
        focus: () => app.focus({ steal: true }), // the dialog is shown from a menu bar app, which is not the active one
        showDialog: (message) => dialog.showMessageBox({ message, buttons: ['OK'] }).then(() => undefined),
        openPath: (path) => shell.openPath(path),
        dialogText: () => text().updateMacDialog,
        quit: () => app.quit(),
      })
      : new WinBackend({
        testUrl,
        log: (line) => console.log('[update]', line),
        toast: () => overlays.toast(text().restartingToUpdate, ''),
        isQuitting: () => quitting,
      });
    return new Updater({
      backend,
      now: Date.now,
      autoCheck: () => settings.autoUpdateCheck,
      notifiedVersion: () => settings.updateNotifiedVersion,
      setNotifiedVersion: (version) => void store.update({ updateNotifiedVersion: version }),
      errorText: (kind, reason) => {
        console.warn('[update]', kind, reason); // the whole reason goes to the log; the card shows its first line
        return updateErrorText(text(), kind, reason);
      },
    });
  }

  // Room: pings shared with other lolPing users, on the network and through public relays.
  const lan = new LanTransport();
  const relay = new RelayTransport({ urls: relayUrls() });
  const room = new RoomManager({
    transports: [lan, relay],
    now: Date.now,
    randomBytes: (n) => randomBytes(n),
    deriveKeys: deriveRoomKeys,
    appVersion: app.getVersion(),
    profile: () => ({
      name: settings.displayName,
      color: settings.tagColor,
      limit: settings.incomingPingLimit,
      heartsteelBonusHealth: settings.heartsteelBonusHealth,
    }),
    displayNumbers: () => overlays.numbered().map((d) => d.number),
    resolveTarget: (d) => {
      const target = resolveTarget(overlays.numbered(), d);
      return target ? { displayId: target.id, width: target.bounds.width, height: target.bounds.height } : null;
    },
    announceEmotes: () => announcedEmoteHashes(settings.emoteWheel, settings.clickEmoteId),
  });
  const transfer = new EmoteTransfer({
    now: Date.now,
    enabled: () => settings.friendEmotes,
    have: (hash) => isFile(join(library.dir, `${hash}.webp`), false) || cache.has(hash),
    still: (hash) => {
      try { return new Uint8Array(readFileSync(join(library.dir, `${hash}.webp`))); } catch { return null; }
    },
    announced: () => announcedEmoteHashes(settings.emoteWheel, settings.clickEmoteId),
    put: (hash, bytes) => void cache.put(hash, bytes),
    routeOf: (peer) => room.routeKind(peer),
    sendToLan: (peer, body) => room.sendToLan(peer, body),
    broadcastShared: (body) => room.broadcastShared(body),
    spareSharedToken: (keep) => room.spareSharedToken(keep),
  });
  room.on('emotes', (peer: string, hashes: string[]) => transfer.announced(peer, hashes));
  room.on('want', (want) => transfer.onWant(want));
  room.on('chunk', (chunk) => transfer.onChunk(chunk));
  room.on('memberGone', (peer: string) => transfer.memberGone(peer));
  const roomState = (): RoomState => {
    const all = screen.getAllDisplays();
    return {
      ...room.state(),
      displays: overlays.numbered().map((d) => {
        const scale = all.find((x) => x.id === d.id)?.scaleFactor ?? 1; // show pixels, as the OS display settings do
        return { number: d.number, width: Math.round(d.bounds.width * scale), height: Math.round(d.bounds.height * scale), primary: d.primary };
      }),
    };
  };
  const heartsteelWidget = new HeartsteelWidgetWindow((heartsteelWidgetPosition) => {
    store.update({ heartsteelWidgetPosition });
  });
  const clipboardCode = async (): Promise<string | null> => {
    // Strict: nobody typed this, so only an unmistakable code counts, never words that happen to pass the check.
    const parsed = parseRoomCode(await clipboard.readText().catch(() => ''), { strict: true });
    return parsed.ok ? formatRoomCode(parsed.code) : null;
  };
  const copyRoomCode = (): void => {
    const code = room.state().code;
    if (code) void clipboard.writeText(code).catch(() => undefined);
  };
  const showChat = (): void => {
    openSettingsWindow('chat');
  };
  const createRoom = async (): Promise<void> => {
    await room.create();
    showChat();
  };
  const joinRoom = async (text: string): Promise<JoinResult> => {
    const result = await room.join(text);
    if (result.ok) showChat();
    return result;
  };

  // macOS Accessibility. Without it the helper can't create its event tap, so it isn't started: a timer waits for
  // the permission instead. `staleAccess`: macOS lists lolPing as allowed, yet the helper still has no access.
  let accessTimer: NodeJS.Timeout | null = null;
  let staleAccess = false;
  const trusted = (): boolean => !IS_MAC || systemPreferences.isTrustedAccessibilityClient(false);
  const stopWaitingForAccess = (): void => {
    if (accessTimer) clearInterval(accessTimer);
    accessTimer = null;
  };
  const waitForAccess = (): void => {
    if (accessTimer) return;
    accessTimer = setInterval(() => {
      if (!trusted()) return;
      stopWaitingForAccess();
      staleAccess = false;
      bridge.retry();
    }, 1500);
    overlays.cancelWheel();
    pushStatus();
  };
  const startHelper = (): void => {
    staleAccess = false;
    if (trusted()) bridge.retry();
    else waitForAccess();
  };

  const helperStatus = (): HelperStatus => (accessTimer ? 'noAccess' : bridge.status);
  const status = (): AppStatus => ({ enabled, helper: helperStatus(), staleAccess });
  const trayMode = (): TrayMode => {
    const h = helperStatus();
    if (h === 'failed' || h === 'noAccess') return h;
    return enabled ? 'on' : 'off';
  };
  const tray = new AppTray(
    assetPath('textures', 'generic_ping.png'),
    {
      openSettings: () => openSettingsWindow(),
      setEnabled: (on) => setEnabled(on),
      retryHelper: startHelper,
      quit: () => app.quit(),
      room: {
        joinClipboard: () => {
          void clipboardCode().then((code) => {
            if (code) void joinRoom(code);
            else overlays.toast(text().toastNoCode, text().toastNoCodeBody);
          });
        },
        create: () => void createRoom(),
        copyCode: copyRoomCode,
        setMuted: (on) => store.update({ roomMuted: on }),
        leave: () => room.leave(),
        openSettings: () => openSettingsWindow('room'),
      },
      // The tray has no card to show a result on, so the handlers toast it. Nothing to toast on once the overlays are gone.
      update: updater
        ? trayUpdateHandlers({ updater, toast: (title, body) => { if (!quitting) overlays.toast(title, body); }, text })
        : { check: () => undefined, start: () => undefined },
    },
    text(),
    IS_MAC ? { on: buildResourcePath('trayTemplate.png'), off: buildResourcePath('trayOffTemplate.png') } : undefined,
  );
  /** Sends to the settings window if there is one that is still alive (the updater also reports while the app quits). */
  function sendToSettings(channel: string, payload: unknown): void {
    const w = settingsWindow();
    if (w && !w.webContents.isDestroyed()) w.webContents.send(channel, payload);
  }
  if (updater) {
    updater.on('state', (s: UpdateState) => {
      if (quitting) return; // the tray and windows are going away
      tray.setUpdate(trayUpdateFrom(s));
      sendToSettings(SETTINGS_CH.updateState, s);
    });
    updater.on('notify', (version: string) => {
      if (!quitting) overlays.toast(text().updateToastTitle, text().updateToastBody(version));
    });
    tray.setUpdate(trayUpdateFrom(updater.state));
  }
  function pushRoom(): void {
    if (quitting) return;
    const s = roomState();
    tray.setRoom({ code: s.code, count: s.members.length, muted: settings.roomMuted });
    sendToSettings(SETTINGS_CH.roomChanged, s);
    heartsteelWidget.setRoom(s);
  }
  function pushChat(): void {
    if (quitting) return;
    sendToSettings(SETTINGS_CH.roomChatChanged, room.chatState());
  }
  const syncRoomFlags = (): void => room.setStatusFlags({ paused: !enabled, roomMuted: settings.roomMuted });
  room.on('state', pushRoom);
  room.on('chatState', pushChat);
  room.on('chatMessage', (m) => overlays.spawnChatDanmaku(m));
  room.on('heartsteelBonusHealth', (heartsteelBonusHealth: number) => {
    store.update({ heartsteelBonusHealth });
  });
  const heartsteelCursor = (): HeartsteelCursorKind =>
    settings.cursorSkinEnabled ? (settings.cursorSkinClassic ? 'classic' : 'modern') : 'system';
  room.on('heartsteelTarget', (target) => {
    const display = resolveTarget(overlays.numbered(), target.d);
    if (!display) return;
    overlays.showHeartsteelTarget({
      displayId: display.id,
      id: target.id,
      x: target.x * display.bounds.width,
      y: target.y * display.bounds.height,
      expiresAt: target.expiresAt,
      cursor: heartsteelCursor(),
    });
  });
  room.on('heartsteelClear', (target: { id: string } | null) => overlays.clearHeartsteelTarget(target?.id));
  room.on('heartsteelHit', (hit) => {
    const target = room.state().heartsteel.target;
    if (!target) return;
    const display = resolveTarget(overlays.numbered(), target.d);
    if (!display) return;
    overlays.showHeartsteelHit({
      displayId: display.id,
      id: hit.id,
      x: target.x * display.bounds.width,
      y: target.y * display.bounds.height,
      winnerName: hit.winnerName,
      winnerColor: hit.winnerColor,
      damage: hit.damage,
      bonusGain: hit.bonusGain,
    });
  });
  overlays.on('displays', pushRoom);
  room.on('remotePing', (p) => overlays.spawnRemote(p));
  overlays.on('shared', (p: SharedPing) => {
    const shared = toShared(overlays.numbered(), p.displayId, p.x, p.y);
    if (shared) room.sendPing(p.id, shared);
  });
  room.on('remoteEmote', (p) => overlays.spawnRemoteEmote(p));
  overlays.on('sharedEmote', (p: SharedEmote) => {
    const shared = toShared(overlays.numbered(), p.displayId, p.x, p.y);
    if (shared) room.sendEmote(p.ref, shared);
  });
  overlays.on('action', (p: SelectedAction) => {
    const slot = settings.actionWheel.find((a) => a.id === p.id);
    if (!slot) {
      overlays.toast(text().actionFailed, text().actionMissing);
      return;
    }
    void executeAction(slot, {
      platform: PLATFORM,
      openExternal: (url) => shell.openExternal(url),
      openPath: (path) => shell.openPath(path),
      run: runDetached,
      injectKeys: (keys) => bridge.injectKeys(keys),
      exists: existsSync,
    }).then((result) => {
      if (result.ok) return;
      const t = text();
      const body = result.reason === 'missingConfig' ? t.actionMissingConfig
        : result.reason === 'invalidUrl' ? t.actionInvalidUrl
          : result.reason === 'pathMissing' ? t.actionPathMissing
            : result.reason === 'unsupported' ? t.actionUnsupported
              : result.message || t.actionOpenFailed;
      overlays.toast(t.actionFailed, body);
    }).catch((err: Error) => {
      console.warn('[action]', err);
      overlays.toast(text().actionFailed, text().actionOpenFailed);
    });
  });
  overlays.on('heartsteelClaim', (p: { id: string }) => room.claimHeartsteelTarget(p.id));
  room.on('saveCode', (code: string | null) => store.update({ lastRoomCode: code }));
  room.on('toast', (n: RoomToast) => {
    const t = text();
    const code = room.state().code ?? '';
    if (n.kind === 'joinedRoom') overlays.toast(t.toastRoomJoined(n.code), t.toastRoomJoinedBody);
    else if (n.kind === 'full') overlays.toast(t.toastRoomFull, t.toastRoomFullBody);
    else if (n.kind === 'joined') overlays.toast(t.toastMemberJoined(n.name), code);
    else if (n.kind === 'left') overlays.toast(t.toastMemberLeft(n.name), code);
    else overlays.toast(t.toastMemberLost(n.name), code);
  });
  powerMonitor.on('resume', () => {
    lan.rebind();
    relay.wake();
  });

  function pushStatus(): void {
    if (quitting) return;
    tray.set(trayMode(), enabled);
    settingsWindow()?.webContents.send(SETTINGS_CH.statusChanged, status());
  }
  const about = (): About => ({
    version: app.getVersion(),
    problems: [
      ...store.problems,
      ...(store.emoteKeyClashed ? [text().problemEmoteKeyClash] : []),
      ...(store.actionKeyClashed ? [text().problemActionKeyClash] : []),
      ...[...overlays.missingAssets].map((a) => text().missingAsset(a)),
    ],
    limitations: text().limitations,
  });

  function setEnabled(on: boolean): void {
    if (on === enabled) return;
    enabled = on;
    bridge.send(configCommand(store.get(), enabled)); // also refreshes the config re-sent after restarts
    const t = text();
    overlays.toast(on ? t.toastOn : t.toastOff, t.toastToggleHint(hotkeyLabel(store.get().toggleHotkey, PLATFORM)));
    syncRoomFlags();
    pushStatus();
  }

  bridge.on('event', (ev) => {
    if (ev.type === 'toggled') setEnabled(ev.enabled);
    else if (ev.type === 'ready') {
      // A restarted helper starts unsuspended: re-apply an active key capture.
      if (capturing) bridge.send({ type: 'suspend', on: true });
    } else if (ev.type === 'error') console.warn('[helper]', ev.code ?? '', ev.message);
    else overlays.handle(ev);
  });
  bridge.on('status', (s: HelperStatus) => {
    // A helper that is starting or has stopped can no longer send the cancel that dismisses a wheel left on screen.
    if (s !== 'running') overlays.cancelWheel();
    if (s === 'noAccess') {
      // Allowed but still refused is an entry left over from an earlier build. Otherwise wait for the user to allow it.
      if (trusted()) staleAccess = true;
      else waitForAccess();
      openSettingsWindow();
    }
    pushStatus();
    if (s === 'failed') overlays.toast(text().toastHelperStopped, text().toastHelperStoppedBody);
  });
  bridge.on('log', (line: string) => console.log('[helper]', line));

  store.on('change', (s: Settings) => {
    const previous = settings;
    settings = s;
    bridge.send(configCommand(s, enabled));
    overlays.updateSettings(overlaySettings(s));
    heartsteelWidget.setSettings(s);
    settingsWindow()?.webContents.send(SETTINGS_CH.changed, s);
    if (s.language !== previous.language) tray.setText(text());
    if (
      s.displayName !== previous.displayName
      || s.tagColor !== previous.tagColor
      || s.heartsteelBonusHealth !== previous.heartsteelBonusHealth
    ) room.profileChanged();
    if (s.autoUpdateCheck !== previous.autoUpdateCheck) updater?.setAutoCheck(s.autoUpdateCheck);
    if (s.roomMuted !== previous.roomMuted) {
      syncRoomFlags();
      pushRoom();
    }
    if (s.allowInternet !== previous.allowInternet) {
      room.setInternetAllowed(s.allowInternet);
      pushRoom();
    }
    if (app.isPackaged && s.launchAtStartup !== previous.launchAtStartup) {
      // macOS ignores args, and a Mac launch starts in the menu bar anyway.
      app.setLoginItemSettings(IS_MAC ? { openAtLogin: s.launchAtStartup } : { openAtLogin: s.launchAtStartup, args: ['--hidden'] });
    }
  });

  registerSettingsIpc({
    store,
    library,
    getStatus: status,
    setEnabled,
    preview: (id) => overlays.previewPing(id),
    previewEmote: (ref) => overlays.previewEmote(ref),
    about,
    retryHelper: startHelper,
    setCapturing: (on) => {
      capturing = on;
      bridge.send({ type: 'suspend', on });
    },
    openAccessibility: () => {
      systemPreferences.isTrustedAccessibilityClient(true); // adds lolPing to the list and shows the system prompt
      void shell.openExternal(ACCESSIBILITY_PANE);
      if (!trusted()) waitForAccess();
    },
    text,
    platform: PLATFORM,
    cursorSkin,
    update: updater
      ? { state: () => updater.state, notesUrl: () => updater.notesUrl, check: () => updater.check(true), start: () => updater.startUpdate() }
      : undefined,
    room: {
      state: roomState,
      create: () => room.create(),
      join: (t) => room.join(t),
      leave: () => room.leave(),
      mute: (peer, on) => room.muteMember(peer, on),
      setHeartsteelEnabled: (on) => room.setHeartsteelEnabled(on),
      clipboardCode,
      copyCode: copyRoomCode,
      retryInternet: () => relay.retryNow(),
      chatState: () => room.chatState(),
      sendChat: (text) => room.sendChat(text),
      retryChat: (id) => room.retryChat(id),
    },
    showSection: (section) => {
      openSettingsWindow(section);
    },
  });
  // The page can't report that it went away mid-capture (window closed, renderer crashed): release the suspend here.
  onSettingsWindowGone(() => {
    if (!capturing) return;
    capturing = false;
    bridge.send({ type: 'suspend', on: false });
  });

  bridge.send(configCommand(settings, enabled));
  heartsteelWidget.setSettings(settings);
  if (trusted()) bridge.start();
  else waitForAccess();
  pushStatus();
  syncRoomFlags();
  room.setInternetAllowed(settings.allowInternet);
  pushRoom();
  pushChat();
  if (settings.rejoinRoom && settings.lastRoomCode) void room.join(settings.lastRoomCode);
  if (IS_MAC) {
    // A menu bar app: open settings only when there is something to do, otherwise point at the menu bar icon.
    if (store.firstRun || !trusted()) openSettingsWindow();
    else overlays.toast(text().toastMenuBar, text().toastMenuBarBody);
  } else if (!process.argv.includes('--hidden')) {
    openSettingsWindow();
  }

  updater?.start();

  app.on('window-all-closed', () => {
    /* stay running: the overlays are the app */
  });
  app.on('before-quit', (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    updater?.stop(); // aborts a download and drops a check in flight; an install that is quitting the app is left alone
    room.quit(); // says bye, so the others see "left" instead of waiting for a timeout
    transfer.stop();
    stopWaitingForAccess();
    tray.destroy();
    overlays.destroy();
    heartsteelWidget.destroy();
    void Promise.allSettled([bridge.stop(), store.flush(), lan.whenClosed(), relay.whenClosed()]).then(() => app.exit(0));
  });
}
