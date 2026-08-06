import type { InjectionKey, Ref } from 'vue'

export interface LayoutAutofitConfigBridge {
  claim(): Readonly<Ref<unknown>> | null
}

export const layoutAutofitConfigKey: InjectionKey<LayoutAutofitConfigBridge>
  = Symbol('layout-autofit-config')
