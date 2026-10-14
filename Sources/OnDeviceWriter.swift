import Foundation
import FoundationModels
import UIKit

@MainActor
final class OnDeviceWriter {
    private var task: Task<Void, Never>?
    private let qwen=QwenWriter()
    func availability(model: String = "apple") -> [String: Any] {
        if model.hasPrefix("qwen-") {
            guard ["qwen-0.6","qwen-1.7"].contains(model) else { return ["available":false,"message":"Choose a supported Qwen model."] }
            let minimum: UInt64 = model == "qwen-1.7" ? 5_000_000_000 : 2_500_000_000
            guard ProcessInfo.processInfo.physicalMemory>=minimum else { return ["available":false,"message":"This model needs more memory than this device has. Try Qwen 0.6B or Apple Intelligence."] }
            return ["available":true,"message":"Qwen runs on this device. First use downloads roughly \(model == "qwen-1.7" ? "1 GB" : "400 MB"). No account or usage charge. Once installed, it works offline."]
        }
        guard #available(iOS 26.0, *) else {
            return ["available": false, "message": "Apple Intelligence needs iOS 26 or later on a supported device. Choose Qwen to try local writing on this device."]
        }
        switch SystemLanguageModel.default.availability {
        case .available:
            return ["available": true, "message": "Ready · free on-device writing. Your story stays on this device."]
        case .unavailable(.deviceNotEligible):
            return ["available": false, "message": "This device does not support Apple Intelligence. You can still edit chapters and plot beats here."]
        case .unavailable(.appleIntelligenceNotEnabled):
            return ["available": false, "message": "Turn on Apple Intelligence in Settings → Apple Intelligence & Siri, then check again."]
        case .unavailable(.modelNotReady):
            return ["available": false, "message": "Apple’s on-device model is not ready. Connect to Wi-Fi and power, let Apple Intelligence finish downloading, then check again."]
        case .unavailable:
            return ["available": false, "message": "Apple Intelligence is currently unavailable for this device, language or region. Check Settings and try again."]
        }
    }
    func checkUpdate(model:String,finish:@escaping([String:Any]?,String?)->Void) {
        Task { do { finish(try await qwen.checkUpdate(model),nil) } catch { finish(nil,error.localizedDescription) } }
    }
    func update(model:String,status:@escaping(String)->Void,finish:@escaping(String?,String?)->Void) {
        guard task == nil else {finish(nil,"Stop the current writing job first.");return}
        let state=availability(model:model)
        guard model.hasPrefix("qwen-"),state["available"] as? Bool == true else {finish(nil,state["message"] as? String ?? "Choose a Qwen model.");return}
        UIApplication.shared.isIdleTimerDisabled=true
        task=Task { [weak self] in
            defer { self?.task=nil;UIApplication.shared.isIdleTimerDisabled=false }
            do {
                guard let self else {throw CancellationError()}
                _=try await self.qwen.load(model,update:true,status:{ text in Task { @MainActor in status(text) } })
                try Task.checkCancellation();finish("Qwen is installed and up to date.",nil)
            } catch {finish(nil,Task.isCancelled ? "Download stopped. Your installed Qwen version is kept." : error.localizedDescription)}
        }
    }
    func cancel() { task?.cancel() }
    func generate(id: String, payload: [String: Any], status: @escaping (String) -> Void, progress: @escaping (String) -> Void, finish: @escaping (String?, String?) -> Void) {
        guard task == nil else { finish(nil,"The writer is still finishing another request. Try again in a moment."); return }
        let model=payload["model"] as? String ?? "apple"
        let state=availability(model:model)
        guard state["available"] as? Bool == true else { finish(nil,state["message"] as? String); return }
        guard let prompt=payload["prompt"] as? String, let instructions=payload["instructions"] as? String,
              !prompt.isEmpty, prompt.utf8.count<=24000, instructions.utf8.count<=4000,
              let maxTokens=payload["maxTokens"] as? Int, (100...1200).contains(maxTokens) else {
            finish(nil,"The chapter request is too large or invalid. Shorten the prompt and try again."); return
        }
        UIApplication.shared.isIdleTimerDisabled=true
        task=Task { [weak self] in
            defer { self?.task=nil; UIApplication.shared.isIdleTimerDisabled=false }
            do {
                try Task.checkCancellation()
                guard let self else { throw CancellationError() }
                if model.hasPrefix("qwen-") {
                    let text=try await self.qwen.generate(model:model,instructions:instructions,prompt:prompt,maxTokens:maxTokens,status:{ text in Task { @MainActor in status(text) } },progress:{ text in Task { @MainActor in progress(text) } })
                    try Task.checkCancellation();finish(text,nil);return
                }
                await self.qwen.release()
                guard #available(iOS 26.0, *) else { finish(nil,"Apple Intelligence requires iOS 26 or later.");return }
                // A fresh session for each bounded summary or scene avoids accumulating a novel in one context window.
                let session=LanguageModelSession(model: SystemLanguageModel.default, instructions: instructions)
                var options=GenerationOptions()
                options.temperature=0.75
                options.maximumResponseTokens=maxTokens
                var text="", lastUpdate=Date.distantPast
                let stream=session.streamResponse(to: prompt, options: options)
                for try await snapshot in stream {
                    try Task.checkCancellation()
                    text=snapshot.content
                    if Date().timeIntervalSince(lastUpdate)>0.15 { progress(text); lastUpdate=Date() }
                }
                try Task.checkCancellation()
                progress(text);finish(text,nil)
            } catch is CancellationError {
                finish(nil,"Writing stopped. Your saved draft is kept.")
            } catch {
                if Task.isCancelled { finish(nil,"Writing stopped. Your saved draft is kept."); return }
                var message="The on-device writer could not finish: \(error.localizedDescription) Your saved draft is kept."
                if #available(iOS 26.0, *) {
                    switch error {
                    case LanguageModelSession.GenerationError.exceededContextWindowSize:
                        message="The request exceeded the writer’s context limit. Shorten the chapter prompt or plot notes. Your draft is kept."
                    case LanguageModelSession.GenerationError.guardrailViolation:
                        message="Apple’s on-device model declined this request. Try adjusting the prompt or choosing Qwen. Your saved draft is kept."
                    case LanguageModelSession.GenerationError.unsupportedLanguageOrLocale:
                        message="Apple’s writer does not support this language or region. Try Qwen. Your saved draft is kept."
                    default: break
                    }
                }
                finish(nil,message)
            }
        }
    }
}
