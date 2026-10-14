import UIKit
import ImagePlayground

extension WritingDesk {
    func portraitAvailable()->Bool {
        if #available(iOS 18.2, *) {return ImagePlaygroundViewController.isAvailable}
        return false
    }
    func presentPortrait(id:String,prompt:String){
        guard #available(iOS 18.2, *),ImagePlaygroundViewController.isAvailable else {reply(id,error:"Image Playground is unavailable. Enable Apple Intelligence on a supported device, or upload a portrait.");return}
        guard portraitRequestID==nil,presentedViewController==nil else {reply(id,error:"Finish the current image or file selection first.");return}
        portraitRequestID=id
        let controller=ImagePlaygroundViewController()
        controller.concepts=[.text(String(prompt.prefix(1800)))];controller.delegate=self
        controller.isModalInPresentation=true
        present(controller,animated:true)
    }
}
@available(iOS 18.2, *)
extension WritingDesk:ImagePlaygroundViewController.Delegate {
    func imagePlaygroundViewController(_ viewController:ImagePlaygroundViewController,didCreateImageAt imageURL:URL){
        guard let id=portraitRequestID else {return};portraitRequestID=nil
        defer{viewController.dismiss(animated:true)}
        guard let image=UIImage(contentsOfFile:imageURL.path) else {reply(id,error:"The portrait could not be read. Try again.");return}
        let scale=min(1,512/max(image.size.width,image.size.height)),size=CGSize(width:image.size.width*scale,height:image.size.height*scale)
        let format=UIGraphicsImageRendererFormat();format.scale=1;format.opaque=true
        let small=UIGraphicsImageRenderer(size:size,format:format).image {ctx in UIColor.white.setFill();ctx.fill(CGRect(origin:.zero,size:size));image.draw(in:CGRect(origin:.zero,size:size))}
        guard let data=small.jpegData(compressionQuality:0.82) else {reply(id,error:"The portrait could not be saved.");return}
        reply(id,"data:image/jpeg;base64,"+data.base64EncodedString())
    }
    func imagePlaygroundViewControllerDidCancel(_ viewController:ImagePlaygroundViewController){
        if let id=portraitRequestID{reply(id,NSNull())};portraitRequestID=nil;viewController.dismiss(animated:true)
    }
}
