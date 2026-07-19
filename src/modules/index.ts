export { attachModule, listAttachments, loadModule } from "./loader.js";
export { checkoutGitModule } from "./source.js";
export { moduleManifestSchema, parseModuleManifest } from "./schema.js";
export type { AttachModuleOptions, LoadedModule, ModuleAttachment, ModuleOrigin } from "./loader.js";
export type { GitModuleSource } from "./source.js";
export type { ModuleManifest } from "./schema.js";
