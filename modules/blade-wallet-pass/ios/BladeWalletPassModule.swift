import ExpoModulesCore
import PassKit
import UIKit

public class BladeWalletPassModule: Module {
    public func definition() -> ModuleDefinition {
        Name("BladeWalletPass")

        Function("canAddPasses") { () -> Bool in
            let result = PKAddPassesViewController.canAddPasses()
            NSLog("[BladeWalletPass] canAddPasses: %@", result ? "true" : "false")
            return result
        }

        Function("getDebugInfo") { () -> [String: Any] in
            let canAdd = PKAddPassesViewController.canAddPasses()
            let passLibrary = PKPassLibrary()
            let passes = passLibrary.passes()
            var passInfo: [[String: String]] = []
            for p in passes {
                passInfo.append([
                    "serialNumber": p.serialNumber,
                    "passTypeIdentifier": p.passTypeIdentifier,
                    "organizationName": p.organizationName,
                    "localizedDescription": p.localizedDescription
                ])
            }
            return [
                "canAddPasses": canAdd,
                "passCount": passes.count,
                "passes": passInfo,
                "platform": "ios",
                "moduleVersion": "2.0"
            ]
        }

        AsyncFunction("addPassFromUrl") { (urlString: String) -> [String: Any] in
            NSLog("[BladeWalletPass] addPassFromUrl called with: %@", urlString)

            guard let url = URL(string: urlString) else {
                NSLog("[BladeWalletPass] ERROR: Invalid URL")
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid URL: \(urlString)"]
                )
            }

            guard PKAddPassesViewController.canAddPasses() else {
                NSLog("[BladeWalletPass] ERROR: Device cannot add passes")
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "This device cannot add passes to Apple Wallet"]
                )
            }

            NSLog("[BladeWalletPass] Downloading pass data from URL...")
            let (data, response) = try await URLSession.shared.data(from: url)

            if let httpResponse = response as? HTTPURLResponse {
                NSLog("[BladeWalletPass] HTTP status: %d", httpResponse.statusCode)
                NSLog("[BladeWalletPass] Content-Type: %@", httpResponse.value(forHTTPHeaderField: "Content-Type") ?? "unknown")
                NSLog("[BladeWalletPass] Content-Length: %@", httpResponse.value(forHTTPHeaderField: "Content-Length") ?? "unknown")

                if httpResponse.statusCode != 200 {
                    let bodyStr = String(data: data.prefix(500), encoding: .utf8) ?? "non-utf8"
                    NSLog("[BladeWalletPass] ERROR: Server returned %d, body: %@", httpResponse.statusCode, bodyStr)
                    throw NSError(
                        domain: "BladeWalletPass",
                        code: 3,
                        userInfo: [NSLocalizedDescriptionKey: "Server returned status \(httpResponse.statusCode): \(bodyStr)"]
                    )
                }
            }

            NSLog("[BladeWalletPass] Downloaded %d bytes", data.count)

            if data.isEmpty {
                NSLog("[BladeWalletPass] ERROR: Empty data")
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 4,
                    userInfo: [NSLocalizedDescriptionKey: "Downloaded pass data is empty"]
                )
            }

            let isZip = data.count >= 4 && data[0] == 0x50 && data[1] == 0x4B
            NSLog("[BladeWalletPass] Data appears to be ZIP/pkpass: %@", isZip ? "true" : "false")
            if !isZip {
                let preview = String(data: data.prefix(200), encoding: .utf8) ?? "binary"
                NSLog("[BladeWalletPass] WARNING: Data doesn't look like .pkpass. First bytes: %@", preview)
            }

            return try await self.presentPassController(with: data)
        }

        AsyncFunction("addPassFromData") { (base64String: String) -> [String: Any] in
            NSLog("[BladeWalletPass] addPassFromData called, base64 length: %d", base64String.count)

            guard let data = Data(base64Encoded: base64String) else {
                NSLog("[BladeWalletPass] ERROR: Invalid base64 data")
                throw NSError(
                    domain: "BladeWalletPass",
                    code: 5,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid base64 data (length: \(base64String.count))"]
                )
            }

            NSLog("[BladeWalletPass] Decoded %d bytes from base64", data.count)

            guard PKAddPassesViewController.canAddPasses() else {
                NSLog("[BladeWalletPass] ERROR: Device cannot add passes")
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
        NSLog("[BladeWalletPass] presentPassController: parsing %d bytes as PKPass...", data.count)

        let pass: PKPass
        do {
            pass = try PKPass(data: data)
            NSLog("[BladeWalletPass] PKPass created successfully")
            NSLog("[BladeWalletPass]   serialNumber: %@", pass.serialNumber)
            NSLog("[BladeWalletPass]   passTypeIdentifier: %@", pass.passTypeIdentifier)
            NSLog("[BladeWalletPass]   organizationName: %@", pass.organizationName)
            NSLog("[BladeWalletPass]   localizedDescription: %@", pass.localizedDescription)
        } catch {
            NSLog("[BladeWalletPass] ERROR: PKPass init failed: %@", error.localizedDescription)
            NSLog("[BladeWalletPass] ERROR detail: %@", (error as NSError).debugDescription)

            let hexPrefix = data.prefix(16).map { String(format: "%02x", $0) }.joined(separator: " ")
            NSLog("[BladeWalletPass] Data hex prefix: %@", hexPrefix)

            throw NSError(
                domain: "BladeWalletPass",
                code: 6,
                userInfo: [NSLocalizedDescriptionKey: "Invalid pass data: \(error.localizedDescription). Data size: \(data.count) bytes, hex prefix: \(hexPrefix)"]
            )
        }

        let passLibrary = PKPassLibrary()
        if passLibrary.containsPass(pass) {
            NSLog("[BladeWalletPass] Pass already in wallet (serial: %@)", pass.serialNumber)
            return [
                "presented": true,
                "added": false,
                "alreadyInWallet": true,
                "serialNumber": pass.serialNumber,
                "passTypeIdentifier": pass.passTypeIdentifier,
                "debug": "Pass already exists in Apple Wallet"
            ]
        }

        NSLog("[BladeWalletPass] Presenting PKAddPassesViewController...")

        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[String: Any], Error>) in
            DispatchQueue.main.async {
                guard let addPassVC = PKAddPassesViewController(pass: pass) else {
                    NSLog("[BladeWalletPass] ERROR: Failed to create PKAddPassesViewController")
                    continuation.resume(throwing: NSError(
                        domain: "BladeWalletPass",
                        code: 7,
                        userInfo: [NSLocalizedDescriptionKey: "Failed to create PKAddPassesViewController. This may indicate the pass is invalid or the device doesn't support this pass type."]
                    ))
                    return
                }

                guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                      let rootVC = windowScene.windows.first?.rootViewController else {
                    NSLog("[BladeWalletPass] ERROR: No root view controller found")
                    continuation.resume(throwing: NSError(
                        domain: "BladeWalletPass",
                        code: 8,
                        userInfo: [NSLocalizedDescriptionKey: "No root view controller found to present pass"]
                    ))
                    return
                }

                var topVC = rootVC
                while let presented = topVC.presentedViewController {
                    topVC = presented
                }

                NSLog("[BladeWalletPass] Presenting on top VC: %@", String(describing: type(of: topVC)))

                let delegateHandler = WalletPassDelegate(
                    continuation: continuation,
                    passLibrary: passLibrary,
                    pass: pass
                )
                objc_setAssociatedObject(
                    addPassVC,
                    &WalletPassDelegate.associatedKey,
                    delegateHandler,
                    .OBJC_ASSOCIATION_RETAIN_NONATOMIC
                )
                addPassVC.delegate = delegateHandler

                topVC.present(addPassVC, animated: true) {
                    NSLog("[BladeWalletPass] PKAddPassesViewController presented successfully")
                }
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
        NSLog("[BladeWalletPass] WalletPassDelegate initialized for pass: %@", pass.serialNumber)
    }

    func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
        NSLog("[BladeWalletPass] addPassesViewControllerDidFinish called")

        guard !hasResumed else {
            NSLog("[BladeWalletPass] WARNING: Delegate already resumed, ignoring duplicate call")
            return
        }
        hasResumed = true

        let wasAdded = passLibrary.containsPass(pass)
        NSLog("[BladeWalletPass] Pass was added: %@", wasAdded ? "true" : "false")

        controller.dismiss(animated: true) { [self] in
            NSLog("[BladeWalletPass] PKAddPassesViewController dismissed, returning result")
            self.continuation.resume(returning: [
                "presented": true,
                "added": wasAdded,
                "alreadyInWallet": false,
                "serialNumber": self.pass.serialNumber,
                "passTypeIdentifier": self.pass.passTypeIdentifier,
                "debug": wasAdded ? "User tapped Add" : "User cancelled/dismissed"
            ])
        }
    }

    deinit {
        NSLog("[BladeWalletPass] WalletPassDelegate deinit for pass: %@", pass.serialNumber)
        if !hasResumed {
            NSLog("[BladeWalletPass] WARNING: Delegate deallocated without resuming! Resuming with error")
            continuation.resume(throwing: NSError(
                domain: "BladeWalletPass",
                code: 9,
                userInfo: [NSLocalizedDescriptionKey: "Pass controller was dismissed unexpectedly"]
            ))
        }
    }
}
