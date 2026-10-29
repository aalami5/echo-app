#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(EchoDiagnosticBridge, NSObject)
RCT_EXTERN_METHOD(mark:(NSString *)phase)
RCT_EXTERN_METHOD(storageRead:(NSString *)category phase:(NSString *)phase length:(double)length)
RCT_EXTERN_METHOD(canReadPreview:(NSString *)key resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
