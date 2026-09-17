import type { WorldPosition } from '@world-drive/math';
export type PlayerSnapshot = {
    id: string;
    position: WorldPosition;
    /** Euler angles (radians): { x, y, z } */
    rotation: {
        x: number;
        y: number;
        z: number;
    };
    velocity: {
        x: number;
        y: number;
        z: number;
    };
    /** Server tick number this snapshot belongs to. */
    tick: number;
};
export type NPCSnapshot = {
    id: string;
    position: WorldPosition;
    rotation: {
        x: number;
        y: number;
        z: number;
    };
    speed: number;
};
import type { WorldChunk } from './world.js';
export type SerializedChunk = WorldChunk;
//# sourceMappingURL=entities.d.ts.map