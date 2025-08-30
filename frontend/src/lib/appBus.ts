// Lightweight app-wide event bus + cross-tab signal via localStorage
// Usage:
//   appBus.on('notes:updated', (e) => { ... })
//   appBus.emit('notes:updated', { source: 'ingest' })

export type AppBusEvent = 'notes:updated'

type Handler = (event: CustomEvent) => void

const target = new EventTarget()
const STORAGE_KEY = '__appbus__'

function addStorageBridge() {
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const payload = JSON.parse(e.newValue) as { event: AppBusEvent; detail?: any; ts: number }
      target.dispatchEvent(new CustomEvent(payload.event, { detail: payload.detail }))
    } catch {
      // ignore parse errors
    }
  })
}

addStorageBridge()

export const appBus = {
  on(event: AppBusEvent, handler: Handler) {
    const wrapped = handler as unknown as EventListener
    target.addEventListener(event, wrapped)
    return () => target.removeEventListener(event, wrapped)
  },
  emit(event: AppBusEvent, detail?: any) {
    const ce = new CustomEvent(event, { detail })
    target.dispatchEvent(ce)
    // cross-tab signal
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ event, detail, ts: Date.now() })
      )
    } catch {
      // localStorage can fail in private mode; ignore
    }
  }
}

export default appBus
