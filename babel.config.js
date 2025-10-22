const nativewindBabel = require("react-native-css-interop/babel");

module.exports = function (api) {
  api.cache(true);

  const nativewindConfig = nativewindBabel();
  const filteredPlugins = (nativewindConfig.plugins ?? []).filter((plugin) => {
    if (typeof plugin === "string") {
      return plugin !== "react-native-worklets/plugin";
    }
    return true;
  });

  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
    plugins: filteredPlugins,
  };
};
