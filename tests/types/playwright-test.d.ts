declare module '@playwright/test' {
  export interface TestArgs {
    page: any;
    request: any;
  }
  export const test: any;
  export const expect: any;
  export const devices: Record<string, any>;
  export function defineConfig(config: any): any;
}
