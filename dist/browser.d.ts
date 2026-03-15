import { Browser, BrowserContext, Page } from "patchright";
export declare function getBrowser(): Promise<Browser>;
export declare function getContext(): Promise<BrowserContext>;
export declare function newPage(): Promise<Page>;
export declare function closeBrowser(): Promise<void>;
export declare function sleep(ms: number): Promise<void>;
export declare function waitForNavigation(page: Page): Promise<void>;
//# sourceMappingURL=browser.d.ts.map