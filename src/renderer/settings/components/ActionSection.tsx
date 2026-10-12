import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Slider,
} from '@fluentui/react-components';
import { Apps24Regular, Folder24Regular, Keyboard24Regular } from '@fluentui/react-icons';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_ACTION_WHEEL,
  DEFAULT_VOLUME_STEP,
  VOLUME_STEP_INCREMENT,
  VOLUME_STEP_MAX,
  VOLUME_STEP_MIN,
  actionTemplate,
  isActionKind,
  type ActionKind,
  type ActionSlot,
} from '../../../shared/actions';
import { actionDisplayName } from '../../../shared/actionDisplay';
import { triggerLabel, type Settings } from '../../../shared/settings';
import type { WheelPatch, WheelSource, WheelTarget } from '../../../shared/wheelLayout';
import { api } from '../api';
import {
  actionParams,
  cloneActionTemplateForSlot,
  isActionConfigurable,
  validateActionConfig,
  withActionConfig,
  type ActionConfigIssue,
} from '../actionConfig';
import { actionLibraryItems, actionWheelItems } from '../actionItems';
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

function patchForDrop(current: readonly ActionSlot[], p: WheelPatch<ActionPoolId>, prepared = new Map<string, ActionSlot>()): Partial<Settings> {
  const next = current.map(copySlot);
  if (!p.wheel) return {};
  return {
    actionWheel: p.wheel.map((id, i) => {
      const preparedSlot = prepared.get(id);
      if (preparedSlot) return copySlot(preparedSlot);
      const existing = next.find((a) => a.id === id);
      if (existing) return existing;
      const fallback = DEFAULT_ACTION_WHEEL.find((a) => a.id === id);
      if (fallback) return copySlot(fallback);
      const kind = id.replace(/^template:/, '') as ActionKind;
      return cloneForSlot(actionTemplate(kind), i);
    }),
  };
}

function kindFromTemplateId(id: string): ActionKind | null {
  if (!id.startsWith('template:')) return null;
  const kind = id.replace(/^template:/, '');
  return isActionKind(kind) ? kind : null;
}

function issueMessage(issue: ActionConfigIssue | null, t: ReturnType<typeof useText>): string | undefined {
  if (issue === 'url') return t.actionConfigUrlError;
  if (issue === 'path') return t.actionConfigPathError;
  if (issue === 'volumeStep') return t.actionConfigVolumeError;
  return undefined;
}

export function ActionSection({ settings: s, update }: { settings: Settings; update: Update }) {
  const t = useText();
  const [keyError, setKeyError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActionSlot | null>(null);
  const configResolver = useRef<((slot: ActionSlot | null) => void) | null>(null);
  const preparedSlots = useRef(new Map<string, ActionSlot>());

  const keys = JSON.stringify([s.trigger, s.emoteTrigger, s.actionTrigger, s.toggleHotkey]);
  useEffect(() => setKeyError(null), [keys]);

  const keyOff = s.actionTrigger === 'off';
  const key = s.actionTrigger === 'off' ? t.actionKey : triggerLabel(s.actionTrigger, t.lang, api.platform);
  const wheelIds = s.actionWheel.map((a) => a.id);
  const pool: PoolItem<ActionPoolId>[] = actionLibraryItems(t);
  const wheelItems: PoolItem<ActionPoolId>[] = actionWheelItems(s.actionWheel, t);

  const openConfig = (slot: ActionSlot): Promise<ActionSlot | null> => new Promise((resolve) => {
    configResolver.current = resolve;
    setDraft(copySlot(slot));
  });

  const closeConfig = (slot: ActionSlot | null) => {
    const resolve = configResolver.current;
    configResolver.current = null;
    setDraft(null);
    if (resolve) resolve(slot);
  };

  const saveConfig = () => {
    if (!draft) return;
    const configured = withActionConfig(draft, { label: draft.label, params: draft.params });
    if (validateActionConfig(configured)) return;
    if (configResolver.current) {
      closeConfig(configured);
      return;
    }
    void update({
      actionWheel: s.actionWheel.map((slot) => (slot.id === configured.id ? configured : slot)),
    });
    closeConfig(null);
  };

  const updateDraft = (patch: Partial<ActionSlot>) => {
    setDraft((current) => (current ? { ...current, ...patch, params: patch.params ?? current.params } : current));
  };

  const updateDraftParams = (params: ActionSlot['params']) => {
    setDraft((current) => (current ? { ...current, params: actionParams(current.kind, { ...current.params, ...params }) } : current));
  };

  const prepareActionDrop = async (src: WheelSource<ActionPoolId>, target: WheelTarget, patch: WheelPatch<ActionPoolId>): Promise<WheelPatch<ActionPoolId> | null> => {
    if (src.from !== 'pool') return patch;
    const kind = kindFromTemplateId(src.id);
    if (!kind || !isActionConfigurable(kind)) return patch;

    const slot = cloneActionTemplateForSlot(kind, typeof target === 'number' ? target : 0, actionTemplate(kind).params);
    const configured = await openConfig(slot);
    if (!configured) return null;
    preparedSlots.current.set(configured.id, configured);
    return {
      ...patch,
      wheel: patch.wheel?.map((id) => (id === src.id ? configured.id : id)),
      center: patch.center === src.id ? configured.id : patch.center,
    };
  };

  const editExistingSlot = (id: ActionPoolId): boolean => {
    const slot = s.actionWheel.find((a) => a.id === id);
    if (!slot || !isActionConfigurable(slot.kind)) return false;
    setDraft(copySlot(slot));
    return true;
  };

  const commitDrop = (patch: WheelPatch<ActionPoolId>) => {
    const prepared = preparedSlots.current;
    preparedSlots.current = new Map();
    void update(patchForDrop(s.actionWheel, patch, prepared));
  };

  const issue = draft ? validateActionConfig(draft) : null;
  const needsPath = draft?.kind === 'openApp' || draft?.kind === 'openFile' || draft?.kind === 'openFolder';
  const needsVolume = draft?.kind === 'volumeUp' || draft?.kind === 'volumeDown';
  const volumeStep = draft?.params?.volumeStep ?? DEFAULT_VOLUME_STEP;

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
        wheelItems={wheelItems}
        defaults={{ wheel: DEFAULT_ACTION_WHEEL.map((a) => a.id), center: DEFAULT_ACTION_WHEEL[0].id }}
        labels={{ title: t.actionWheelTitle, desc: t.actionWheelDesc(key), poolTitle: t.actionLibrary, poolDesc: t.actionLibraryDesc }}
        onBeforeApply={prepareActionDrop}
        onChange={commitDrop}
        onEditTarget={editExistingSlot}
        showCenter={false}
        onPreview={() => undefined}
      />
      <Dialog open={draft !== null} onOpenChange={(_, data) => { if (!data.open) closeConfig(null); }}>
        <DialogSurface className={needsVolume ? 'actionConfigSurface compact' : 'actionConfigSurface'}>
          <DialogBody>
            <DialogTitle>{draft ? t.actionEditTitle(actionDisplayName(draft, t)) : t.actionLibrary}</DialogTitle>
            <DialogContent>
              <div className="actionConfigDialog">
                {!needsVolume ? <Field label={t.actionLabel}>
                  <Input value={draft?.label ?? ''} onChange={(_, data) => updateDraft({ label: data.value })} />
                </Field> : null}
                {draft?.kind === 'openUrl' ? (
                  <Field label={t.actionUrl} validationState={issue === 'url' ? 'error' : 'none'} validationMessage={issueMessage(issue === 'url' ? issue : null, t)}>
                    <Input value={draft.params?.url ?? ''} onChange={(_, data) => updateDraftParams({ url: data.value })} />
                  </Field>
                ) : null}
                {needsPath ? (
                  <Field label={t.actionPath} validationState={issue === 'path' ? 'error' : 'none'} validationMessage={issueMessage(issue === 'path' ? issue : null, t)}>
                    <div className="actionPathRow">
                      <Input value={draft?.params?.path ?? ''} onChange={(_, data) => updateDraftParams({ path: data.value })} />
                      <Button
                        icon={draft?.kind === 'openFolder' ? <Folder24Regular /> : <Apps24Regular />}
                        onClick={async () => {
                          if (!draft) return;
                          const picked = draft.kind === 'openFolder' ? await api.pickFolder() : await api.pickFile();
                          if (picked) updateDraftParams({ path: picked });
                        }}
                      >
                        {t.browse}
                      </Button>
                    </div>
                  </Field>
                ) : null}
                {needsVolume ? (
                  <Field label={t.actionVolumeStep} validationState={issue === 'volumeStep' ? 'error' : 'none'}
                    validationMessage={issueMessage(issue === 'volumeStep' ? issue : null, t)}>
                    <div className="actionVolumeRow">
                      <Slider
                        min={VOLUME_STEP_MIN}
                        max={VOLUME_STEP_MAX}
                        step={VOLUME_STEP_INCREMENT}
                        value={volumeStep}
                        onChange={(_, data) => updateDraftParams({ volumeStep: data.value })}
                      />
                      <span className="value">{volumeStep}</span>
                    </div>
                  </Field>
                ) : null}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => closeConfig(null)}>{t.actionConfigCancel}</Button>
              <Button appearance="primary" disabled={issue !== null} onClick={saveConfig}>{t.actionConfigSave}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
