import { defineManifest, buildBundle, bundleToString } from '..'

const manifest = defineManifest({
  id: 'example-hello',
  name: 'Hello World',
  version: '1.0.0',
  icon: '👋',
  color: '#34c759',
  description: 'A minimal example Micronet app.',
  author: 'Micronet SDK',
  license: 'MIT',
  permissions: [],
  events: {
    'go-back': 'back',
    'go-home': 'home',
  },
})

const componentCode = `
const { h } = require("vue");
const { useNavigation, useAppStorage, useAppI18n, defineManifest } = require("@micronet/sdk");

function setup() {
  const nav = useNavigation();
  const storage = useAppStorage("example-hello");
  const i18n = useAppI18n("example-hello", {
    en: { greeting: "Hello, World!", subtitle: "Welcome to Micronet SDK", tap: "Tap me" },
    zh: { greeting: "你好，世界！", subtitle: "欢迎使用 Micronet SDK", tap: "点击我" },
  });

  const count = { value: 0 };
  const handleClick = () => { count.value++; };

  return function render() {
    return h("div", { class: "hello-screen" }, [
      h("div", { class: "hello-wallpaper" }),
      h("div", { class: "hello-content" }, [
        h("h1", { class: "hello-title" }, i18n.t("greeting")),
        h("p", { class: "hello-subtitle" }, i18n.t("subtitle")),
        h("button", {
          class: "hello-btn",
          onClick: handleClick,
        }, i18n.t("tap") + " (" + count.value + ")"),
        h("button", {
          class: "hello-btn hello-btn-secondary",
          onClick: function() { nav.goBack(); },
        }, "← Back"),
      ]),
    ]);
  };
}

module.exports = { default: { manifest: ${JSON.stringify(manifest)}, component: { name: "HelloScreen", setup: setup } } };
`

const bundle = buildBundle({
  manifest,
  code: componentCode,
  i18n: {
    en: { greeting: 'Hello, World!', subtitle: 'Welcome to Micronet SDK', tap: 'Tap me' },
    zh: { greeting: '你好，世界！', subtitle: '欢迎使用 Micronet SDK', tap: '点击我' },
  },
})

const serialized = bundleToString(bundle)

const STYLE = `
.hello-screen { width: 100%; height: 100%; position: relative; overflow: hidden; user-select: none; }
.hello-wallpaper { position: absolute; inset: 0; background: linear-gradient(135deg, #34c759 0%, #007aff 100%); }
.hello-content { position: relative; z-index: 1; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 20px; }
.hello-title { font-size: 32px; font-weight: 700; color: white; text-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.hello-subtitle { font-size: 16px; color: rgba(255,255,255,0.85); }
.hello-btn { padding: 14px 32px; border-radius: 14px; border: none; font-size: 17px; font-weight: 600; cursor: pointer; background: white; color: #1c1c1e; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.15s ease, box-shadow 0.15s ease; }
.hello-btn:active { transform: scale(0.96); box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
.hello-btn-secondary { background: rgba(255,255,255,0.2); color: white; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
`

export { manifest, componentCode, bundle, serialized, STYLE }
