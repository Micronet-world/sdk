export { getKernel } from './kernel'
export type {
  AppId, AppManifest, AppPermission, AppDefinition, AppInstance,
  AppStorage, AppEvents, AppI18n, MnAppBundle, LoadAppOptions, BuildAppOptions,
  AppState, AppStoreEntry, AppStoreConfig, LoaderHooks, LoaderConfig,
  CompileOptions, CompileResult, BundleOptions, BundleResult, ValidateResult, CliCommand,
} from './types'
export { defineManifest, defineApp, useAppStorage, useAppEvents, useAppI18n, hasPermission, createMicronetPlugin, SDK_VERSION } from './helpers'
export { configureLoader, loadApp, loadAppFromString, loadAppFromUrl, loadAppFromBundle, loadAppFromStore, loadEnabledApps, unloadApp, enableApp, disableApp, getApp, getLoadedApps, getEnabledApps, getAppComponent, getAllAppComponents, getAppBundle, isAppLoaded, isAppEnabled, getLoaderConfig, unloadAllApps, registerAppInstance, clearLoadedApps } from './loader'
export { initStore, registerApp, unregisterApp, setAppState, setAppConfig, getAppEntry, getAllEntries, getEntriesByState, getEnabledEntries, enableApp as enableAppInStore, disableApp as disableAppInStore, getStoreConfig, updateStoreConfig, clearStore, importBundle, exportStore, importStore } from './store'
export { compile, compileSFC, compileJS } from './compiler'
export { bundleApp, validateBundle, createProjectScaffold } from './bundler'
export { buildBundle, bundleToString, serializeComponent, createAppTemplate, encodeBundle, decodeBundle, MNAPP_MAGIC, MNAPP_VERSION } from './build'
export { validateManifest, validateId, validateSemver, hashBytes, hashString, normalizePath, joinPath, getExtension, stripExtension, base64Encode, base64Decode, formatSize, timestamp, AppError } from './utils'
export { runCli, commands } from './cli'

// ── Runtime re-exports from @micronet/kernel ──────────────────────────────
// Apps import everything (navigation, gestures, stores, i18n) from the SDK
// rather than reaching into the kernel directly.
export {
  useNavigation,
  useSwipeGestures,
  storage,
  usePhotoStore,
  useCalendarStore,
  useNotesStore,
  useFileStore,
  useBluetooth,
  useKeyboard,
  setLocale,
  getLocale,
  i18n,
  KeyboardView,
} from '@micronet/kernel'

export type {
  ScreenId,
  ScreenMeta,
  NavIntent,
  ScreenRegistration,
  NavRequest,
  Photo,
  PhotoMetadata,
  CalendarEvent,
  Note,
  FileItem,
  FileType,
  BTDevice,
  BTCharacteristic,
  KeyboardLayout,
  KeyboardOptions,
} from '@micronet/kernel'
