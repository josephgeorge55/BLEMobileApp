import ExpoModulesCore
import PassKit
import UIKit

public class BladeWalletPassModule: Module {
    public func definition() -> ModuleDefinition {
        Name("BladeWalletPass")

        Function("canAddPasses") { () -> Bool in
            return PKAddPassesViewController.canAddPasses()
        }

        AsyncFunction("addPassFromBase64") { (base64Data: String) -> Bool in
            guard let data = Data(base64Encoded: base64Data) else {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid base64 data"]
                )
            }

            let pass: PKPass
            do {
                pass = try PKPass(data: data)
            } catch {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid pass data: \(error.localizedDescription)"]
                )
            }

            guard PKAddPassesViewController.canAddPasses() else {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "This device cannot add passes to Apple Wallet"]
                )
            }

            return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bool, Error>) in
                DispatchQueue.main.async {
                    guard let addPassVC = PKAddPassesViewController(pass: pass) else {
                        continuation.resume(returning: false)
                        return
                    }

                    guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                          let rootVC = windowScene.windows.first?.rootViewController else {
                        continuation.resume(returning: false)
                        return
                    }

                    var topVC = rootVC
                    while let presented = topVC.presentedViewController {
                        topVC = presented
                    }

                    topVC.present(addPassVC, animated: true) {
                        continuation.resume(returning: true)
                    }
                }
            }
        }

        AsyncFunction("addPassFromUrl") { (urlString: String) -> Bool in
            guard let url = URL(string: urlString) else {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 4,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid URL"]
                )
            }

            let (data, _) = try await URLSession.shared.data(from: url)

            let pass: PKPass
            do {
                pass = try PKPass(data: data)
            } catch {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 5,
                    userInfo: [NSLocalizedDescriptionKey: "Downloaded data is not a valid pass: \(error.localizedDescription)"]
                )
            }

            guard PKAddPassesViewController.canAddPasses() else {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "This device cannot add passes to Apple Wallet"]
                )
            }

            return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bool, Error>) in
                DispatchQueue.main.async {
                    guard let addPassVC = PKAddPassesViewController(pass: pass) else {
                        continuation.resume(returning: false)
                        return
                    }

                    guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                          let rootVC = windowScene.windows.first?.rootViewController else {
                        continuation.resume(returning: false)
                        return
                    }

                    var topVC = rootVC
                    while let presented = topVC.presentedViewController {
                        topVC = presented
                    }

                    topVC.present(addPassVC, animated: true) {
                        continuation.resume(returning: true)
                    }
                }
            }
        }
    }
}
