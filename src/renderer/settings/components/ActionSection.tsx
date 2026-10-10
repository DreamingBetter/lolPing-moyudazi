import { Button, Input } from '@fluentui/react-components';
import { Apps24Regular, Folder24Regular, Keyboard24Regular } from '@fluentui/react-icons';
import { useEffect, useState } from 'react';
import {
  ACTION_TEMPLATES, DEFAULT_ACTION_WHEEL, actionIconUrl, actionTemplate, type ActionKind, type ActionSlot,
} from '../../../shared/actions';
import { triggerLabel, type Settings } from '../../../shared/settings';
import type { WheelPatch } from '../../../shared/wheelLayout';
import { api } from '../api';
import { useText } from '../text';
import type { Update } from '../useAppState';
import { SettingRow } from './rows';
import { TriggerPicker } from './TriggerPicker';
import { WheelEditor, type PoolItem } from './WheelEditor';

type ActionPoolId = string;

const copySlot = (slot: ActionSlot): ActionSlot => ({
  ...slot,
  params: slot.params ? { ...slot.params } : undefined,
});

const cloneForSlot = (template: ActionSlot, index: number): ActionSlot => ({
  ...template,
  id: `action-${index}-${template.kind}-${Date.now().toString(36)}`,
  params: template.params ? { ...template.params } : undefined,
});

function patchForDrop(current: readonly ActionSlot[], p: WheelPatch<ActionPoolId>): Partial<Settings> {
  const next = current.map(copySlot);
  if (!p.wheel) return {};
  return {
    actionWheel: p.wheel.map((id, i) => {
      const existing = next.find((a) => a.id === id);
      if (existing) return existing;
      const fallback = DEFAULT_ACTION_WHEEL.find((a) => a.id === id);
      if (fallback) return copySlot(fallback);
      const kind = id.replace(/^template:/, '') as ActionKind;
      return cloneForSlot(actionTemplate(kind), i);
    }),
  };
}

export function ActionSection({ settings: s, update }: { settings: Settings; update: Update }) {
  const t = useText();
  const [keyError, setKeyError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(s.actionWheel[0]?.id ?? '');
  useEffect(() => {
    if (!s.actionWheel.some((a) => a.id === selected)) setSelected(s.actionWheel[0]?.id ?? '');
  }, [s.actionWheel, selected]);
  const keys = JSON.stringify([s.trigger, s.emoteTrigger, s.actionTrigger, s.toggleHotkey]);
  useEffect(() => setKeyError(null), [keys]);

  const keyOff = s.actionTrigger === 'off';
  const key = s.actionTrigger === 'off' ? t.actionKey : triggerLabel(s.actionTrigger, t.lang, api.platform);
  const wheelIds = s.actionWheel.map((a) => a.id);
  const pool: PoolItem<ActionPoolId>[] = [
    ...s.actionWheel.map((a) => ({ id: a.id, icon: actionIconUrl(a.icon), name: a.label })),
    ...ACTION_TEMPLATES.map((a) => ({ id: `template:${a.kind}`, icon: actionIconUrl(a.icon), name: t.actionNames[a.kind] })),
  ];
  const selectedSlot = s.actionWheel.find((a) => a.id === selected);
  const updateSlot = (patch: Partial<ActionSlot>) => {
    if (!selectedSlot) return;
    void update({
      actionWheel: s.actionWheel.map((a) => (a.id === selectedSlot.id
        ? { ...a, ...patch, params: patch.params ?? a.params }
        : a)),
    });
  };

  return (
    <>
      <SettingRow icon={<Keyboard24Regular />} title={t.actionKey} description={keyOff ? t.actionKeyOffDesc : t.actionKeyDesc}>
        <TriggerPicker value={s.actionTrigger} offOption blockedList={[s.trigger, s.emoteTrigger]}
          onChange={(k) => void update({ actionTrigger: k }).then((r) => setKeyError(r.ok ? null : r.error))} />
      </SettingRow>
      {keyError ? <div className="rowError" role="alert">{keyError}</div> : null}
      <WheelEditor
        wheel={wheelIds}
        center={wheelIds[0] ?? ''}
        centerOn={false}
        trigger={key}
        pool={pool}
        defaults={{ wheel: DEFAULT_ACTION_WHEEL.map((a) => a.id), center: DEFAULT_ACTION_WHEEL[0].id }}
        labels={{ title: t.actionWheelTitle, desc: t.actionWheelDesc(key), poolTitle: t.actionLibrary, poolDesc: t.actionLibraryDesc }}
        onChange={(patch) => void update(patchForDrop(s.actionWheel, patch))}
        onPreview={(id) => setSelected(id)}
      />
      {selectedSlot ? (
        <div className="card actionEditor">
          <div className="lbl">{t.actionEditTitle(selectedSlot.label)}<span className="desc">{t.actionEditDesc}</span></div>
          <Input value={selectedSlot.label} onChange={(_, d) => updateSlot({ label: d.value })} />
          {selectedSlot.kind === 'openUrl' ? (
            <Input value={selectedSlot.params?.url ?? ''} aria-label={t.actionUrl}
              onChange={(_, d) => updateSlot({ params: { url: d.value } })} />
          ) : null}
          {selectedSlot.kind === 'openApp' || selectedSlot.kind === 'openFile' || selectedSlot.kind === 'openFolder' ? (
            <div className="actionPathRow">
              <Input value={selectedSlot.params?.path ?? ''} onChange={(_, d) => updateSlot({ params: { path: d.value } })} />
              <Button
                icon={selectedSlot.kind === 'openFolder' ? <Folder24Regular /> : <Apps24Regular />}
                onClick={async () => {
                  const picked = selectedSlot.kind === 'openFolder' ? await api.pickFolder() : await api.pickFile();
                  if (picked) updateSlot({ params: { path: picked } });
                }}
              >
                {t.browse}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
