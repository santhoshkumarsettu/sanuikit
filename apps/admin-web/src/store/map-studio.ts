'use client'

import { create } from 'zustand'
import type { InventoryUnit, UnitGeometry } from '@vstudio/types'
import type { DrawingTool } from '@vstudio/map-engine'

interface MapStudioState {
  units: InventoryUnit[]; selectedId?: string; tool: DrawingTool; undoStack: InventoryUnit[][]; redoStack: InventoryUnit[][]; geometryEditSnapshot?: InventoryUnit[]
  setTool: (tool: DrawingTool) => void; select: (id?: string) => void
  hydrate: (units: InventoryUnit[]) => void; beginGeometryEdit: () => void; commitGeometryEdit: () => void
  updateGeometry: (id: string, geometry: UnitGeometry) => void; undo: () => void; redo: () => void
}
const snapshot = (units: InventoryUnit[]) => units.map(unit => structuredClone(unit))

export const useMapStudio = create<MapStudioState>((set, get) => ({
  units: [], tool: 'select', undoStack: [], redoStack: [],
  hydrate: units => set({ units: snapshot(units), undoStack: [], redoStack: [], selectedId: undefined, geometryEditSnapshot: undefined }),
  beginGeometryEdit: () => { if (!get().geometryEditSnapshot) set({ geometryEditSnapshot: snapshot(get().units) }) },
  commitGeometryEdit: () => {
    const { geometryEditSnapshot, units, undoStack } = get()
    if (!geometryEditSnapshot) return
    const changed = geometryEditSnapshot.some(previous => { const current = units.find(unit => unit.id === previous.id); return current && JSON.stringify(current.geometry) !== JSON.stringify(previous.geometry) })
    set({ geometryEditSnapshot: undefined, ...(changed ? { undoStack: [...undoStack, geometryEditSnapshot], redoStack: [] } : {}) })
  },
  setTool: tool => set({ tool }), select: selectedId => set({ selectedId }),
  updateGeometry: (id, geometry) => set(state => ({ units: state.units.map(unit => unit.id === id ? { ...unit, geometry } : unit) })),
  undo: () => { const { undoStack, units, redoStack } = get(); const previous = undoStack.at(-1); if (!previous) return; set({ units: previous, undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, snapshot(units)] }) },
  redo: () => { const { redoStack, units, undoStack } = get(); const next = redoStack.at(-1); if (!next) return; set({ units: next, redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, snapshot(units)] }) },
}))
