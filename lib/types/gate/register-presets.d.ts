import { type Context } from '@deepseek-ai/cordis';
/** rc.5 has no public register-custom-preset API. Keep its private-field
 * accesses here, checked against the real service in tests. Bundle config
 * replacement would erase native/user presets. Never mutate config.presets.
 */
export declare function mountPermissionPresets(ctx: Context): void;
//# sourceMappingURL=register-presets.d.ts.map