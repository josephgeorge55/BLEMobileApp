import ExpoModulesCore
import PassKit
import UIKit

public class BladeWalletPassModule: Module {
    public func definition() -> ModuleDefinition {
        Name("BladeWalletPass")

        Function("canAddPasses") { () -> Bool in
            return PKAddPassesViewController.canAddPasses()
        }

        AsyncFunction("addPassFromUrl") { (urlString: String) -> [String: Any] in
            guard let url = URL(string: urlString) else {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid URL: \(urlString)"]
                )
            }

            guard PKAddPassesViewController.canAddPasses() else {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "This device cannot add passes to Apple Wallet"]
                )
            }

            let (data, response) = try await URLSession.shared.data(from: url)

            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode != 200 {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "Server returned status \(httpResponse.statusCode)"]
                )
            }

            if data.isEmpty {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 4,
                    userInfo: [NSLocalizedDescriptionKey: "Downloaded pass data is empty"]
                )
            }

            return try await self.presentPassController(with: data)
        }

        AsyncFunction("addPassFromData") { (base64String: String) -> [String: Any] in
            guard let data = Data(base64Encoded: base64String) else {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 5,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid base64 data"]
                )
            }

            guard PKAddPassesViewController.canAddPasses() else {
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "This device cannot add passes to Apple Wallet"]
                )
            }

            return try await self.presentPassController(with: data)
        }
    }

    private func presentPassController(with data: Data) async throws -> [String: Any] {
        let pass: PKPass
        do {
            pass = try PKPass(data: data)
        } catch {
            throw NSError(
                domain: "BladeWalletPass",
                code: 6,
                userInfo: [NSLocalizedDescriptionKey: "Invalid pass data: \(error.localizedDescription)"]
            )
        }

        let passLibrary = PKPassLibrary()
        if passLibrary.containsPass(pass) {
            return ["presented": true, "alreadyInWallet": true]
        }

        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[String: Any], Error>) in
            DispatchQueue.main.async {
                guard let addPassVC = PKAddPassesViewController(pass: pass) else {
                    continuation.resume(throwing: NSError(
                        domain: "BladeWalletPass",
                        code: 7,
                        userInfo: [NSLocalizedDescriptionKey: "Failed to create PKAddPassesViewController"]
                    ))
                    return
                }

                guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                      let rootVC = windowScene.windows.first?.rootViewController else {
                    continuation.resume(throwing: NSError(
                        domain: "BladeWalletPass",
                        code: 8,
                        userInfo: [NSLocalizedDescriptionKey: "No root view controller found"]
                    ))
                    return
                }

                var topVC = rootVC
                while let presented = topVC.presentedViewController {
                    topVC = presented
                }

                let delegateHandler = WalletPassDelegate(continuation: continuation, passLibrary: passLibrary, pass: pass)
                objc_setAssociatedObject(addPassVC, &WalletPassDelegate.associatedKey, delegateHandler, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
                addPassVC.delegate = delegateHandler

                topVC.present(addPassVC, animated: true)
            }
        }
    }
}

private class WalletPassDelegate: NSObject, PKAddPassesViewControllerDelegate {
    static var associatedKey: UInt8 = 0

    private let continuation: CheckedContinuation<[String: Any], Error>
    private let passLibrary: PKPassLibrary
    private let pass: PKPass
    private var hasResumed = false

    init(continuation: CheckedContinuation<[String: Any], Error>, passLibrary: PKPassLibrary, pass: PKPass) {
        self.continuation = continuation
        self.passLibrary = passLibrary
        self.pass = pass
        super.init()
    }

    func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
        guard !hasResumed else { return }
        hasResumed = true

        let wasAdded = passLibrary.containsPass(pass)

        controller.dismiss(animated: true) { [self] in
            self.continuation.resume(returning: [
                "presented": true,
                "added": wasAdded,
                "alreadyInWallet": false
            ])
        }
    }
}
