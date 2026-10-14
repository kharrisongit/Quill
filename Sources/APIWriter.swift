import Foundation
import Security

// Only user-created connections are accepted. Credentials are kept outside book data.
@MainActor
final class APIWriter {
    private var task: Task<Void,Never>?
    private let service="com.kharrison.quill.model-api"
    private let defaultsKey="QuillAPIConnections"
    private var profiles: [[String:String]] { UserDefaults.standard.array(forKey:defaultsKey) as? [[String:String]] ?? [] }
    private func problem(_ text:String)->NSError { NSError(domain:"Quill.API",code:1,userInfo:[NSLocalizedDescriptionKey:text]) }
    private func query(_ id:String)->[String:Any] { [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:id] }
    private func key(_ id:String)->String? {
        var q=query(id);q[kSecReturnData as String]=true;q[kSecMatchLimit as String]=kSecMatchLimitOne
        var item:CFTypeRef?;guard SecItemCopyMatching(q as CFDictionary,&item)==errSecSuccess,let data=item as? Data else{return nil}
        return String(data:data,encoding:.utf8)
    }
    func list()->[[String:Any]] { profiles.map { p in var result:[String:Any]=p;result["hasKey"]=key(p["id"] ?? "") != nil;return result } }
    func save(_ payload:[String:Any])throws {
        guard let p=payload["profile"] as? [String:String],let id=p["id"],id.range(of:"^api-[a-zA-Z0-9-]{1,80}$",options:.regularExpression) != nil,
              let name=p["name"],!name.isEmpty,name.count<=100,let model=p["model"],!model.isEmpty,model.count<=200,
              let endpoint=p["endpoint"],let url=URL(string:endpoint),url.scheme=="https",url.host != nil,url.user==nil,url.password==nil,url.query==nil,url.fragment==nil,
              ["openai","anthropic"].contains(p["format"] ?? "") else {throw problem("Enter an HTTPS API base URL, model ID, name and supported format.")}
        let old=profiles.first{$0["id"]==id},newKey=payload["key"] as? String ?? ""
        guard newKey.count<=8192 else {throw problem("This API key is too long.")}
        if !newKey.isEmpty {
            let q=query(id),data=Data(newKey.utf8)
            let status=SecItemUpdate(q as CFDictionary,[kSecValueData as String:data] as CFDictionary)
            if status==errSecItemNotFound {
                var item=q;item[kSecValueData as String]=data;item[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
                guard SecItemAdd(item as CFDictionary,nil)==errSecSuccess else {throw problem("Could not save the API key to Keychain.")}
            } else if status != errSecSuccess {throw problem("Could not update the API key.")}
        } else if payload["clearKey"] as? Bool == true || old?["endpoint"] != endpoint {SecItemDelete(query(id) as CFDictionary)}
        let clean=["id":id,"name":name,"model":model,"endpoint":endpoint,"format":p["format"]!]
        UserDefaults.standard.set(profiles.filter{$0["id"] != id}+[clean],forKey:defaultsKey)
    }
    func delete(_ id:String)throws {
        guard task==nil else {throw problem("Stop generation before removing a connection.")}
        let status=SecItemDelete(query(id) as CFDictionary)
        guard status==errSecSuccess || status==errSecItemNotFound else {throw problem("Could not remove the API key.")}
        UserDefaults.standard.set(profiles.filter{$0["id"] != id},forKey:defaultsKey)
    }
    func cancel(){task?.cancel()}
    func generate(_ payload:[String:Any],finish:@escaping(String?,String?)->Void){
        guard task==nil else {finish(nil,"Wait for the previous API request to stop.");return}
        guard let id=payload["id"] as? String,let p=profiles.first(where:{$0["id"]==id}),let endpoint=p["endpoint"],
              let instructions=payload["instructions"] as? String,let prompt=payload["prompt"] as? String,prompt.utf8.count<=24000,instructions.utf8.count<=4000,
              let limit=payload["maxTokens"] as? Int,(1...1200).contains(limit) else {finish(nil,"Choose a saved API connection and valid request.");return}
        let anthropic=p["format"]=="anthropic"
        guard let url=URL(string:endpoint+(anthropic ? "/messages":"/chat/completions")),url.scheme=="https" else {finish(nil,"Use an HTTPS API endpoint.");return}
        var body:[String:Any]=["model":p["model"]!,"max_tokens":limit,"stream":false]
        body["messages"]=anthropic ? [["role":"user","content":prompt]] : [["role":"system","content":instructions],["role":"user","content":prompt]]
        if anthropic {body["system"]=instructions}
        var request=URLRequest(url:url);request.httpMethod="POST";request.timeoutInterval=170;request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        if anthropic {request.setValue("2023-06-01",forHTTPHeaderField:"anthropic-version")}
        if let secret=key(id){request.setValue(anthropic ? secret:"Bearer "+secret,forHTTPHeaderField:anthropic ? "x-api-key":"Authorization")}
        do{request.httpBody=try JSONSerialization.data(withJSONObject:body)}catch{finish(nil,"Invalid request.");return}
        task=Task { [weak self] in
            defer{self?.task=nil}
            let config=URLSessionConfiguration.ephemeral;config.httpShouldSetCookies=false
            let session=URLSession(configuration:config,delegate:NoAPIRedirect(),delegateQueue:nil)
            defer{session.invalidateAndCancel()}
            do {
                let (data,response)=try await session.data(for:request);try Task.checkCancellation()
                guard let http=response as? HTTPURLResponse,(200...299).contains(http.statusCode) else {throw self?.problem("API request failed (\((response as? HTTPURLResponse)?.statusCode ?? 0)). Check the key, model, endpoint and quota in Manage Models.") ?? URLError(.badServerResponse)}
                guard data.count<=2_000_000,let json=try JSONSerialization.jsonObject(with:data) as? [String:Any] else {throw URLError(.cannotParseResponse)}
                let raw:Any?=anthropic ? json["content"] : ((json["choices"] as? [[String:Any]])?.first?["message"] as? [String:Any])?["content"]
                let text=(raw as? String) ?? (raw as? [[String:Any]])?.filter{$0["type"] as? String == "text"}.compactMap{$0["text"] as? String}.joined(separator:"\n") ?? ""
                guard !text.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else {throw self?.problem("The API returned no text. Check the model ID and format.") ?? URLError(.cannotParseResponse)}
                finish(text,nil)
            } catch {finish(nil,Task.isCancelled ? "Writing stopped. Your draft is kept." : error.localizedDescription)}
        }
    }
}
private final class NoAPIRedirect:NSObject,URLSessionTaskDelegate {
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest request:URLRequest,completionHandler:@escaping(URLRequest?)->Void){completionHandler(nil)}
}
