const { withMainActivity } = require("@expo/config-plugins");

module.exports = function withBackToBackground(config) {
  return withMainActivity(config, (androidConfig) => {
    const source = androidConfig.modResults.contents;
    const method = [
      "  override fun invokeDefaultOnBackPressed() {",
      "    if (!moveTaskToBack(true)) {",
      "      super.invokeDefaultOnBackPressed()",
      "    }",
      "  }",
      "}",
    ].join("\n");

    androidConfig.modResults.contents = source.replace(
      /  override fun invokeDefaultOnBackPressed\(\) \{[\s\S]*?\n  \}\n\}\s*$/,
      method,
    );
    return androidConfig;
  });
};
