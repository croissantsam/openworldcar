import { create } from 'zustand'

export interface TrophyToast {
  key: number
  icon: string
  name: string
}

interface TrophyToastState {
  items: TrophyToast[]
  push: (toast: Omit<TrophyToast, 'key'>) => void
  dismiss: (key: number) => void
}

let toastKey = 0

export const useTrophyToast = create<TrophyToastState>((set) => ({
  items: [],
  push: (toast) => {
    const key = ++toastKey
    set((state) => ({ items: [...state.items.slice(-2), { ...toast, key }] }))
    setTimeout(() => {
      set((state) => ({ items: state.items.filter((t) => t.key !== key) }))
    }, 4000)
  },
  dismiss: (key) => {
    set((state) => ({ items: state.items.filter((t) => t.key !== key) }))
  },
}))
