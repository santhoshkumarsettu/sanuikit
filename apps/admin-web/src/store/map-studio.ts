'use client'

import { create } from 'zustand'
import { canTransitionUnitStatus, type InventoryUnit, type UnitGeometry, type UnitStatus } from '@vstudio/types'
import type { DrawingTool } from '@vstudio/map-engine'
import { demoUnits } from '@vstudio/utils'

interface MapStudioState {
  units: InventoryUnit[]; selectedId?: string; tool: DrawingTool; undoStack: InventoryUnit[][]; redoStack: InventoryUnit[][]
  setTool: (tool: DrawingTool) => void; select: (id?: string) => void; createUnit: (geometry: UnitGeometry, details: Pick<InventoryUnit, 'unitNumber' | 'unitType' | 'area' | 'areaUnit' | 'price' | 'currency'>) => string
  hydrate: (units: InventoryUnit[]) => void
  updateGeometry: (id: string, geometry: UnitGeometry) => void; updateStatus: (id: string, status: UnitStatus) => void; removeSelected: () => void; undo: () => void; redo: () => void
}
const snapshot = (units: InventoryUnit[]) => units.map(unit => structuredClone(unit))

export const useMapStudio = create<MapStudioState>((set, get) => ({
  units: snapshot(demoUnits), tool: 'select', undoStack: [], redoStack: [],
  hydrate: units => set({ units: snapshot(units), undoStack: [], redoStack: [], selectedId: undefined }),
  setTool: tool => set({ tool }), select: selectedId => set({ selectedId }),
  createUnit: (geometry, details) => {
    const current = get().units
    const id = crypto.randomUUID()
    const unit: InventoryUnit = { id, organizationId: 'org-demo', projectId: 'project-green-valley', layoutId: 'layout-master-plan', ...details, status: 'AVAILABLE', geometry, updatedAt: new Date().toISOString() }
    set({ units: [...current, unit], selectedId: id, undoStack: [...get().undoStack, snapshot(current)], redoStack: [] })
    return id
  },
  updateGeometry: (id, geometry) => set(state => ({ units: state.units.map(unit => unit.id === id ? { ...unit, geometry } : unit) })),
  updateStatus: (id, status) => { const current = get().units; const unit = current.find(item => item.id === id); if (!unit || !canTransitionUnitStatus(unit.status, status)) return; set({ units: current.map(item => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item), undoStack: [...get().undoStack, snapshot(current)], redoStack: [] }) },
  removeSelected: () => { const { selectedId, units, undoStack } = get(); if (!selectedId) return; set({ units: units.filter(unit => unit.id !== selectedId), selectedId: undefined, undoStack: [...undoStack, snapshot(units)], redoStack: [] }) },
  undo: () => { const { undoStack, units, redoStack } = get(); const previous = undoStack.at(-1); if (!previous) return; set({ units: previous, undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, snapshot(units)] }) },
  redo: () => { const { redoStack, units, undoStack } = get(); const next = redoStack.at(-1); if (!next) return; set({ units: next, redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, snapshot(units)] }) },
}))
