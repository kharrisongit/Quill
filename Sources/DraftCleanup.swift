import Foundation

// Small permanent-deletion markers prevent old backups or offline devices from
// restoring discarded AI drafts. Chapters, books and character cards are excluded.
enum DraftCleanup {
    static func compact(_ records: [[String:Any]]) throws -> [[String:Any]] {
        let fields:Set<String>=["type","book","title","deleted","category","purged","chapter","sourceRevision"]
        var markers:[String:[String:Any]]=[:]
        func invalid() -> NSError { NSError(domain:"Quill",code:3,userInfo:[NSLocalizedDescriptionKey:"Draft deletion does not match its document. Original files are kept."]) }
        for r in records {
            guard let b=r["body"] as? [String:Any],b["purged"] != nil else {continue}
            guard b["purged"] as? Bool == true,b["deleted"] as? Bool == true,b["type"] as? String == "card",
                  ["Generated draft","Codex suggestion"].contains(b["category"] as? String ?? ""),
                  b["title"] as? String == "Deleted draft",let book=b["book"] as? String,!book.isEmpty,
                  Set(b.keys).isSubset(of:fields),(r["parents"] as? [String])?.isEmpty == true,
                  let entity=r["entity"] as? String,let id=r["id"] as? String else {throw invalid()}
            if markers[entity] == nil || id < (markers[entity]?["id"] as? String ?? "") {markers[entity]=r}
        }
        for r in records {
            guard let entity=r["entity"] as? String,let marker=markers[entity],let m=marker["body"] as? [String:Any] else {continue}
            guard let b=r["body"] as? [String:Any],b["type"] as? String == "card",
                  b["category"] as? String == m["category"] as? String,b["book"] as? String == m["book"] as? String else {throw invalid()}
        }
        return records.filter {r in guard let entity=r["entity"] as? String,let marker=markers[entity] else{return true};return r["id"] as? String == marker["id"] as? String}
    }
}
