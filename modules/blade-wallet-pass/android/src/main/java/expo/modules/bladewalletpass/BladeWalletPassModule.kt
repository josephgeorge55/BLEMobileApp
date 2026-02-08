package expo.modules.bladewalletpass

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BladeWalletPassModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("BladeWalletPass")

        Function("canAddPasses") {
            false
        }

        AsyncFunction("addPassFromBase64") { _: String ->
            false
        }

        AsyncFunction("addPassFromUrl") { _: String ->
            false
        }
    }
}
