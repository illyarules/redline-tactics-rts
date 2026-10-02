import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { ICanvasRenderingContext } from '@babylonjs/core/Engines/ICanvas';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { cellVisibility, type FogState } from '../core/fog';
import type { PlayerId } from '../core/ids';
import type { MapGrid } from '../core/map';
import type { SceneSpace } from './sceneSpace';

/** Just above the textured ground; entities have their own visibility rule and sit above it. */
const FOG_HEIGHT = 0.025;
const EXPLORED_OPACITY = 0.58;

/**
 * One textured ground layer presents the core fog cells without creating a mesh per tile. The
 * texture is redrawn only after an authoritative fog update, not on every rendered frame.
 */
export class FogView {
  private readonly mesh: Mesh;
  private readonly texture: DynamicTexture;
  private readonly context: ICanvasRenderingContext;
  private readonly material: StandardMaterial;

  public constructor(scene: Scene, private readonly grid: MapGrid, space: SceneSpace) {
    this.mesh = CreateGround('fog:cells', { width: space.widthUnits, height: space.depthUnits }, scene);
    this.mesh.position.set(space.widthUnits / 2, FOG_HEIGHT, space.depthUnits / 2);
    this.mesh.isPickable = false;

    this.texture = new DynamicTexture(
      `fog:${grid.id}`,
      { width: grid.widthTiles, height: grid.heightTiles },
      scene,
      false,
    );
    this.texture.hasAlpha = true;
    this.context = this.texture.getContext();

    this.material = new StandardMaterial('fog:material', scene);
    this.material.disableLighting = true;
    this.material.diffuseColor = Color3.Black();
    this.material.emissiveColor = Color3.Black();
    this.material.opacityTexture = this.texture;
    this.mesh.material = this.material;
  }

  /** Draws hidden as black, explored as a dark veil, and visible as transparent. */
  public update(fog: FogState, player: PlayerId): void {
    this.context.clearRect(0, 0, this.grid.widthTiles, this.grid.heightTiles);
    for (let ty = 0; ty < this.grid.heightTiles; ty++) {
      for (let tx = 0; tx < this.grid.widthTiles; tx++) {
        const opacity = opacityFor(cellVisibility(fog, player, tx, ty));
        if (opacity === 0) continue;
        this.context.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        // Ground UV V runs north-to-south from Babylon's opposite canvas edge. Keep this reversal
        // here rather than in core so cell (tx, ty) always agrees with the entity/map grid.
        this.context.fillRect(tx, this.grid.heightTiles - ty - 1, 1, 1);
      }
    }
    this.texture.update(false);
  }

  /** Hides only the rendered veil; authoritative visibility remains untouched. */
  public setEnabled(enabled: boolean): void {
    this.mesh.setEnabled(enabled);
  }

  public dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

function opacityFor(visibility: ReturnType<typeof cellVisibility>): number {
  switch (visibility) {
    case 'hidden': return 1;
    case 'explored': return EXPLORED_OPACITY;
    case 'visible': return 0;
  }
}
