import UIKit
import WebKit
import UniformTypeIdentifiers

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let w=UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController=WritingDesk(); w.makeKeyAndVisible(); window=w
        return true
    }
    func applicationDidEnterBackground(_ application: UIApplication) {
        (window?.rootViewController as? WritingDesk)?.writer.cancel()
        (window?.rootViewController as? WritingDesk)?.apiWriter.cancel()
    }
    func applicationWillResignActive(_ application: UIApplication) {
        (window?.rootViewController as? WritingDesk)?.web.evaluateJavaScript("window.quillFlush && window.quillFlush()", completionHandler:nil)
    }
}

final class WritingDesk: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, UIDocumentPickerDelegate {
    var web: WKWebView!
    let writer=OnDeviceWriter()
    let apiWriter=APIWriter()
    var portraitRequestID:String?
    private let io=DispatchQueue(label:"com.kharrison.quill.files",qos:.userInitiated)
    private var root: URL!
    private var folder: URL?
    private var scoped=false
    private var pending: (String,String)?
    private var initialError: String?
    private var syncing=false
    private let files=FileManager.default
    private var webRoot: URL { Bundle.main.bundleURL.appendingPathComponent("Web",isDirectory:true) }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor=UIColor(red:0.97,green:0.96,blue:0.94,alpha:1)
        do {
            root=try files.url(for:.applicationSupportDirectory,in:.userDomainMask,appropriateFor:nil,create:true).appendingPathComponent("QuillRevisions",isDirectory:true)
            try files.createDirectory(at:root,withIntermediateDirectories:true)
        } catch { initialError=error.localizedDescription }
        if let data=UserDefaults.standard.data(forKey:"QuillFolder") {
            do {
                var stale=false
                let url=try URL(resolvingBookmarkData:data,options:[],relativeTo:nil,bookmarkDataIsStale:&stale)
                scoped=url.startAccessingSecurityScopedResource();folder=url
                if stale { try remember(url) }
            } catch { /* Local writing remains available; reconnect in Settings. */ }
        }
        let config=WKWebViewConfiguration()
        config.userContentController.add(self,name:"quill")
        config.websiteDataStore = .default()
        web=WKWebView(frame:.zero,configuration:config)
        web.navigationDelegate=self
        web.isOpaque=false;web.backgroundColor=view.backgroundColor
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints=false
        view.addSubview(web)
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor),web.bottomAnchor.constraint(equalTo:view.safeAreaLayoutGuide.bottomAnchor),web.leadingAnchor.constraint(equalTo:view.leadingAnchor),web.trailingAnchor.constraint(equalTo:view.trailingAnchor)])
        web.loadFileURL(webRoot.appendingPathComponent("index.html"),allowingReadAccessTo:webRoot)
    }
    func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void) {
        guard let url=navigationAction.request.url else { decisionHandler(.cancel);return }
        if url.isFileURL && url.standardizedFileURL.path.hasPrefix(webRoot.standardizedFileURL.path+"/") { decisionHandler(.allow) }
        else { decisionHandler(.cancel);if navigationAction.navigationType == .linkActivated && url.scheme == "https" { UIApplication.shared.open(url) } }
    }
    func reply(_ id:String,_ result:Any=NSNull(),error:String?=nil) {
        DispatchQueue.main.async {
            let body:[String:Any]=["id":id,"result":result,"error":error as Any? ?? NSNull()]
            guard let data=try? JSONSerialization.data(withJSONObject:body,options:[.fragmentsAllowed]),let json=String(data:data,encoding:.utf8) else {return}
            self.web.evaluateJavaScript("window.quillReply(\(json))",completionHandler:nil)
        }
    }
    private func writerProgress(_ id:String,status:String) {
        guard let data=try? JSONSerialization.data(withJSONObject:["id":id,"status":status]),let json=String(data:data,encoding:.utf8) else{return}
        web.evaluateJavaScript("window.quillProgress && window.quillProgress(\(json))",completionHandler:nil)
    }
    private func problem(_ text:String)->NSError { NSError(domain:"Quill",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    private func validID(_ id:String)->Bool { id.range(of:"^[a-zA-Z0-9-]{1,80}$",options:.regularExpression) != nil }
    private func record(_ raw:Any)throws -> (String,Data) {
        guard let r=raw as? [String:Any],let id=r["id"] as? String, validID(id),let entity=r["entity"] as? String,validID(entity),r["schema"] as? Int == 1,let parents=r["parents"] as? [String],parents.allSatisfy({validID($0)&&$0 != id}),let body=r["body"] as? [String:Any],let type=body["type"] as? String,["book","chapter","card"].contains(type),body["title"] is String,body["deleted"] is Bool else { throw problem("An invalid revision was kept unchanged. Import a valid Quill backup.") }
        let data=try JSONSerialization.data(withJSONObject:r,options:[.sortedKeys])
        guard data.count<=5_000_000 else {throw problem("This chapter is too large.")}
        return (id,data)
    }
    private func readRecords(_ dir:URL)throws -> [[String:Any]] {
        try files.contentsOfDirectory(at:dir,includingPropertiesForKeys:[.fileSizeKey,.isSymbolicLinkKey]).filter{$0.pathExtension=="json"}.map{url in
            let info=try url.resourceValues(forKeys:[.fileSizeKey,.isSymbolicLinkKey])
            guard info.isSymbolicLink != true,(info.fileSize ?? 0)<=5_000_000 else {throw problem("A saved file cannot be safely read. Original files are kept.")}
            let object=try JSONSerialization.jsonObject(with:Data(contentsOf:url))
            let (id,_)=try record(object)
            guard url.lastPathComponent == id+".json" else {throw problem("A saved filename needs attention.")}
            return object as! [String:Any]
        }
    }
    private func writeRecords(_ records:[Any],to dir:URL)throws {
        let checked=try records.map{try record($0)}
        // Validate collisions before writing any of the batch.
        for(id,data) in checked {let url=dir.appendingPathComponent(id+".json");if files.fileExists(atPath:url.path){let previous=try JSONSerialization.jsonObject(with:Data(contentsOf:url));let (_,canonical)=try record(previous);guard canonical==data else {throw problem("A revision identifier conflicts. Both files have been left unchanged.")}}}
        for(id,data) in checked {let url=dir.appendingPathComponent(id+".json");if !files.fileExists(atPath:url.path){try data.write(to:url,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])}}
    }
    func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage) {
        guard message.frameInfo.isMainFrame,let url=message.frameInfo.request.url,url.isFileURL,url.standardizedFileURL.path.hasPrefix(webRoot.standardizedFileURL.path+"/"),let data=message.body as? [String:Any],let id=data["id"] as? String,let action=data["action"] as? String else {return}
        let p=data["payload"] as? [String:Any] ?? [:]
        switch action {
        case "portraitStatus": reply(id,portraitAvailable())
        case "portraitGenerate": presentPortrait(id:id,prompt:p["prompt"] as? String ?? "Fictional character portrait")
        case "apiProfiles": reply(id,apiWriter.list())
        case "apiSave": do{try apiWriter.save(p);reply(id,true)}catch{reply(id,error:error.localizedDescription)}
        case "apiDelete": do{try apiWriter.delete(p["id"] as? String ?? "");reply(id,true)}catch{reply(id,error:error.localizedDescription)}
        case "apiCancel": apiWriter.cancel();reply(id,true)
        case "apiGenerate": apiWriter.generate(p,finish:{[weak self] text,error in self?.reply(id,text as Any? ?? NSNull(),error:error)})
        case "aiModels": writer.modelStorage(finish:{[weak self] rows,error in self?.reply(id,rows as Any? ?? NSNull(),error:error)})
        case "aiDeleteModel": writer.deleteModel(p["model"] as? String ?? "",finish:{[weak self] error in self?.reply(id,error==nil,error:error)})
        case "aiStatus": reply(id,writer.availability(model:p["model"] as? String ?? "apple"))
        case "aiCheckUpdate": writer.checkUpdate(model:p["model"] as? String ?? "",finish:{[weak self] result,error in self?.reply(id,result as Any? ?? NSNull(),error:error)})
        case "aiUpdate": writer.update(model:p["model"] as? String ?? "",status:{[weak self] text in self?.writerProgress(id,status:text)},finish:{[weak self] result,error in self?.reply(id,result as Any? ?? NSNull(),error:error)})
        case "aiCancel": writer.cancel();reply(id,true)
        case "aiGenerate":
            writer.generate(id:id,payload:p,status:{[weak self] text in self?.writerProgress(id,status:text)},progress:{[weak self] text in
                guard let self,let data=try? JSONSerialization.data(withJSONObject:["id":id,"text":text]),let json=String(data:data,encoding:.utf8) else{return}
                self.web.evaluateJavaScript("window.quillProgress && window.quillProgress(\(json))",completionHandler:nil)
            },finish:{[weak self] text,error in self?.reply(id,text as Any? ?? NSNull(),error:error)})
        case "load":
            if let initialError {reply(id,error:initialError);return}
            io.async {do{self.reply(id,try self.readRecords(self.root))}catch{self.reply(id,error:error.localizedDescription)}}
        case "save":
            guard let records=p["records"] as? [Any],root != nil else {reply(id,error:"Local storage is unavailable.");return}
            io.async {do{try self.writeRecords(records,to:self.root);self.reply(id,true)}catch{self.reply(id,error:error.localizedDescription)}}
        case "connect","import":
            guard pending==nil,!syncing else {reply(id,error:"Finish the current file operation first.");return}
            pending=(id,action)
            let picker=UIDocumentPickerViewController(forOpeningContentTypes:action=="connect" ? [.folder]:[.json],asCopy:action != "connect")
            picker.delegate=self;picker.allowsMultipleSelection=false
            present(picker,animated:true)
        case "disconnect":
            guard !syncing else {reply(id,error:"Wait for sync to finish.");return}
            if scoped {folder?.stopAccessingSecurityScopedResource()};folder=nil;scoped=false
            UserDefaults.standard.removeObject(forKey:"QuillFolder");reply(id,true)
        case "sync":
            guard !syncing,let folder,root != nil else {reply(id,error:"Choose your iCloud Drive folder in Settings first, or wait for the current sync.");return}
            syncing=true
            io.async {
                var incoming:[[String:Any]]=[];var operationError:Error?;var coordinateError:NSError?
                NSFileCoordinator().coordinate(writingItemAt:folder,options:.forMerging,error:&coordinateError){url in
                    do {
                        let dir=url.appendingPathComponent("Quill-revisions",isDirectory:true)
                        try self.files.createDirectory(at:dir,withIntermediateDirectories:true)
                        incoming=try self.readRecords(dir)
                        let local=try self.readRecords(self.root)
                        // Remote revisions are returned to JavaScript for graph validation before local import.
                        let known=Dictionary(uniqueKeysWithValues:try incoming.map{try self.record($0)})
                        for r in local {let(k,d)=try self.record(r);if let previous=known[k],previous != d {throw self.problem("A sync revision conflicts. Files are unchanged.")}}
                        try self.writeRecords(local,to:dir)
                    }catch{operationError=error}
                }
                let err=operationError ?? coordinateError
                DispatchQueue.main.async {self.syncing=false;self.reply(id,incoming,error:err?.localizedDescription)}
            }
        case "export":
            guard let rawName=p["name"] as? String,let b64=p["data"] as? String,b64.count<150_000_000,let bytes=Data(base64Encoded:b64) else {reply(id,error:"Invalid export.");return}
            let name=URL(fileURLWithPath:rawName).lastPathComponent
            guard !name.isEmpty,name != ".",name != ".." else {reply(id,error:"Invalid filename.");return}
            do {let dir=files.temporaryDirectory.appendingPathComponent(UUID().uuidString,isDirectory:true);try files.createDirectory(at:dir,withIntermediateDirectories:true);let out=dir.appendingPathComponent(name);try bytes.write(to:out,options:.atomic);let share=UIActivityViewController(activityItems:[out],applicationActivities:nil);share.popoverPresentationController?.sourceView=view;share.popoverPresentationController?.sourceRect=CGRect(x:view.bounds.midX,y:view.bounds.midY,width:1,height:1);present(share,animated:true);reply(id,true)}catch{reply(id,error:error.localizedDescription)}
        case "print":
            guard let html=p["html"] as? String,html.utf8.count<100_000_000 else {reply(id,error:"Invalid manuscript.");return}
            let printController=UIPrintInteractionController.shared
            printController.printFormatter=UIMarkupTextPrintFormatter(markupText:html)
            let info=UIPrintInfo(dictionary:nil);info.outputType = .general;info.jobName="Quill manuscript";printController.printInfo=info
            printController.present(animated:true,completionHandler:nil);reply(id,true)
        case "ready":
            if ProcessInfo.processInfo.arguments.contains("--smoke-test"),let root {try? "ready".write(to:root.deletingLastPathComponent().appendingPathComponent("quill-ready.txt"),atomically:true,encoding:.utf8)}
            reply(id,["connected":folder != nil])
        default: reply(id,error:"Unknown action.")
        }
    }
    private func remember(_ url:URL)throws {UserDefaults.standard.set(try url.bookmarkData(options:.minimalBookmark,includingResourceValuesForKeys:nil,relativeTo:nil),forKey:"QuillFolder")}
    func documentPicker(_ controller:UIDocumentPickerViewController,didPickDocumentsAt urls:[URL]) {
        guard let(id,action)=pending,let url=urls.first else{return};pending=nil
        let access=url.startAccessingSecurityScopedResource()
        if action=="connect" {
            do{try remember(url);if scoped{folder?.stopAccessingSecurityScopedResource()};folder=url;scoped=access;reply(id,url.lastPathComponent)}catch{if access{url.stopAccessingSecurityScopedResource()};reply(id,error:error.localizedDescription)}
        }else{
            io.async{defer{if access{url.stopAccessingSecurityScopedResource()}};do{let size=try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0;guard size<100_000_000 else{throw self.problem("This backup exceeds 100 MB.")};let text=try String(contentsOf:url,encoding:.utf8);self.reply(id,text)}catch{self.reply(id,error:error.localizedDescription)}}
        }
    }
    func documentPickerWasCancelled(_ controller:UIDocumentPickerViewController){if let(id,_)=pending{reply(id,error:"File selection cancelled.")};pending=nil}
}
