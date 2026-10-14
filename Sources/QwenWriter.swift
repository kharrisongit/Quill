import Foundation
import Hub
import MLX
import MLXLLM
import MLXLMCommon

// Model weights live outside manuscript storage and are not included in book backups.
actor QwenWriter {
    private var container: ModelContainer?
    private var loadedKey: String?
    private func repository(_ model: String) throws -> String {
        switch model {
        case "qwen-0.6": return "mlx-community/Qwen3-0.6B-4bit"
        case "qwen-1.7": return "mlx-community/Qwen3-1.7B-4bit"
        default: throw problem("Choose a supported Qwen model.")
        }
    }
    private func problem(_ message: String) -> NSError { NSError(domain:"Quill.Qwen",code:1,userInfo:[NSLocalizedDescriptionKey:message]) }
    private func savedRevision(_ model: String) -> String? { UserDefaults.standard.string(forKey:"QwenRevision-"+model) }
    private func hub(_ model: String, _ revision: String) throws -> HubApi {
        var base=try FileManager.default.url(for:.applicationSupportDirectory,in:.userDomainMask,appropriateFor:nil,create:true)
            .appendingPathComponent("QuillModels").appendingPathComponent(model).appendingPathComponent(revision)
        try FileManager.default.createDirectory(at:base,withIntermediateDirectories:true)
        var values=URLResourceValues();values.isExcludedFromBackup=true;try base.setResourceValues(values)
        return HubApi(downloadBase:base)
    }
    private func latest(_ model: String) async throws -> String {
        let repo=try repository(model)
        var request=URLRequest(url:URL(string:"https://huggingface.co/api/models/"+repo)!)
        request.timeoutInterval=30;request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data,response)=try await URLSession.shared.data(for:request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let object=try JSONSerialization.jsonObject(with:data) as? [String:Any],let sha=object["sha"] as? String,
              sha.range(of:"^[a-f0-9]{40}$",options:.regularExpression) != nil else {
            throw problem("Could not check Qwen’s model repository. Your installed version is kept.")
        }
        return sha
    }
    func checkUpdate(_ model: String) async throws -> [String:Any] {
        let newest=try await latest(model),installed=savedRevision(model)
        return ["available":installed != newest,"installed":installed ?? "","latest":newest,
                "message":installed == newest ? "This Qwen model is up to date (\(newest.prefix(8)))." : installed == nil ? "Qwen is ready for its first download." : "A Qwen model update is available (\(newest.prefix(8))). Your working version stays installed until the update succeeds."]
    }
    func load(_ model: String, update: Bool = false, status: @escaping @Sendable (String) -> Void) async throws -> ModelContainer {
        let repo=try repository(model),installed=savedRevision(model)
        let revision: String
        if update || installed == nil { revision=try await latest(model) } else { revision=installed! }
        let key=model+revision
        if loadedKey == key,let container { return container }
        let hub=try hub(model,revision),folder=hub.localRepoLocation(Hub.Repo(id:repo))
        // Only the version being loaded is held in memory. Failed updates keep the old files and active pointer.
        container=nil;loadedKey=nil;GPU.set(cacheLimit:16*1024*1024);GPU.clearCache()
        let config: ModelConfiguration
        if revision == installed && FileManager.default.fileExists(atPath:folder.appendingPathComponent("config.json").path) {
            status("Loading installed Qwen model…");config=ModelConfiguration(directory:folder)
        } else {
            status("Downloading Qwen · keep Quill open…")
            config=ModelConfiguration(id:repo,revision:revision)
        }
        try Task.checkCancellation()
        let loaded=try await LLMModelFactory.shared.loadContainer(hub:hub,configuration:config,progressHandler:{ progress in
            status("Downloading Qwen · \(Int(progress.fractionCompleted*100))%")
        })
        try Task.checkCancellation()
        container=loaded;loadedKey=key
        UserDefaults.standard.set(revision,forKey:"QwenRevision-"+model)
        status("Qwen ready · version \(revision.prefix(8))")
        return loaded
    }
    func release() { container=nil;loadedKey=nil;GPU.clearCache() }
    func generate(model: String, instructions: String, prompt: String, maxTokens: Int,
                  status: @escaping @Sendable (String) -> Void,
                  progress: @escaping @Sendable (String) -> Void) async throws -> String {
        let loaded=try await load(model,status:status)
        let stream=try await loaded.perform { context in
            let input=try await context.processor.prepare(input:UserInput(chat:[.system(instructions),.user(prompt)],additionalContext:["enable_thinking":false]))
            guard input.text.tokens.size+maxTokens<=8192 else { throw NSError(domain:"Quill.Qwen",code:2,userInfo:[NSLocalizedDescriptionKey:"This request is too long. Shorten the chapter prompt or plot notes."]) }
            return try MLXLMCommon.generate(input:input,parameters:GenerateParameters(maxTokens:maxTokens,maxKVSize:8192,temperature:0.75,topP:0.8,repetitionPenalty:1.05,prefillStepSize:128),context:context)
        }
        var text="",lastUpdate=Date.distantPast
        for await item in stream {
            try Task.checkCancellation()
            if let chunk=item.chunk { text+=chunk }
            if Date().timeIntervalSince(lastUpdate)>0.15 { progress(text);lastUpdate=Date() }
        }
        try Task.checkCancellation();progress(text);return text
    }
}
