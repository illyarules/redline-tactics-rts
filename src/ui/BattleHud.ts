import type { Rect, Vec2 } from '../core/geometry';
import './battleHud.css';

export interface BattleHudAction {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly title?: string;
  readonly testId?: string;
  readonly onTrigger: () => void;
}

export interface BattleHudQueueItem {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly testId?: string;
  readonly onCancel: () => void;
}

export interface BattleHudMinimap {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly (readonly ('hidden' | 'explored' | 'visible')[])[];
  readonly fields: readonly { readonly position: Vec2; readonly visible: boolean }[];
  readonly entities: readonly {
    readonly position: Vec2;
    readonly friendly: boolean;
    readonly building: boolean;
  }[];
  readonly viewport: Rect;
}

export interface BattleHudViewModel {
  readonly commandTitle: string;
  readonly status: string;
  readonly connected?: boolean;
  readonly clock: string;
  readonly clockLabel: string;
  readonly selection: {
    readonly name: string;
    readonly detail: string;
    readonly healthFraction: number;
  };
  readonly credits: number;
  readonly economyStatus?: string;
  readonly economyWarning?: boolean;
  readonly commandFeedback?: {
    readonly state: 'pending' | 'confirmed' | 'rejected';
    readonly message: string;
  };
  readonly actionTitle: string;
  readonly actionTestId?: string;
  readonly emptyMessage?: string;
  readonly actions: readonly BattleHudAction[];
  readonly queue: readonly BattleHudQueueItem[];
  readonly minimap: BattleHudMinimap;
}

export interface BattleHudOptions {
  readonly topActions: readonly BattleHudAction[];
  readonly onMinimapNavigate: (position: Vec2) => void;
  readonly selectionTestId?: string;
}

/** Shared presentation-only battle HUD. All rules and commands arrive through its view model. */
export class BattleHud {
  private readonly root = element('div', 'battle-hud');
  private readonly commandTitle = element('strong');
  private readonly status = element('span');
  private readonly clock = element('div', 'battle-hud__clock');
  private readonly clockValue = element('span');
  private readonly selectionName = element('div', 'battle-hud__selection-name');
  private readonly selectionDetail = element('div', 'battle-hud__selection-detail');
  private readonly healthFill = element('div', 'battle-hud__health-fill');
  private readonly credits = element('strong');
  private readonly economyStatus = element('span', 'battle-hud__economy-status');
  private readonly actionPanel = element('section', 'battle-hud__panel battle-hud__actions');
  private readonly actionTitle = element('div', 'battle-hud__action-title');
  private readonly commandFeedback = element('div', 'battle-hud__command-feedback');
  private readonly actionGrid = element('div', 'battle-hud__action-grid');
  private readonly queue = element('div', 'battle-hud__queue');
  private readonly minimap = document.createElement('canvas');
  private readonly actionButtons = new Map<string, HTMLButtonElement>();
  private readonly actionCallbacks = new Map<string, () => void>();
  private readonly queueButtons = new Map<string, HTMLButtonElement>();
  private readonly queueCallbacks = new Map<string, () => void>();
  private lastMinimapDrawMilliseconds = Number.NEGATIVE_INFINITY;

  public constructor(container: HTMLElement, private readonly options: BattleHudOptions) {
    this.root.dataset.testid = 'tactical-hud';
    const topbar = element('div', 'battle-hud__topbar');
    const command = element('div', 'battle-hud__command');
    command.append(this.commandTitle, this.status);
    this.clockValue.dataset.testid = 'match-timer';
    this.clock.append(this.clockValue, textElement('small', ''));
    const topActions = element('div', 'battle-hud__top-actions');
    for (const action of options.topActions) topActions.append(actionButton(action, true));
    topbar.append(command, this.clock, topActions);

    const bottom = element('div', 'battle-hud__bottom');
    const selection = element('section', 'battle-hud__panel battle-hud__selection');
    selection.dataset.testid = options.selectionTestId ?? 'selection-panel';
    const health = element('div', 'battle-hud__health-track');
    health.append(this.healthFill);
    const resource = element('div', 'battle-hud__resource');
    resource.append(this.credits, textElement('span', 'Credits'), this.economyStatus);
    selection.append(this.selectionName, this.selectionDetail, health, resource);
    this.commandFeedback.hidden = true;
    this.commandFeedback.dataset.testid = 'command-feedback';
    this.actionPanel.append(this.actionTitle, this.commandFeedback, this.actionGrid, this.queue);
    const minimapPanel = element('section', 'battle-hud__panel battle-hud__minimap-panel');
    this.minimap.width = 160;
    this.minimap.height = 160;
    this.minimap.className = 'battle-hud__minimap';
    this.minimap.setAttribute('aria-label', 'Tactical minimap');
    this.minimap.addEventListener('click', this.onMinimapClick);
    minimapPanel.append(this.minimap);
    bottom.append(selection, this.actionPanel, minimapPanel);

    const hint = element('div', 'battle-hud__hint');
    hint.dataset.testid = 'controls-hint';
    hint.innerHTML = '<kbd>W A S D / ↑ ← ↓ →</kbd> pan &nbsp; <kbd>Wheel</kbd> zoom &nbsp; <kbd>+ / −</kbd> zoom &nbsp; <kbd>Right click</kbd> order &nbsp; <kbd>Q</kbd> attack-move &nbsp; <kbd>E</kbd> entrench';
    this.root.append(topbar, bottom, hint);
    container.append(this.root);
  }

  public update(model: BattleHudViewModel): void {
    this.commandTitle.textContent = model.commandTitle;
    this.status.textContent = model.status;
    this.root.dataset.connection = model.connected === false ? 'offline' : 'online';
    this.clockValue.textContent = model.clock;
    const clockLabel = this.clock.querySelector('small');
    if (clockLabel !== null) clockLabel.textContent = model.clockLabel;
    this.selectionName.textContent = model.selection.name;
    this.selectionDetail.textContent = model.selection.detail;
    this.setHealth(model.selection.healthFraction);
    this.credits.textContent = Math.floor(model.credits).toLocaleString();
    this.economyStatus.textContent = model.economyStatus ?? '';
    this.economyStatus.dataset.warning = String(model.economyWarning === true);
    this.actionTitle.textContent = model.actionTitle;
    this.commandFeedback.hidden = model.commandFeedback === undefined;
    if (model.commandFeedback !== undefined) {
      this.commandFeedback.dataset.state = model.commandFeedback.state;
      this.commandFeedback.textContent = model.commandFeedback.message;
    }
    delete this.actionPanel.dataset.testid;
    if (model.actionTestId !== undefined) this.actionPanel.dataset.testid = model.actionTestId;
    if (model.emptyMessage !== undefined) {
      this.actionButtons.clear();
      this.actionCallbacks.clear();
      const empty = this.actionGrid.querySelector<HTMLElement>('.battle-hud__action-empty')
        ?? textElement('div', '', 'battle-hud__action-empty');
      empty.textContent = model.emptyMessage;
      this.actionGrid.replaceChildren(empty);
    } else {
      this.renderActions(model.actions);
    }
    this.renderQueue(model.queue);
    const now = performance.now();
    if (now - this.lastMinimapDrawMilliseconds >= 200) {
      this.drawMinimap(model.minimap);
      this.lastMinimapDrawMilliseconds = now;
    }
  }

  public destroy(): void {
    this.minimap.removeEventListener('click', this.onMinimapClick);
    this.root.remove();
  }

  private setHealth(fraction: number): void {
    const clamped = Math.max(0, Math.min(1, fraction));
    this.healthFill.style.width = `${Math.round(clamped * 100)}%`;
    this.healthFill.dataset.health = clamped > 0.6 ? 'high' : clamped > 0.3 ? 'medium' : 'low';
  }

  private renderActions(actions: readonly BattleHudAction[]): void {
    this.actionGrid.querySelector('.battle-hud__action-empty')?.remove();
    const wanted = new Set(actions.map((action) => action.id));
    for (const [id, button] of this.actionButtons) {
      if (!wanted.has(id)) { button.remove(); this.actionButtons.delete(id); this.actionCallbacks.delete(id); }
    }
    actions.forEach((action, index) => {
      let button = this.actionButtons.get(action.id);
      if (button === undefined) {
        button = element('button', 'battle-hud__button');
        button.type = 'button';
        button.addEventListener('click', () => this.actionCallbacks.get(action.id)?.());
        this.actionButtons.set(action.id, button);
      }
      this.actionCallbacks.set(action.id, action.onTrigger);
      updateActionButton(button, action);
      const current = this.actionGrid.children.item(index);
      if (current !== button) this.actionGrid.insertBefore(button, current);
    });
  }

  private renderQueue(items: readonly BattleHudQueueItem[]): void {
    const wanted = new Set(items.map((item) => item.id));
    for (const [id, button] of this.queueButtons) {
      if (!wanted.has(id)) { button.remove(); this.queueButtons.delete(id); this.queueCallbacks.delete(id); }
    }
    items.forEach((item, index) => {
      let button = this.queueButtons.get(item.id);
      if (button === undefined) {
        button = element('button', 'battle-hud__queue-item');
        button.type = 'button';
        button.addEventListener('click', () => this.queueCallbacks.get(item.id)?.());
        this.queueButtons.set(item.id, button);
      }
      this.queueCallbacks.set(item.id, item.onCancel);
      button.title = item.detail ?? `Cancel ${item.label}`;
      button.setAttribute('aria-label', 'Cancel');
      button.textContent = item.label;
      if (item.testId === undefined) delete button.dataset.testid;
      else button.dataset.testid = item.testId;
      const current = this.queue.children.item(index);
      if (current !== button) this.queue.insertBefore(button, current);
    });
  }

  private drawMinimap(model: BattleHudMinimap): void {
    const context = this.minimap.getContext('2d');
    if (context === null) return;
    const width = this.minimap.width;
    const height = this.minimap.height;
    const cellWidth = width / Math.max(1, model.cells[0]?.length ?? 1);
    const cellHeight = height / Math.max(1, model.cells.length);
    context.fillStyle = '#03080b';
    context.fillRect(0, 0, width, height);
    model.cells.forEach((row, y) => row.forEach((visibility, x) => {
      if (visibility === 'hidden') return;
      context.fillStyle = visibility === 'visible' ? '#253d35' : '#111f1d';
      context.fillRect(x * cellWidth, y * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight));
    }));
    for (const field of model.fields) {
      if (!field.visible) continue;
      context.fillStyle = '#55cad5';
      context.fillRect(field.position.x / model.width * width - 1, field.position.y / model.height * height - 1, 3, 3);
    }
    for (const entity of model.entities) {
      context.fillStyle = entity.friendly ? '#63ccff' : '#ff745c';
      const size = entity.building ? 5 : 3;
      context.fillRect(entity.position.x / model.width * width - size / 2, entity.position.y / model.height * height - size / 2, size, size);
    }
    context.strokeStyle = '#f2f6c3';
    context.lineWidth = 1;
    context.strokeRect(
      model.viewport.x / model.width * width,
      model.viewport.y / model.height * height,
      model.viewport.width / model.width * width,
      model.viewport.height / model.height * height,
    );
  }

  private readonly onMinimapClick = (event: MouseEvent): void => {
    const bounds = this.minimap.getBoundingClientRect();
    this.options.onMinimapNavigate({
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    });
  };
}

function actionButton(action: BattleHudAction, compact = false): HTMLButtonElement {
  const button = element('button', `battle-hud__button${compact ? ' battle-hud__button--compact' : ''}`);
  button.type = 'button';
  button.disabled = action.disabled === true;
  button.title = action.disabledReason ?? action.title ?? action.detail;
  if (action.testId !== undefined) button.dataset.testid = action.testId;
  button.append(document.createTextNode(action.label));
  if (action.detail !== '') button.append(textElement('small', action.disabledReason ?? action.detail));
  button.addEventListener('click', action.onTrigger);
  return button;
}

function updateActionButton(button: HTMLButtonElement, action: BattleHudAction): void {
  button.disabled = action.disabled === true;
  button.title = action.disabledReason ?? action.title ?? action.detail;
  if (action.testId === undefined) delete button.dataset.testid;
  else button.dataset.testid = action.testId;
  const label = button.firstChild;
  if (label?.nodeType === Node.TEXT_NODE) label.textContent = action.label;
  else button.prepend(document.createTextNode(action.label));
  let detail = button.querySelector('small');
  if (action.detail === '') detail?.remove();
  else {
    if (detail === null) { detail = document.createElement('small'); button.append(detail); }
    detail.textContent = action.disabledReason ?? action.detail;
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  value.className = className;
  return value;
}

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = ''): HTMLElementTagNameMap[K] {
  const value = element(tag, className);
  value.textContent = text;
  return value;
}
