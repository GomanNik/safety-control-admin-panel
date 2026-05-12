// =====================
// File: src/features/camera/camera-table/types.ts
// Purpose:
//   Table view-model камеры под новый контракт.
//   Без selection и без настройки видимых колонок.
// =====================

import type { Camera } from '../../../entities/camera';

export const CAMERA_TABLE_COLUMN_IDS = [
    'name',
    'site',
    'location',
    'status',
    'lastSeenAt',
] as const;

export type CameraTableColumnId =
    (typeof CAMERA_TABLE_COLUMN_IDS)[number];

export type CameraTableRowId = Camera['id'];

export interface CameraTableTextCellVM {
    kind: 'text';
    text: string;
    title?: string;
}

export interface CameraTableBadgeCellVM {
    kind: 'badge';
    text: string;
    tone?: 'neutral' | 'success' | 'warning' | 'critical';
    title?: string;
}

export type CameraTableCellVM =
    | CameraTableTextCellVM
    | CameraTableBadgeCellVM;

export type CameraTableRowCellsVM = Partial<
    Record<CameraTableColumnId, CameraTableCellVM>
>;

export interface CameraTableRowMetaVM {
    isOnline: boolean;
    isProblematic: boolean;
    isStale: boolean;
}

export interface CameraTableRowVM {
    id: CameraTableRowId;
    camera: Camera;
    cells: CameraTableRowCellsVM;
    meta: CameraTableRowMetaVM;
}

export interface CameraTableModel {
    rows: CameraTableRowVM[];
    total: number;
    loading: boolean;
    error: unknown | null;
    refresh(): Promise<void>;
}