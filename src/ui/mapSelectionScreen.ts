import type { MapCatalogEntry } from '../config/types';

export class MapSelectionScreen {
  private readonly root = document.createElement('div');
  private readonly cards = new Map<string, HTMLButtonElement>();
  private selected: MapCatalogEntry;

  public constructor(
    container: HTMLElement,
    maps: readonly MapCatalogEntry[],
    onBack: () => void,
    private readonly onStart: (map: MapCatalogEntry) => void,
  ) {
    const initial = maps[0];
    if (initial === undefined) throw new Error('Map selection needs at least one battlefield');
    this.selected = initial;
    const backdrop = maps.find((map) => map.config.id === 'trident-basin')?.thumbnailUrl ?? initial.thumbnailUrl;
    this.root.dataset.testid = 'map-selection';
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', zIndex: '65', display: 'grid', placeItems: 'center',
      padding: '32px', color: '#e7f5ff', overflow: 'auto',
      background: `radial-gradient(circle at 50% 30%, rgba(27,66,82,.68), rgba(3,10,15,.96)), url("${backdrop}") center/cover`,
    });

    const panel = document.createElement('section');
    panel.setAttribute('aria-labelledby', 'map-selection-title');
    Object.assign(panel.style, {
      width: 'min(1080px, calc(100vw - 48px))', padding: '30px', borderRadius: '10px',
      background: 'linear-gradient(180deg, rgba(7,24,36,.97), rgba(4,14,23,.98))',
      border: '1px solid rgba(64,184,235,.58)', boxShadow: '0 24px 90px rgba(0,0,0,.65)',
    });
    panel.innerHTML = '<h1 id="map-selection-title" style="margin:0 0 26px;text-align:center;font:700 clamp(26px,4vw,42px)/1 system-ui,sans-serif;letter-spacing:.08em;color:#80d9ff">SELECT BATTLEFIELD</h1>';

    const grid = document.createElement('div');
    Object.assign(grid.style, { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(330px,100%),1fr))', gap: '22px' });
    for (const map of maps) grid.append(this.card(map));
    panel.append(grid);

    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '28px', flexWrap: 'wrap' });
    actions.append(
      this.action('BACK', 'map-selection-back', false, onBack),
      this.action('START MATCH', 'map-selection-start', true, () => this.onStart(this.selected)),
    );
    panel.append(actions);
    this.root.append(panel);
    container.append(this.root);
    this.renderSelection();
  }

  public destroy(): void { this.root.remove(); }

  private card(map: MapCatalogEntry): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.testid = `map-option-${map.config.id}`;
    button.setAttribute('aria-label', `${map.config.name}, ${map.matchType}, ${map.config.widthTiles} by ${map.config.heightTiles}`);
    Object.assign(button.style, {
      position: 'relative', padding: '12px', textAlign: 'left', cursor: 'pointer', color: '#e7f5ff',
      background: '#091923', borderRadius: '7px', transition: 'border-color .15s, box-shadow .15s, transform .15s',
    });
    button.innerHTML = `<img src="${map.thumbnailUrl}" alt="" style="display:block;width:100%;height:220px;object-fit:cover;border-radius:4px">
      <span style="display:block;margin:16px 4px 5px;font:700 23px/1 system-ui,sans-serif;letter-spacing:.04em">${map.config.name.toUpperCase()}</span>
      <span style="display:flex;gap:12px;margin:0 4px;color:#86cff1;font:650 14px/1.4 system-ui,sans-serif;letter-spacing:.08em"><b>${map.matchType}</b><b>${map.config.widthTiles} × ${map.config.heightTiles}</b></span>
      <span style="display:block;margin:10px 4px 5px;color:#aabfca;font:14px/1.45 system-ui,sans-serif">${map.description}</span>
      <span data-check style="position:absolute;right:20px;top:20px;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#082334;border:2px solid #67ddff;color:#8eeaff;font:800 20px/1 system-ui">✓</span>`;
    button.addEventListener('click', () => { this.selected = map; this.renderSelection(); });
    this.cards.set(map.config.id, button);
    return button;
  }

  private renderSelection(): void {
    for (const [id, card] of this.cards) {
      const selected = id === this.selected.config.id;
      card.setAttribute('aria-pressed', String(selected));
      card.style.border = selected ? '3px solid #51d8ff' : '1px solid rgba(95,173,207,.4)';
      card.style.boxShadow = selected ? '0 0 28px rgba(42,196,255,.24)' : 'none';
      card.style.transform = selected ? 'translateY(-2px)' : 'none';
      const check = card.querySelector<HTMLElement>('[data-check]');
      if (check !== null) check.style.display = selected ? 'grid' : 'none';
    }
  }

  private action(label: string, testId: string, primary: boolean, callback: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.dataset.testid = testId;
    Object.assign(button.style, {
      minWidth: '220px', padding: '14px 24px', cursor: 'pointer', borderRadius: '5px',
      border: `1px solid ${primary ? '#8eeaff' : '#3c7994'}`,
      background: primary ? 'linear-gradient(180deg,#31c8f5,#1684b3)' : '#0b2635',
      color: '#effbff', font: '700 14px/1 system-ui,sans-serif', letterSpacing: '.08em',
    });
    button.addEventListener('click', callback);
    return button;
  }
}
